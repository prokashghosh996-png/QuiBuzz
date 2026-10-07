import { test } from 'node:test';
import assert from 'node:assert/strict';
import { api, ApiError } from '../src/api.js';

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
