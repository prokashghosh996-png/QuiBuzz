import { useEffect, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ArrowRightLeft,
  Play,
  Pause,
  RotateCcw,
  Timer,
  ArrowRight,
} from 'lucide-react';
import { type Quiz, currentAssignment, teamLabel } from '../../shared/types';
import { serverOffset } from '../api';
import type { Act } from '../useQuiz';
import { Field, Modal, Confirm } from './ui';
import { RoundMasterForm } from './RoundMasterForm';
import { enableTimerSound, playTimerSound } from '../timerSound';
export function TimerDisplay({
  quiz,
  act,
  busy = false,
  projector = false,
}: {
  quiz: Quiz;
  act?: Act;
  busy?: boolean;
  projector?: boolean;
}) {
  const [now, setNow] = useState(Date.now());
  const armedDeadline = useRef<number | null>(null);
  useEffect(() => {
    if (projector) return;
    document.addEventListener('pointerdown', enableTimerSound, true);
    document.addEventListener('keydown', enableTimerSound, true);
    return () => {
      document.removeEventListener('pointerdown', enableTimerSound, true);
      document.removeEventListener('keydown', enableTimerSound, true);
    };
  }, [projector]);
  useEffect(() => {
    const deadline = quiz.state.timer.endsAt;
    if (projector || quiz.status !== 'LIVE' || !deadline) {
      armedDeadline.current = null;
    } else if (deadline > now + serverOffset) {
      armedDeadline.current = deadline;
    } else if (armedDeadline.current === deadline) {
      armedDeadline.current = null;
      playTimerSound();
    }
  }, [now, projector, quiz.status, quiz.state.timer.endsAt]);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(id);
  }, []);
  const remaining = Math.ceil(
    Math.max(
      0,
      quiz.state.timer.endsAt
        ? quiz.state.timer.endsAt - now - serverOffset
        : quiz.state.timer.remainingMs,
    ) / 1000,
  );
  const running = !!quiz.state.timer.endsAt && remaining > 0;
  const text = `${String(Math.floor(remaining / 60)).padStart(2, '0')}:${String(remaining % 60).padStart(2, '0')}`;
  return (
    <div
      className={`pounce-timer ${remaining === 0 ? 'time-up' : ''} ${running ? 'running' : ''} ${projector ? 'projector-timer' : ''}`}
    >
      <div>
        <span className="eyebrow">
          <Timer size={14} /> POUNCE TIMER
        </span>
        <div className="timer-number" role="timer" aria-label={`${remaining} seconds remaining`}>
          {text}
        </div>
        <small aria-live="polite">
          {remaining === 0 ? 'TIME UP' : running ? 'Pounce window is open' : 'Ready when you are'}
        </small>
      </div>
      {!projector && act && (
        <div className="timer-actions">
          <button
            className={`btn ${running ? '' : 'primary'}`}
            disabled={busy || quiz.status !== 'LIVE'}
            onClick={() => void act({ type: 'timer', operation: running ? 'pause' : 'start' })}
          >
            {running ? <Pause size={16} /> : <Play size={16} />} {running ? 'Pause' : 'Start'}
          </button>
          <button
            className="icon-btn"
            aria-label="Reset pounce timer"
            disabled={busy || quiz.status !== 'LIVE'}
            onClick={() => void act({ type: 'timer', operation: 'reset' })}
          >
            <RotateCcw size={17} />
          </button>
        </div>
      )}
    </div>
  );
}
export function BounceModal({
  quiz,
  act,
  busy,
  onClose,
}: {
  quiz: Quiz;
  act: Act;
  busy: boolean;
  onClose: () => void;
}) {
  const a = currentAssignment(quiz);
  const [teamId, setTeamId] = useState(a.bounceTeamId || a.nextTeamId);
  return (
    <Modal title="Bounce the question" onClose={onClose}>
      <p className="muted">
        Pass this question to another team. Award Bonus when they answer correctly; pounces remain
        independent.
      </p>
      <div className="bounce-from">
        <small>ORIGINAL DIRECT TEAM</small>
        <strong>{teamLabel(quiz.teams.find((t) => t.id === a.directTeamId))}</strong>
        <ArrowRight size={20} />
      </div>
      <Field label="Bounce to">
        <select value={teamId} onChange={(e) => setTeamId(e.target.value)}>
          {quiz.state.order.map((id) => {
            const t = quiz.teams.find((t) => t.id === id)!;
            return (
              <option key={id} value={id}>
                {teamLabel(t)}
              </option>
            );
          })}
        </select>
      </Field>
      <div className="modal-actions">
        <button className="btn" onClick={onClose}>
          Cancel
        </button>
        <button
          className="btn primary"
          disabled={busy}
          onClick={() =>
            void act({ type: 'assign', target: 'bounceTeamId', teamId }).then((ok) => {
              if (ok) onClose();
            })
          }
        >
          Bounce question <ArrowRight size={16} />
        </button>
      </div>
    </Modal>
  );
}
export function Rotation({ quiz, act, busy }: { quiz: Quiz; act: Act; busy: boolean }) {
  const reorder = (from: number, to: number) => {
    const order = [...quiz.state.order];
    [order[from], order[to]] = [order[to], order[from]];
    void act({ type: 'order', order });
  };
  return (
    <section className="rotation">
      <div className="section-heading">
        <div>
          <h3>Team order / rotation</h3>
          <p className="muted">Choose the direction. Move any team into place.</p>
        </div>
        <button
          className="btn"
          disabled={busy}
          onClick={() => void act({ type: 'order', order: [...quiz.state.order].reverse() })}
        >
          <ArrowRightLeft size={16} /> Reverse order
        </button>
      </div>
      <div className="rotation-list">
        {quiz.state.order.map((id, i) => {
          const t = quiz.teams.find((t) => t.id === id)!;
          return (
            <div key={id}>
              <span className="muted">{i + 1}</span>
              <span className={`avatar small color-${t.initialOrder % 6}`}>{t.letter}</span>
              <strong>{t.name || `Team ${t.letter}`}</strong>
              <button
                className="icon-btn"
                disabled={busy || i === 0}
                aria-label={`Move Team ${t.letter} up`}
                onClick={() => reorder(i, i - 1)}
              >
                <ArrowUp size={16} />
              </button>
              <button
                className="icon-btn"
                disabled={busy || i === quiz.teams.length - 1}
                aria-label={`Move Team ${t.letter} down`}
                onClick={() => reorder(i, i + 1)}
              >
                <ArrowDown size={16} />
              </button>
            </div>
          );
        })}
      </div>
      <p className="muted small-text">
        Updating the order suggests a new next team. You can override it in the question controls.
      </p>
    </section>
  );
}
export function Settings({
  quiz,
  act,
  busy,
  onDelete,
}: {
  quiz: Quiz;
  act: Act;
  busy: boolean;
  onDelete: () => void;
}) {
  const [positive, setPositive] = useState(quiz.positive);
  const [negative, setNegative] = useState(quiz.negative);
  const [seconds, setSeconds] = useState(quiz.pounceSeconds);
  const [confirm, setConfirm] = useState<'rules' | 'reset' | 'restart' | null>(null);
  const [saved, setSaved] = useState(false);
  const apply = async (confirmed: boolean) => {
    if (await act({ type: 'settings', positive, negative, pounceSeconds: seconds, confirmed })) {
      setConfirm(null);
      setSaved(true);
    }
  };
  return (
    <div className="settings-grid">
      <section className="panel">
        <h2>Round quiz masters</h2>
        <p className="muted">Change the saved quiz master for any round here.</p>
        {quiz.rounds.map((round, index) => (
          <RoundMasterForm key={round.id} quiz={quiz} act={act} busy={busy} index={index} />
        ))}
      </section>
      <section className="panel">
        <h2>Scoring & timing</h2>
        <p className="muted">Rule changes apply to future scoring actions only.</p>
        <form
          className="form-stack"
          onSubmit={(e) => {
            e.preventDefault();
            setSaved(false);
            if (positive !== quiz.positive || negative !== quiz.negative) setConfirm('rules');
            else void apply(false);
          }}
        >
          <div className="form-grid">
            <Field label="Correct marks">
              <input
                type="number"
                required
                min={1}
                max={10000}
                value={positive}
                onChange={(e) => setPositive(Number(e.target.value))}
              />
            </Field>
            <Field label="Negative penalty">
              <input
                type="number"
                required
                min={0}
                max={10000}
                value={negative}
                onChange={(e) => setNegative(Number(e.target.value))}
              />
            </Field>
          </div>
          <Field label="Pounce time · seconds">
            <input
              type="number"
              required
              min={1}
              max={3600}
              value={seconds}
              onChange={(e) => setSeconds(Number(e.target.value))}
            />
          </Field>
          <button className="btn primary" disabled={busy}>
            Save settings
          </button>
          {saved && (
            <span className="green" role="status">
              Settings saved.
            </span>
          )}
        </form>
      </section>
      <section className="panel">
        <Rotation quiz={quiz} act={act} busy={busy} />
      </section>
      <section className="panel danger-zone">
        <h2>Quiz management</h2>
        <p className="muted">
          Reset and restart keep removed scoring entries in your audit history.
        </p>
        <div className="button-row">
          <button className="btn" disabled={busy} onClick={() => setConfirm('reset')}>
            Reset scores
          </button>
          <button className="btn" disabled={busy} onClick={() => setConfirm('restart')}>
            Restart quiz
          </button>
          <button className="btn danger" disabled={busy} onClick={onDelete}>
            Delete quiz
          </button>
        </div>
      </section>
      {confirm && (
        <Confirm
          title={
            confirm === 'rules'
              ? 'Change scoring rules?'
              : confirm === 'reset'
                ? 'Reset every score?'
                : 'Restart this quiz?'
          }
          description={
            confirm === 'rules'
              ? `Future correct answers will award +${positive}; wrong pounces will deduct ${negative}. Existing entries keep their original marks.`
              : confirm === 'reset'
                ? 'All active scores will be removed from totals. The current question and round stay in place.'
                : 'Scores will be reset and the quiz will return to round 1, question 1. Teams, rounds and settings are retained.'
          }
          danger={confirm !== 'rules'}
          label={
            confirm === 'rules'
              ? 'Change rules'
              : confirm === 'reset'
                ? 'Reset scores'
                : 'Restart quiz'
          }
          busy={busy}
          onClose={() => setConfirm(null)}
          onConfirm={() => {
            if (confirm === 'rules') void apply(true);
            else
              void act({ type: 'reset', restart: confirm === 'restart', confirmed: true }).then(
                (ok) => {
                  if (ok) setConfirm(null);
                },
              );
          }}
        />
      )}
    </div>
  );
}
