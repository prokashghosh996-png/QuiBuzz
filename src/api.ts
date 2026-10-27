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
const healthTimeout = 20000;
const connectionTimeout = 90000;
const initialRetryDelay = 1000;
const maxRetryDelay = 10000;
const retryableStatus = (status: number) => status === 0 || [502, 503, 504].includes(status);
const abortableDelay = (milliseconds: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason);
      return;
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', abort);
      resolve();
    }, milliseconds);
    const abort = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    signal.addEventListener('abort', abort, { once: true });
  });

export async function checkApiHealth(signal: AbortSignal): Promise<void> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), healthTimeout);
  const abort = () => controller.abort(signal.reason);
  if (signal.aborted) controller.abort(signal.reason);
  else signal.addEventListener('abort', abort, { once: true });
  try {
    const response = await fetch('/api/health', {
      credentials: 'same-origin',
      signal: controller.signal,
    });
    if (!response.ok) {
      let message = `The API health check failed with HTTP ${response.status}.`;
      if (response.headers.get('content-type')?.toLowerCase().includes('application/json')) {
        try {
          const data = await response.json();
          if (typeof data.error === 'string') message = data.error;
        } catch {
          // Keep the status-based error when the response body is malformed.
        }
      }
      throw new ApiError(message, response.status);
    }
    if (!response.headers.get('content-type')?.toLowerCase().includes('application/json')) {
      throw new ApiError(
        'The quiz API is unavailable: the server returned a webpage instead of JSON. Check that the backend is running and /api requests are routed to it.',
        response.status,
      );
    }
    let data: unknown;
    try {
      data = await response.json();
    } catch {
      throw new ApiError('The API health check returned an invalid response.', response.status);
    }
    if (!data || typeof data !== 'object' || !('ok' in data) || data.ok !== true)
      throw new ApiError('The API health check returned an unexpected response.', response.status);
  } catch (error) {
    if (signal.aborted) throw error;
    if (controller.signal.aborted || !(error instanceof ApiError))
      throw new ApiError('The API health check timed out or could not reach the server.');
    throw error;
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener('abort', abort);
  }
}

// This retry helper is only for safe startup GETs (health and the current session).
export async function retryConnection<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  const controller = new AbortController();
  let timedOut = false;
  const abort = () => controller.abort(signal.reason);
  if (signal.aborted) controller.abort(signal.reason);
  else signal.addEventListener('abort', abort, { once: true });
  const deadline = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, connectionTimeout);
  let attempt = 0;
  let lastError: unknown;
  try {
    while (!controller.signal.aborted) {
      try {
        return await operation(controller.signal);
      } catch (error) {
        lastError = error;
        if (signal.aborted) throw error;
        if (timedOut)
          throw new ApiError('Unable to connect to QuiBuzz. Please try again.', 0);
        if (!(error instanceof ApiError) || !retryableStatus(error.status)) throw error;
        const delay = Math.min(initialRetryDelay * 2 ** attempt, maxRetryDelay);
        attempt += 1;
        try {
          await abortableDelay(delay, controller.signal);
        } catch {
          if (signal.aborted) throw signal.reason;
          throw new ApiError(
            lastError instanceof Error ? lastError.message : 'The server did not respond in time.',
            lastError instanceof ApiError ? lastError.status : 0,
          );
        }
      }
    }
    throw new ApiError('Unable to connect to QuiBuzz. Please try again.', 0);
  } finally {
    clearTimeout(deadline);
    signal.removeEventListener('abort', abort);
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
      signal: options.signal
        ? AbortSignal.any([options.signal, AbortSignal.timeout(15000)])
        : AbortSignal.timeout(15000),
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
