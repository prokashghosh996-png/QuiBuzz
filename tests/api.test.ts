import { test } from 'node:test';
import assert from 'node:assert/strict';
import { api, ApiError, checkApiHealth, retryConnection } from '../src/api.js';

test('API handles HTML routing failures, malformed JSON and backend errors', async (t) => {
  t.mock.method(globalThis, 'fetch');
  const storageDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage');
  Object.defineProperty(globalThis, 'sessionStorage', {
    configurable: true,
    value: { getItem: () => null },
  });
  t.after(() => {
    if (storageDescriptor) Object.defineProperty(globalThis, 'sessionStorage', storageDescriptor);
    else Reflect.deleteProperty(globalThis, 'sessionStorage');
  });
  const respond = (body: string, contentType: string, status = 200) => {
    t.mock.method(
      globalThis,
      'fetch',
      async () => new Response(body, { status, headers: { 'Content-Type': contentType } }),
    );
  };
  respond('<!DOCTYPE html><html></html>', 'text/html');
  await assert.rejects(
    () => api('/quizzes'),
    (error: unknown) => error instanceof ApiError && /webpage instead of JSON/.test(error.message),
  );
  respond('{', 'application/json');
  await assert.rejects(() => api('/quizzes'), /invalid response/);
  respond('{"error":"Database unavailable"}', 'application/json', 503);
  await assert.rejects(
    () => api('/quizzes'),
    (error: unknown) =>
      error instanceof ApiError && error.status === 503 && error.message === 'Database unavailable',
  );
  respond('[]', 'application/json');
  assert.deepEqual(await api('/quizzes'), []);
});

test('startup health check accepts the API health response and rejects HTML', async (t) => {
  t.mock.method(globalThis, 'fetch');
  t.mock.method(
    globalThis,
    'fetch',
    async () =>
      new Response(JSON.stringify({ ok: true, service: 'quibuzz-api' }), {
        headers: { 'Content-Type': 'application/json' },
      }),
  );
  await checkApiHealth(new AbortController().signal);

  t.mock.method(
    globalThis,
    'fetch',
    async () =>
      new Response('<!DOCTYPE html><html></html>', {
        headers: { 'Content-Type': 'text/html' },
      }),
  );
  await assert.rejects(
    () => checkApiHealth(new AbortController().signal),
    (error: unknown) => error instanceof ApiError && /webpage instead of JSON/.test(error.message),
  );
});

test('startup retries transient service errors but not authentication or routing errors', async () => {
  let attempts = 0;
  const connected = await retryConnection(async () => {
    attempts += 1;
    if (attempts === 1) throw new ApiError('Waking up', 503);
    return 'connected';
  }, new AbortController().signal);
  assert.equal(connected, 'connected');
  assert.equal(attempts, 2);

  for (const status of [401, 404]) {
    attempts = 0;
    await assert.rejects(
      () =>
        retryConnection(async () => {
          attempts += 1;
          throw new ApiError('Not retryable', status);
        }, new AbortController().signal),
      (error: unknown) => error instanceof ApiError && error.status === status,
    );
    assert.equal(attempts, 1);
  }
});

test('startup retry cancellation stops before another attempt', async () => {
  const controller = new AbortController();
  let attempts = 0;
  const connection = retryConnection(async () => {
    attempts += 1;
    throw new ApiError('Waking up', 503);
  }, controller.signal);
  setTimeout(() => controller.abort(), 20);
  await assert.rejects(connection);
  assert.equal(attempts, 1);
});
