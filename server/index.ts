import express from 'express';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import { db } from './db.js';
import { command, createDemo, createQuiz, getQuiz, HttpError } from './service.js';
const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));
app.use('/api', (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  if (req.method !== 'GET') {
    // Require JSON and reject cross-origin browser mutations, even without an operator key.
    if (!req.is('application/json'))
      return res.status(415).json({ error: 'Use application/json.' });
    const origin = req.get('origin');
    // Vite/reverse proxies may rewrite Host. Browsers supply an unforgeable
    // fetch-metadata header for same-origin requests to the frontend proxy.
    if (
      origin &&
      new URL(origin).host !== req.get('host') &&
      req.get('sec-fetch-site') !== 'same-origin'
    )
      return res.status(403).json({ error: 'Cross-origin changes are not allowed.' });
    if (process.env.OPERATOR_KEY && req.get('x-operator-key') !== process.env.OPERATOR_KEY)
      return res.status(401).json({ error: 'Enter the operator key to make changes.' });
  }
  next();
});
app.get('/api/health', async (_req, res) => {
  await db.$queryRaw`SELECT 1`;
  res.json({ ok: true, serverTime: Date.now(), operatorKeyRequired: !!process.env.OPERATOR_KEY });
});
app.get('/api/quizzes', async (_req, res) =>
  res.json(
    await db.quiz.findMany({
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
app.post('/api/quizzes', async (_req, res) => res.status(201).json(await createQuiz()));
app.post('/api/demo', async (_req, res) => res.status(201).json(await createDemo()));
app.get('/api/quizzes/:id', async (req, res) => res.json(await getQuiz(req.params.id)));
app.post('/api/quizzes/:id/commands', async (req, res) =>
  res.json(await command(req.params.id, req.body)),
);
app.delete('/api/quizzes/:id', async (req, res) => {
  if (req.body.confirmed !== true || !Number.isInteger(req.body.version))
    throw new HttpError(400, 'Confirm deletion and provide the current version.');
  const result = await db.quiz.deleteMany({
    where: { id: req.params.id, version: req.body.version },
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
const server = app.listen(Number(process.env.PORT) || 3001, process.env.HOST || '0.0.0.0', () =>
  console.log(`QuiBuzz API listening on port ${process.env.PORT || 3001}`),
);
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => {
    server.close(() => {
      void db.$disconnect().then(() => process.exit(0));
    });
  });
