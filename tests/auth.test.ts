import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { app } from '../server/app.js';
import { db } from '../server/db.js';
import { limitAuth } from '../server/auth.js';

test('accounts isolate quiz access, enforce CSRF, and revoke sessions', async () => {
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}/api`;
  const users: string[] = [];
  const call = (path: string, method = 'GET', body?: unknown, cookie = '', csrf = '', extra = {}) =>
    fetch(base + path, {
      method,
      headers: { 'Content-Type': 'application/json', cookie, 'x-csrf-token': csrf, ...extra },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  const password = 'A long test passphrase 2026';
  const register = async (identifier: string) => {
    const r = await call('/auth/register', 'POST', { name: 'Quiz Master', identifier, password });
    assert.equal(r.status, 201);
    assert.match(r.headers.get('set-cookie')!, /HttpOnly/i);
    assert.match(r.headers.get('set-cookie')!, /SameSite=Strict/i);
    const data = await r.json();
    users.push(data.user.id);
    return { ...data, cookie: r.headers.get('set-cookie')!.split(';')[0] };
  };
  try {
    assert.equal((await call('/quizzes')).status, 401);
    const email = `account-${randomUUID()}@example.com`;
    const a = await register(email.toUpperCase());
    const b = await register(`+919${String(Date.now()).slice(-9)}`);
    assert.equal(a.user.email, email);
    const stored = await db.user.findUniqueOrThrow({ where: { id: a.user.id } });
    assert.match(stored.passwordHash, /^\$argon2id\$/);
    assert.equal('passwordHash' in a.user, false);
    assert.equal((await call('/quizzes', 'POST', {}, a.cookie)).status, 403);
    assert.equal(
      (
        await call('/quizzes', 'POST', {}, a.cookie, a.csrfToken, {
          origin: 'https://evil.example',
          'sec-fetch-site': 'cross-site',
        })
      ).status,
      403,
    );
    const created = await call('/quizzes', 'POST', {}, a.cookie, a.csrfToken);
    assert.equal(created.status, 201);
    const quiz = await created.json();
    assert.equal(quiz.ownerId, a.user.id);
    assert.equal(
      (await call('/quizzes', 'GET', undefined, b.cookie).then((r) => r.json())).length,
      0,
    );
    assert.equal((await call(`/quizzes/${quiz.id}`, 'GET', undefined, b.cookie)).status, 404);
    assert.equal(
      (
        await call(
          `/quizzes/${quiz.id}/commands`,
          'POST',
          { requestId: randomUUID(), version: quiz.version, action: { type: 'start' } },
          b.cookie,
          b.csrfToken,
        )
      ).status,
      404,
    );
    assert.equal(
      (
        await call(
          `/quizzes/${quiz.id}`,
          'DELETE',
          { confirmed: true, version: quiz.version },
          b.cookie,
          b.csrfToken,
        )
      ).status,
      404,
    );
    const publicQuiz = await call(`/projector/${quiz.id}`).then((r) => r.json());
    assert.equal('ownerId' in publicQuiz, false);
    assert.deepEqual(publicQuiz.teams[0]?.members || [], []);
    const wrong = await call('/auth/login', 'POST', { identifier: email, password: 'wrong' });
    assert.equal(wrong.status, 401);
    const login = await call('/auth/login', 'POST', { identifier: email, password }, a.cookie);
    assert.equal(login.status, 200);
    const session = await login.json();
    const cookie = login.headers.get('set-cookie')!.split(';')[0];
    assert.equal(
      (await call('/auth/me', 'GET', undefined, a.cookie).then((r) => r.json())).user,
      null,
    );
    assert.equal((await call('/auth/logout', 'POST', {}, cookie, session.csrfToken)).status, 200);
    assert.equal((await call('/quizzes', 'GET', undefined, cookie)).status, 401);
    const rateKey = `test-${randomUUID()}`;
    await limitAuth(rateKey, 1);
    await assert.rejects(limitAuth(rateKey, 1), /Too many attempts/);
  } finally {
    await db.quiz.deleteMany({ where: { ownerId: { in: users } } });
    await db.user.deleteMany({ where: { id: { in: users } } });
    await new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())));
    await db.$disconnect();
  }
});
