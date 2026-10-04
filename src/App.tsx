import { useEffect, useState } from 'react';
import {
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  Check,
  CircleAlert,
  KeyRound,
  Monitor,
  Plus,
  Radio,
  ShieldCheck,
  Sparkles,
  Trophy,
  Users,
  Zap,
} from 'lucide-react';
import type { Quiz, QuizListItem } from '../shared/types';
import { api } from './api';
import { useQuiz } from './useQuiz';
import { Brand, Confirm, Field, Loading, Modal } from './components/ui';
import { Setup } from './components/Setup';
import { Dashboard, Projector } from './components/Dashboard';
function Header({
  online = true,
  busy = false,
  onKey,
}: {
  online?: boolean;
  busy?: boolean;
  onKey: () => void;
}) {
  return (
    <header className="site-header">
      <div className="header-inner">
        <Brand />
        <div className="header-right">
          <span className="connection">
            <span className={`status-dot ${online ? '' : 'red-dot'}`} />
            {!online ? 'Reconnecting' : busy ? 'Saving changes…' : 'Connected & saved'}
          </span>
          <span className="header-divider" />
          <button className="icon-btn" aria-label="Operator access" onClick={onKey}>
            <KeyRound size={18} />
          </button>
          <span className="operator-avatar">QM</span>
        </div>
      </div>
    </header>
  );
}
function OperatorKey({ onClose }: { onClose: () => void }) {
  const [key, setKey] = useState(sessionStorage.getItem('operatorKey') || '');
  return (
    <Modal title="Operator access" onClose={onClose}>
      <p className="muted">
        If this server has an operator key, enter it here to enable quiz controls. The projector
        remains read-only.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          sessionStorage.setItem('operatorKey', key);
          onClose();
        }}
      >
        <Field label="Operator key">
          <input type="password" autoFocus value={key} onChange={(e) => setKey(e.target.value)} />
        </Field>
        <div className="modal-actions">
          <button className="btn primary">Save key</button>
        </div>
      </form>
    </Modal>
  );
}
function Home() {
  const [quizzes, setQuizzes] = useState<QuizListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [key, setKey] = useState(false);
  const load = () => {
    setLoading(true);
    void api<QuizListItem[]>('/quizzes')
      .then((q) => {
        setQuizzes(q);
        setError('');
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);
  const create = async (demo = false) => {
    setBusy(true);
    setError('');
    try {
      const q = await api<Quiz>(demo ? '/demo' : '/quizzes', { method: 'POST', body: '{}' });
      location.href = `/quiz/${q.id}`;
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };
  return (
    <>
      <Header online={!error} busy={busy} onKey={() => setKey(true)} />
      <main className="page home">
        <div className="home-hero">
          <div>
            <div className="hero-kicker">
              <span className="status-dot" /> BUILT FOR THE BIG MOMENT
            </div>
            <h1>
              Great questions.
              <br />
              <span>Flawless scorekeeping.</span>
            </h1>
            <p>
              Your stage deserves a calm control room. Run the final round, keep every point in
              check, and let the competition shine.
            </p>
            <div className="button-row">
              <button className="btn primary large" disabled={busy} onClick={() => void create()}>
                <Plus size={19} /> Create a quiz <ArrowRight size={18} />
              </button>
              <button className="btn large" disabled={busy} onClick={() => void create(true)}>
                <Sparkles size={18} /> Try a demo
              </button>
            </div>
            <div className="hero-trust">
              <span>
                <ShieldCheck size={16} /> Every score saved
              </span>
              <span>
                <Monitor size={16} /> Ready for the projector
              </span>
            </div>
          </div>
          <div className="hero-visual" aria-hidden="true">
            <div className="visual-tag">
              <Radio size={14} /> YOUR LIVE CONTROL ROOM
            </div>
            <div className="mock-question">
              <span>FINAL ROUND</span>
              <strong>Let the best team win.</strong>
              <span className="mock-live">● LIVE</span>
            </div>
            <div className="mock-teams">
              {[
                { letter: 'A', name: 'Neural Strikers', score: 80 },
                { letter: 'B', name: 'Code Warriors', score: 65 },
                { letter: 'C', name: 'Binary Brains', score: 60 },
              ].map((t, i) => (
                <div key={t.letter}>
                  <span className={`avatar color-${i}`}>{t.letter}</span>
                  <span>
                    {t.name}
                    <small>TEAM {t.letter}</small>
                  </span>
                  <strong>{t.score}</strong>
                </div>
              ))}
            </div>
            <div className="visual-footer">
              <Check size={15} /> A little less admin. A lot more quiz.
            </div>
            <span className="visual-spark">
              <Zap size={25} fill="currentColor" />
            </span>
          </div>
        </div>
        {error && (
          <div role="alert" className="error-banner">
            <CircleAlert size={18} />
            <span>{error}</span>
            <button className="btn" onClick={load}>
              Retry connection
            </button>
          </div>
        )}
        <div className="section-heading quiz-list-heading">
          <div>
            <p className="eyebrow">THE CONTROL ROOM</p>
            <h2>
              Your quizzes <span className="count">{quizzes.length}</span>
            </h2>
          </div>
          <span className="muted">Pick up right where you left off.</span>
        </div>
        {loading ? (
          <div className="empty-small">Loading saved quizzes…</div>
        ) : quizzes.length ? (
          <div className="quiz-list">
            {quizzes.map((q) => (
              <a href={`/quiz/${q.id}`} className="panel quiz-tile" key={q.id}>
                <div className="quiz-tile-top">
                  <span className="quiz-icon">
                    <Trophy size={23} />
                  </span>
                  <span className={`badge ${q.status === 'LIVE' ? 'live' : 'neutral'}`}>
                    {q.status.replaceAll('_', ' ')}
                  </span>
                </div>
                <h3>{q.name}</h3>
                <p className="muted">
                  {q.master ? `Hosted by ${q.master}` : 'Your next great quiz starts here.'}
                </p>
                <div className="quiz-tile-meta">
                  <span>
                    <Users size={14} />
                    {q._count.teams || '—'} teams
                  </span>
                  <span>
                    <CalendarDays size={14} />
                    {new Date(q.updatedAt).toLocaleDateString(undefined, {
                      month: 'short',
                      day: 'numeric',
                    })}
                  </span>
                  <ArrowUpRight size={19} />
                </div>
              </a>
            ))}
          </div>
        ) : (
          <div className="panel empty-quizzes">
            <Trophy size={30} />
            <h3>The stage is yours.</h3>
            <p className="muted">Create your first quiz, or explore a demo with six teams.</p>
            <button className="text-btn" disabled={busy} onClick={() => void create()}>
              Set up your first quiz <ArrowRight size={16} />
            </button>
          </div>
        )}
        <div className="home-features">
          <div>
            <Zap size={21} />
            <h3>Fast on your feet</h3>
            <p>Direct, bonus and pounce scoring. A tap for every call.</p>
          </div>
          <div>
            <ShieldCheck size={21} />
            <h3>Every point accounted for</h3>
            <p>A full score history, reliable undo and round-by-round totals.</p>
          </div>
          <div>
            <Monitor size={21} />
            <h3>Made for the big screen</h3>
            <p>A clear, live leaderboard that gives every team their moment.</p>
          </div>
        </div>
      </main>
      <Footer />
      {key && <OperatorKey onClose={() => setKey(false)} />}
    </>
  );
}
function Footer() {
  return (
    <footer className="site-footer">
      <span>
        QuiBuzz <span className="muted">/</span> Made for the final round.
      </span>
      <span>Focus on the questions. We’ll count the points.</span>
    </footer>
  );
}
function QuizPage({ id, projector }: { id: string; projector: boolean }) {
  const { quiz, error, setError, online, busy, pending, act, retry, refresh } = useQuiz(id);
  const [key, setKey] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const remove = async () => {
    if (!quiz) return;
    setDeleteBusy(true);
    try {
      await api(`/quizzes/${id}`, {
        method: 'DELETE',
        body: JSON.stringify({ confirmed: true, version: quiz.version }),
      });
      localStorage.removeItem(`draft:${id}`);
      location.href = '/';
    } catch (e) {
      setError((e as Error).message);
      setDeleting(false);
      await refresh();
    } finally {
      setDeleteBusy(false);
    }
  };
  return (
    <>
      {!projector && <Header online={online} busy={busy} onKey={() => setKey(true)} />}{' '}
      {(error || pending) && (
        <div className="page error-container">
          <div className="error-banner" role="alert">
            <CircleAlert size={19} />
            <span>
              {error ||
                'A previous action is awaiting confirmation. Retry it safely before continuing.'}
            </span>
            <button className="btn" onClick={() => void retry()}>
              {pending ? 'Retry last action' : 'Reconnect'}
            </button>
            {!pending && online && (
              <button className="text-btn" onClick={() => setError('')}>
                Dismiss
              </button>
            )}
          </div>
        </div>
      )}
      {quiz ? (
        projector ? (
          <Projector quiz={quiz} />
        ) : ['SETUP', 'READY'].includes(quiz.status) ? (
          <>
            <Setup quiz={quiz} act={act} busy={busy} />
            <div className="page draft-delete">
              <button className="text-btn red" disabled={busy} onClick={() => setDeleting(true)}>
                Delete draft quiz
              </button>
            </div>
          </>
        ) : (
          <Dashboard quiz={quiz} act={act} busy={busy} onDelete={() => setDeleting(true)} />
        )
      ) : error ? (
        <main className="page empty-quizzes">
          <h2>We couldn’t open this quiz.</h2>
          <p className="muted">Check that the API and database are running, then reconnect.</p>
          <a className="btn" href="/">
            Back to quizzes
          </a>
        </main>
      ) : (
        <Loading />
      )}
      {!projector && <Footer />}
      {key && <OperatorKey onClose={() => setKey(false)} />}{' '}
      {deleting && (
        <Confirm
          title="Permanently delete this quiz?"
          description={`“${quiz?.name}” and all its teams, rounds and scoring history will be permanently deleted. This cannot be undone.`}
          label="Delete quiz"
          danger
          busy={deleteBusy}
          onClose={() => setDeleting(false)}
          onConfirm={() => void remove()}
        />
      )}
    </>
  );
}
export default function App() {
  const match = location.pathname.match(/^\/(quiz|projector)\/([^/]+)\/?$/);
  return match ? (
    <QuizPage key={match[2]} id={match[2]} projector={match[1] === 'projector'} />
  ) : (
    <Home />
  );
}
