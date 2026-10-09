import { useCallback, useEffect, useRef, useState } from 'react';
import type { Quiz } from '../shared/types';
import type { Action } from '../shared/validation';
import { api, ApiError, getQuiz, syncClock } from './api';
import { requestId } from './requestId';
interface Pending {
  requestId: string;
  version: number;
  action: Action;
}
export function useQuiz(id: string, projector = false) {
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [error, setError] = useState('');
  const [online, setOnline] = useState(true);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<Pending | null>(() => {
    if (projector) return null;
    try {
      return JSON.parse(sessionStorage.getItem(`pending:${id}`) || 'null');
    } catch {
      return null;
    }
  });
  const current = useRef<Quiz | null>(null);
  const locked = useRef(false);
  const accept = useCallback((q: Quiz) => {
    if (!current.current || q.version >= current.current.version) {
      current.current = q;
      setQuiz(q);
    }
  }, []);
  const refresh = useCallback(async () => {
    try {
      accept(await getQuiz(id, projector));
      setOnline(true);
    } catch (e) {
      setOnline(false);
      setError((e as Error).message);
    }
  }, [id, accept, projector]);
  useEffect(() => {
    void refresh();
    void syncClock().catch(() => {});
    const timer = setInterval(() => {
      if (!locked.current) void refresh();
    }, 2000);
    return () => clearInterval(timer);
  }, [refresh]);
  const send = async (body: Pending) => {
    if (projector || locked.current) return false;
    locked.current = true;
    setBusy(true);
    setError('');
    setPending(body);
    sessionStorage.setItem(`pending:${id}`, JSON.stringify(body));
    try {
      accept(
        await api<Quiz>(`/quizzes/${id}/commands`, { method: 'POST', body: JSON.stringify(body) }),
      );
      setOnline(true);
      setPending(null);
      sessionStorage.removeItem(`pending:${id}`);
      return true;
    } catch (e) {
      setError((e as Error).message);
      if (e instanceof ApiError && e.status >= 400 && e.status < 500) {
        setPending(null);
        sessionStorage.removeItem(`pending:${id}`);
        await refresh();
      } else setOnline(false);
      return false;
    } finally {
      locked.current = false;
      setBusy(false);
    }
  };
  const act = async (action: Action) => {
    if (!current.current || locked.current || pending) return false;
    return send({ requestId: requestId(), version: current.current.version, action });
  };
  return {
    quiz,
    error,
    setError,
    online,
    busy: busy || !!pending,
    pending,
    act,
    refresh,
    retry: () => (pending ? send(pending) : refresh()),
  };
}
export type Act = (action: Action) => Promise<boolean>;
