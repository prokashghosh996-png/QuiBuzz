import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { Router, type Request, type Response, type NextFunction } from 'express';
import { hash, verify, argon2id } from 'argon2';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { db } from './db.js';
import { HttpError } from './service.js';

const cookieName = 'quibuzz_session';
const lifetime = 7 * 24 * 60 * 60 * 1000;
const passwordOptions = { type: argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;
const publicUser = { id: true, name: true, email: true, phone: true } as const;
const dummyHash = hash(randomBytes(32), passwordOptions);
export function normalizeIdentifier(input: string) {
  const value = input.trim();
  if (value.includes('@')) return { email: z.email().max(254).parse(value.toLowerCase()) };
  const phone = value.replace(/[\s()-]/g, '');
  if (!/^\+[1-9]\d{7,14}$/.test(phone))
    throw new HttpError(
      400,
      'Enter a valid email or phone number with country code, such as +919876543210.',
    );
  return { phone };
}
const credentials = z.object({
  identifier: z.string().min(1).max(254),
  password: z.string().min(1).max(128),
});
const signup = credentials.extend({
  name: z.string().trim().min(2).max(100),
  password: z.string().min(8).max(128),
});
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const csrf = (token: string) =>
  createHmac('sha256', token).update('QuiBuzz CSRF').digest('base64url');
function cookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production' || process.env.COOKIE_SECURE === 'true',
    sameSite: 'strict' as const,
    path: '/',
  };
}
function tokenFrom(req: Request) {
  const cookies = (req.get('cookie') || '').split(';').map((cookie) => cookie.trim());
  const values = cookies.filter((cookie) => cookie.startsWith(`${cookieName}=`));
  if (values.length !== 1) return null;
  const token = values[0].slice(cookieName.length + 1);
  return /^[A-Za-z0-9_-]{43}$/.test(token) ? token : null;
}
export async function sessionFor(req: Request) {
  const token = tokenFrom(req);
  if (!token) return null;
  const session = await db.session.findUnique({
    where: { id: digest(token) },
    include: { user: { select: publicUser } },
  });
  if (!session || session.expiresAt.getTime() <= Date.now()) return null;
  return { user: session.user, csrfToken: csrf(token), id: session.id };
}
export async function requireSession(req: Request, res: Response, next: NextFunction) {
  const session = await sessionFor(req);
  if (!session) throw new HttpError(401, 'Please sign in to manage your quizzes.');
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    const supplied = Buffer.from(req.get('x-csrf-token') || ''),
      expected = Buffer.from(session.csrfToken);
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected))
      throw new HttpError(403, 'Your session needs refreshing. Reload the page and try again.');
  }
  res.locals.userId = session.user.id;
  next();
}
async function issueSession(req: Request, res: Response, userId: string) {
  const token = randomBytes(32).toString('base64url');
  await db.$transaction(async (tx) => {
    // A successful login rotates any session already present in this browser.
    const old = tokenFrom(req);
    if (old) await tx.session.deleteMany({ where: { id: digest(old) } });
    await tx.session.create({
      data: { id: digest(token), userId, expiresAt: new Date(Date.now() + lifetime) },
    });
    await tx.session.deleteMany({ where: { expiresAt: { lte: new Date() } } });
  });
  res.cookie(cookieName, token, { ...cookieOptions(), maxAge: lifetime });
  return csrf(token);
}
export async function limitAuth(key: string, max: number) {
  const window = Math.floor(Date.now() / (15 * 60 * 1000));
  const record = await db.authRateLimit.upsert({
    where: { key: `${digest(key)}:${window}` },
    create: { key: `${digest(key)}:${window}`, expiresAt: new Date((window + 1) * 15 * 60 * 1000) },
    update: { attempts: { increment: 1 } },
  });
  if (record.attempts > max)
    throw new HttpError(429, 'Too many attempts. Try again in 15 minutes.');
  if (Math.random() < 0.01)
    await db.authRateLimit.deleteMany({ where: { expiresAt: { lt: new Date() } } });
}
export const auth = Router();
auth.get('/me', async (req, res) => {
  const session = await sessionFor(req);
  res.json(
    session
      ? { user: session.user, csrfToken: session.csrfToken }
      : { user: null, csrfToken: null },
  );
});
auth.post('/register', async (req, res) => {
  await limitAuth(`register:${req.ip}`, 20);
  const body = signup.parse(req.body),
    identifier = normalizeIdentifier(body.identifier);
  const passwordHash = await hash(body.password, passwordOptions);
  try {
    const user = await db.user.create({
      data: { name: body.name, ...identifier, passwordHash },
      select: publicUser,
    });
    res.status(201).json({ user, csrfToken: await issueSession(req, res, user.id) });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
      throw new HttpError(
        400,
        'Unable to create an account with these details. Try signing in instead.',
      );
    throw error;
  }
});
auth.post('/login', async (req, res) => {
  await limitAuth(`login-ip:${req.ip}`, 100);
  const body = credentials.parse(req.body),
    identifier = normalizeIdentifier(body.identifier);
  await limitAuth(`login-account:${JSON.stringify(identifier)}`, 15);
  const user = await db.user.findFirst({ where: identifier });
  const valid = await verify(user?.passwordHash || (await dummyHash), body.password);
  if (!user || !valid) throw new HttpError(401, 'Incorrect email/phone number or password.');
  const safeUser = { id: user.id, name: user.name, email: user.email, phone: user.phone };
  res.json({ user: safeUser, csrfToken: await issueSession(req, res, user.id) });
});
auth.post('/logout', requireSession, async (req, res) => {
  const token = tokenFrom(req);
  if (token) await db.session.deleteMany({ where: { id: digest(token) } });
  res.clearCookie(cookieName, cookieOptions());
  res.json({ ok: true });
});
