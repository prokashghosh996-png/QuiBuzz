import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, setCsrfToken } from './api';
import { Brand, Field, Loading } from './components/ui';
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
  const accept = (response: AuthResponse) => {
    setCsrfToken(response.csrfToken);
    setUser(response.user);
  };
  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await api<AuthResponse>('/auth/me');
      setCsrfToken(result.csrfToken);
      setUser(result.user);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    if (!publicView) void load();
    else setLoading(false);
    const expired = () => {
      setCsrfToken(null);
      setUser(null);
      clearQuizCaches();
    };
    window.addEventListener('quibuzz:session-expired', expired);
    return () => window.removeEventListener('quibuzz:session-expired', expired);
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
      {publicView ? (
        children
      ) : loading ? (
        <Loading />
      ) : error ? (
        <main className="page auth-page">
          <Brand />
          <p role="alert">{error}</p>
          <button className="btn" onClick={() => void load()}>
            Retry connection
          </button>
        </main>
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
