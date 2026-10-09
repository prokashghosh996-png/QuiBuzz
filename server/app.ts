import express from 'express';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import { db } from './db.js';
import { command, createDemo, createQuiz, getQuiz, HttpError } from './service.js';
import { auth, requireSession } from './auth.js';
import { defaultDraft, type Draft } from '../shared/types.js';
export const app = express();
app.disable('x-powered-by');
// Render terminates TLS before forwarding to this service. Never trust an
// arbitrary forwarded IP for auth throttling; socket IP is conservative.
app.use(express.json({ limit: '1mb' }));
app.use('/api', (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  if (req.method !== 'GET') {
    // Cookies require same-origin/CSRF protection, including login and signup.
    if (!req.is('application/json'))
      return res.status(415).json({ error: 'Use application/json.' });
    const origin = req.get('origin');
    if (req.get('sec-fetch-site') && !['same-origin', 'none'].includes(req.get('sec-fetch-site')!))
      return res.status(403).json({ error: 'Cross-origin changes are not allowed.' });
    // Vite/reverse proxies may rewrite Host. Browsers supply an unforgeable
    // fetch-metadata header for same-origin requests to the frontend proxy.
    if (
      origin &&
      new URL(origin).host !== req.get('host') &&
      req.get('sec-fetch-site') !== 'same-origin'
    )
      return res.status(403).json({ error: 'Cross-origin changes are not allowed.' });
  }
  next();
});
app.get('/api/health', async (_req, res) => {
  await db.$queryRaw`SELECT 1`;
  res.json({ ok: true, serverTime: Date.now(), authentication: 'accounts' });
});
app.use('/api/auth', auth);
app.get('/api/projector/:id', async (req, res) => {
  const quiz = await getQuiz(req.params.id);
  const draft = quiz.draft as unknown as Draft;
  // Public audience data excludes private setup and audit reasons.
  res.json({
    ...quiz,
    ownerId: undefined,
    draft: {
      ...defaultDraft(),
      rounds: draft.rounds.map((round) => ({
        name: round.name,
        questions: round.questions,
        master: round.master,
      })),
    },
    events: quiz.events.map((event) => ({ ...event, reason: '', voidReason: null })),
  });
});
app.use('/api/quizzes', requireSession);
app.use('/api/demo', requireSession);
app.get('/api/quizzes', async (_req, res) =>
  res.json(
    await db.quiz.findMany({
      where: { ownerId: res.locals.userId },
      select: {
        id: true,
        name: true,
        master: true,
        status: true,
        updatedAt: true,
        _count: { select: { teams: true, rounds: true } },
      },
      orderBy: { updatedAt: 'desc' },
    }),
  ),
);
app.post('/api/quizzes', async (_req, res) =>
  res.status(201).json(await createQuiz(undefined, res.locals.userId)),
);
app.post('/api/demo', async (_req, res) =>
  res.status(201).json(await createDemo(res.locals.userId)),
);
app.get('/api/quizzes/:id', async (req, res) =>
  res.json(await getQuiz(req.params.id, res.locals.userId)),
);
app.post('/api/quizzes/:id/commands', async (req, res) =>
  res.json(await command(req.params.id, req.body, res.locals.userId)),
);
app.delete('/api/quizzes/:id', async (req, res) => {
  await getQuiz(req.params.id, res.locals.userId);
  if (req.body.confirmed !== true || !Number.isInteger(req.body.version))
    throw new HttpError(400, 'Confirm deletion and provide the current version.');
  const result = await db.quiz.deleteMany({
    where: { id: req.params.id, ownerId: res.locals.userId, version: req.body.version },
  });
  if (!result.count) throw new HttpError(409, 'Quiz changed. Refresh before deleting.');
  res.json({ ok: true });
});
app.use('/api', (_req, res) => res.status(404).json({ error: 'API endpoint not found.' }));
const dist = path.resolve('dist');
if (existsSync(dist)) {
  app.use(express.static(dist));
  app.get('/{*path}', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}
app.use(
  (error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (error instanceof ZodError)
      return res
        .status(400)
        .json({ error: error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(' ') });
    if (error instanceof HttpError) return res.status(error.status).json({ error: error.message });
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
      return res
        .status(409)
        .json({ error: 'This request conflicts with an existing entry. Refresh and try again.' });
    console.error(error);
    res.status(503).json({
      error:
        'The database is unavailable. Your action has not been confirmed. Reconnect and retry safely.',
    });
  },
);
