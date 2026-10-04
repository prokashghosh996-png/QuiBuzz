import type { Quiz } from '../shared/types';
export class ApiError extends Error {
  constructor(
    message: string,
    public status = 0,
  ) {
    super(message);
  }
}
export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'x-operator-key': sessionStorage.getItem('operatorKey') || '',
        ...options.headers,
      },
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new ApiError(
      'Connection lost. Your last action is unconfirmed. Retry safely when the connection returns.',
    );
  }
  const data = await response.json();
  if (!response.ok) throw new ApiError(data.error || 'The request failed.', response.status);
  return data;
}
export const getQuiz = (id: string) => api<Quiz>(`/quizzes/${id}`);
export let serverOffset = 0;
export async function syncClock() {
  const before = Date.now();
  const health = await api<{ serverTime: number }>('/health');
  serverOffset = health.serverTime - (before + Date.now()) / 2;
}
