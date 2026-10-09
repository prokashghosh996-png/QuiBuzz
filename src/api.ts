import type { Quiz } from '../shared/types';
let csrfToken: string | null = null;
export const setCsrfToken = (value: string | null) => {
  csrfToken = value;
};
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
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
        ...(csrfToken ? { 'x-csrf-token': csrfToken } : {}),
        ...options.headers,
      },
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new ApiError(
      'Connection lost. Your last action is unconfirmed. Retry safely when the connection returns.',
    );
  }
  if (!response.headers.get('content-type')?.toLowerCase().includes('application/json')) {
    throw new ApiError(
      'The quiz API is unavailable: the server returned a webpage instead of JSON. Check that the backend is running and /api requests are routed to it, then retry.',
      response.status,
    );
  }
  let data;
  try {
    data = await response.json();
  } catch {
    throw new ApiError(
      'The quiz API returned an invalid response. Retry the connection.',
      response.status,
    );
  }
  if (!response.ok) {
    if (response.status === 401 && !path.startsWith('/auth/') && typeof window !== 'undefined')
      window.dispatchEvent(new Event('quibuzz:session-expired'));
    throw new ApiError(data.error || 'The request failed.', response.status);
  }
  return data;
}
export const getQuiz = (id: string, projector = false) =>
  api<Quiz>(projector ? `/projector/${id}` : `/quizzes/${id}`);
export let serverOffset = 0;
export async function syncClock() {
  const before = Date.now();
  const health = await api<{ serverTime: number }>('/health');
  serverOffset = health.serverTime - (before + Date.now()) / 2;
}
