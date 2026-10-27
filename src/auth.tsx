import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { api, ApiError, checkApiHealth, retryConnection, setCsrfToken } from './api';
import { Brand, Field } from './components/ui';
interface User {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
}
interface AuthResponse {
  user: User | null;
  csrfToken: string | null;
}
const AuthContext = createContext<{ user: User | null; logout: () => Promise<void> }>({
  user: null,
  logout: async () => {},
});
export const useAuth = () => useContext(AuthContext);
function clearQuizCaches() {
  for (const storage of [localStorage, sessionStorage]) {
    Object.keys(storage)
      .filter(
        (key) => key.startsWith('draft:') || key.startsWith('pending:') || key === 'operatorKey',
      )
      .forEach((key) => storage.removeItem(key));
  }
}
export function AuthGate({ children, publicView }: { children: ReactNode; publicView: boolean }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [slow, setSlow] = useState(false);
  const [connectionDetail, setConnectionDetail] = useState('');
  const request = useRef<AbortController | null>(null);
  const accept = (response: AuthResponse) => {
    setCsrfToken(response.csrfToken);
    setUser(response.user);
  };
  const load = useCallback(async () => {
    if (request.current) return;
    const controller = new AbortController();
    request.current = controller;
    const slowTimer = window.setTimeout(() => setSlow(true), 8000);
    setLoading(true);
    setError('');
    setSlow(false);
    setConnectionDetail('');
    try {
      const result = await retryConnection(
        async (signal) => {
          await checkApiHealth(signal);
          if (publicView) return null;
          try {
            return await api<AuthResponse>('/auth/me', { signal });
          } catch (error) {
            if (error instanceof ApiError && error.status === 401)
              return { user: null, csrfToken: null };
            throw error;
          }
        },
        controller.signal,
      );
      if (!controller.signal.aborted && result) accept(result);
    } catch (e) {
      if (!controller.signal.aborted) {
        setError('Unable to connect to QuiBuzz. Please try again.');
        if (e instanceof ApiError && e.status === 404)
          setConnectionDetail(
            'The API returned HTTP 404. Check the Vercel API rewrite and the Render deployment.',
          );
        else if (e instanceof ApiError && e.message.includes('webpage instead of JSON'))
          setConnectionDetail(e.message);
      }
    } finally {
      window.clearTimeout(slowTimer);
      if (request.current === controller) {
        request.current = null;
        if (!controller.signal.aborted) setLoading(false);
      }
    }
  }, [publicView]);
  useEffect(() => {
    void load();
    const expired = () => {
      setCsrfToken(null);
      setUser(null);
      clearQuizCaches();
    };
    window.addEventListener('quibuzz:session-expired', expired);
    return () => {
      window.removeEventListener('quibuzz:session-expired', expired);
      request.current?.abort();
      request.current = null;
    };
  }, [load, publicView]);
  const logout = async () => {
    await api('/auth/logout', { method: 'POST', body: '{}' });
    setCsrfToken(null);
    setUser(null);
    clearQuizCaches();
    location.href = '/';
  };
  return (
    <AuthContext.Provider value={{ user, logout }}>
      {loading ? (
        <main className="page auth-page connection-page" aria-live="polite">
          <Brand />
          <section className="connection-state">
            <span className="spinner" />
            <h1>
              {slow
                ? 'The server is waking up. This may take up to a minute.'
                : 'Connecting to QuiBuzz server…'}
            </h1>
          </section>
        </main>
      ) : error ? (
        <main className="page auth-page connection-page">
          <Brand />
          <section className="connection-state">
            <p role="alert">{error}</p>
            {connectionDetail && <p className="muted">{connectionDetail}</p>}
            <button className="btn primary" onClick={() => void load()}>
              Retry Connection
            </button>
          </section>
        </main>
      ) : publicView ? (
        children
      ) : user ? (
        children
      ) : (
        <Login onSuccess={accept} />
      )}
    </AuthContext.Provider>
  );
}
function Login({ onSuccess }: { onSuccess: (response: AuthResponse) => void }) {
  const [register, setRegister] = useState(false);
  const [name, setName] = useState('');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <main className="page auth-page">
      <Brand />
      <section className="panel auth-panel">
        <p className="eyebrow">QUIZ MASTER ACCOUNTS</p>
        <h1>{register ? 'Create your account' : 'Welcome back'}</h1>
        <p className="muted">Your quizzes, teams and score history stay with your account.</p>
        <form
          className="form-stack"
          onSubmit={async (e) => {
            e.preventDefault();
            if (busy) return;
            setBusy(true);
            setError('');
            try {
              onSuccess(
                await api<AuthResponse>(register ? '/auth/register' : '/auth/login', {
                  method: 'POST',
                  body: JSON.stringify({ name, identifier, password }),
                }),
              );
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {register && (
            <Field label="Your name">
              <input
                required
                value={name}
                minLength={2}
                maxLength={100}
                autoComplete="name"
                onChange={(e) => setName(e.target.value)}
              />
            </Field>
          )}
          <Field
            label="Email or phone number"
            hint="For a phone number, include the country code (e.g. +919876543210)."
          >
            <input
              required
              type="text"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              maxLength={254}
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
            />
          </Field>
          <Field
            label="Password"
            hint={
              register
                ? 'Use at least 8 characters. Spaces and passphrases are welcome.'
                : undefined
            }
          >
            <input
              required
              type="password"
              minLength={register ? 8 : 1}
              maxLength={128}
              autoComplete={register ? 'new-password' : 'current-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          {error && (
            <p role="alert" className="red">
              {error}
            </p>
          )}
          <button className="btn primary" disabled={busy}>
            {busy ? 'Please wait…' : register ? 'Create account' : 'Sign in'}
          </button>
        </form>
        <button
          className="text-btn auth-switch"
          disabled={busy}
          onClick={() => {
            setRegister(!register);
            setError('');
            setPassword('');
          }}
        >
          {register ? 'Already have an account? Sign in' : 'New to QuiBuzz? Create an account'}
        </button>
      </section>
    </main>
  );
}
