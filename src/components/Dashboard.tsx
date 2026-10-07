import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  ArrowRightLeft,
  Check,
  ChevronRight,
  CircleDot,
  Flag,
  LayoutDashboard,
  ListOrdered,
  Monitor,
  Pencil,
  Settings2,
  Trophy,
  Undo2,
  Users,
  History as HistoryIcon,
  Maximize,
  Zap,
} from 'lucide-react';
import {
  currentAssignment,
  hasQuestionScore,
  roundMaster,
  total,
  teamLabel,
  type Quiz,
  type ScoreType,
  type Team,
} from '../../shared/types';
import type { Act } from '../useQuiz';
import { serverOffset } from '../api';
import { BackHome, Confirm, Field, Help, Modal } from './ui';
import { ExportButton, Leaderboard, ResultsTable } from './Leaderboard';
import { Adjustment, History } from './History';
import { BounceModal, Rotation, Settings, TimerDisplay } from './Controls';
type Tab = 'scoring' | 'leaderboard' | 'history' | 'settings';
function TeamCard({
  quiz,
  team,
  act,
  busy,
  onDetails,
  onAdjust,
}: {
  quiz: Quiz;
  team: Team;
  act: Act;
  busy: boolean;
  onDetails: () => void;
  onAdjust: () => void;
}) {
  const [cooldown, setCooldown] = useState(false);
  const guard = useRef(false);
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timeout.current) clearTimeout(timeout.current);
    },
    [],
  );
  const a = currentAssignment(quiz),
    direct = a.directTeamId === team.id,
    bounced = a.bounceTeamId === team.id;
  const score = total(quiz, team.id),
    roundScore = total(quiz, team.id, quiz.rounds[quiz.state.roundIndex].id);
  const hasScored = hasQuestionScore(
    quiz.events,
    team.id,
    quiz.rounds[quiz.state.roundIndex].id,
    quiz.state.question,
  );
  const bonusClosed = quiz.events.some(
    (event) =>
      !event.voidedAt &&
      event.roundId === quiz.rounds[quiz.state.roundIndex].id &&
      event.question === quiz.state.question &&
      (event.type === 'DIRECT_CORRECT' || event.type === 'BONUS_CORRECT'),
  );
  const award = async (scoreType: Exclude<ScoreType, 'MANUAL_ADJUSTMENT'>) => {
    if (guard.current || hasScored || (scoreType === 'BONUS_CORRECT' && bonusClosed)) return;
    guard.current = true;
    setCooldown(true);
    await act({ type: 'score', teamId: team.id, scoreType });
    timeout.current = setTimeout(() => {
      guard.current = false;
      setCooldown(false);
    }, 450);
  };
  return (
    <article className={`team-card ${direct ? 'is-direct' : ''} ${bounced ? 'is-bounced' : ''}`}>
      <div className="team-card-top">
        <span className={`avatar color-${team.initialOrder % 6}`}>{team.letter}</span>
        <span className="eyebrow">TEAM {team.letter}</span>
        {direct ? (
          <span className="direct-badge">
            <CircleDot size={11} /> DIRECT
          </span>
        ) : bounced ? (
          <span className="bonus-badge">BOUNCED</span>
        ) : (
          <button
            className="icon-btn edit-team"
            disabled={busy}
            aria-label={`Adjust ${team.name || team.letter} score`}
            onClick={onAdjust}
          >
            <Pencil size={14} />
          </button>
        )}
      </div>
      <h3>{team.name || `Team ${team.letter}`}</h3>
      <p className="members">{team.members.join(' · ')}</p>
      <div className="team-scores">
        <button className="score-detail-button" onClick={onDetails}>
          <span className="eyebrow">TOTAL SCORE</span>
          <strong className="score-value" key={score}>
            {score}
          </strong>
        </button>
        <div className="round-score">
          <span>THIS ROUND</span>
          <strong>{roundScore}</strong>
        </div>
      </div>
      <div className="score-actions">
        <button
          disabled={busy || cooldown || hasScored || !direct}
          title={
            direct ? undefined : 'Only the current direct question team can receive Direct points'
          }
          className="score-btn direct"
          onClick={() => void award('DIRECT_CORRECT')}
        >
          Direct <b>+{quiz.positive}</b>
        </button>
        <button
          disabled={busy || cooldown || hasScored || direct || bonusClosed}
          title={
            bonusClosed
              ? 'Direct or Bonus points have already been awarded for this question'
              : direct
                ? 'The direct question team cannot receive Bonus points'
                : undefined
          }
          className="score-btn bonus"
          onClick={() => void award('BONUS_CORRECT')}
        >
          Bonus <b>+{quiz.positive}</b>
        </button>
        <button
          disabled={busy || cooldown || hasScored || direct}
          title={direct ? 'The direct question team cannot pounce' : undefined}
          className="score-btn pounce"
          onClick={() => void award('POUNCE_CORRECT')}
        >
          Pounce <b>+{quiz.positive}</b>
        </button>
        <button
          disabled={busy || cooldown || hasScored || direct}
          title={direct ? 'The direct question team cannot pounce' : undefined}
          className="score-btn wrong"
          onClick={() => void award('POUNCE_WRONG')}
        >
          Pounce <b>−{quiz.negative}</b>
        </button>
      </div>
      {hasScored && <p className="muted">Scored for this question</p>}
    </article>
  );
}
export function Dashboard({
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
  const [tab, setTab] = useState<Tab>('scoring');
  const [bounce, setBounce] = useState(false);
  const [startRound, setStartRound] = useState<'nextRound' | 'tieBreak' | null>(null);
  const [nextMaster, setNextMaster] = useState('');
  const [confirm, setConfirm] = useState<'round' | 'end' | null>(null);
  const [details, setDetails] = useState<Team | null>(null);
  const [adjust, setAdjust] = useState<Team | null>(null);
  const round = quiz.rounds[quiz.state.roundIndex],
    a = currentAssignment(quiz),
    live = quiz.status === 'LIVE';
  const actRef = useRef(act);
  actRef.current = act;
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLElement &&
        (e.target.closest('input,select,textarea,button,a,[contenteditable="true"]') ||
          document.querySelector('dialog[open]'))
      )
        return;
      if (busy || !live) return;
      if (e.code === 'Space') {
        e.preventDefault();
        void actRef.current({
          type: 'timer',
          operation: (quiz.state.timer.endsAt || 0) > Date.now() + serverOffset ? 'pause' : 'start',
        });
      }
      if (e.key === 'ArrowRight' && quiz.state.question < round.questions) {
        e.preventDefault();
        void actRef.current({ type: 'navigate', delta: 1 });
      }
      if (e.key === 'ArrowLeft' && quiz.state.question > 1) {
        e.preventDefault();
        void actRef.current({ type: 'navigate', delta: -1 });
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [busy, live, quiz.state.question, quiz.state.timer.endsAt, round.questions]);
  const tabs: { id: Tab; label: string; icon: typeof LayoutDashboard }[] = [
    { id: 'scoring', label: 'Live scoring', icon: LayoutDashboard },
    { id: 'leaderboard', label: 'Leaderboard', icon: Trophy },
    { id: 'history', label: 'Score history', icon: HistoryIcon },
    { id: 'settings', label: 'Quiz settings', icon: Settings2 },
  ];
  return (
    <main className="page dashboard">
      <BackHome />
      {startRound && (
        <Modal
          title="Before starting the round"
          onClose={() => {
            if (!busy) setStartRound(null);
          }}
        >
          <p className="muted">
            {startRound === 'nextRound'
              ? quiz.rounds[quiz.state.roundIndex + 1].name
              : 'Tie-break round'}
            . Confirm the quiz master. After starting, changes are available in Settings.
          </p>
          <form
            className="form-stack"
            onSubmit={async (e) => {
              e.preventDefault();
              if (await act({ type: startRound, master: nextMaster })) setStartRound(null);
            }}
          >
            <Field label="Quiz master for the upcoming round">
              <input
                autoFocus
                required
                maxLength={100}
                value={nextMaster}
                onChange={(e) => setNextMaster(e.target.value)}
              />
            </Field>
            <div className="modal-actions">
              <button
                type="button"
                className="btn"
                disabled={busy}
                onClick={() => setStartRound(null)}
              >
                Cancel
              </button>
              <button className="btn primary" disabled={busy || !nextMaster.trim()}>
                Start round
              </button>
            </div>
          </form>
        </Modal>
      )}
      <div className="quiz-heading">
        <div>
          <div className="heading-meta">
            <span className={`badge ${live ? 'live' : ''}`}>
              <span className="status-dot" />
              {quiz.status.replaceAll('_', ' ')}
            </span>
            <span className="muted">FINAL ROUND EDITION</span>
          </div>
          <h1>{quiz.name}</h1>
          <p className="quiz-meta">
            <span>
              <Users size={15} /> {quiz.teams.length} teams
            </span>
            <span>
              <Flag size={15} /> {quiz.rounds.length} rounds
            </span>
            <span>
              Quiz master <strong>{roundMaster(quiz)}</strong>
            </span>
          </p>
        </div>
        <a className="btn" href={`/projector/${quiz.id}`} target="_blank" rel="noreferrer">
          <Monitor size={17} /> Projector mode <ArrowRight size={16} />
        </a>
      </div>
      <nav className="tabs" aria-label="Quiz sections">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>
            <Icon size={17} />
            {label}
            {id === 'scoring' && live && <span className="tab-dot" />}
          </button>
        ))}
      </nav>
      {(quiz.status === 'ROUND_COMPLETE' || quiz.status === 'QUIZ_COMPLETE') &&
      tab === 'scoring' ? (
        <section className="panel summary">
          <div className="summary-heading">
            <span className="summary-icon">
              {quiz.status === 'QUIZ_COMPLETE' ? <Trophy size={30} /> : <Check size={30} />}
            </span>
            <p className="eyebrow">
              {quiz.status === 'QUIZ_COMPLETE'
                ? 'THAT’S A WRAP'
                : 'ROUND ' + (quiz.state.roundIndex + 1) + ' COMPLETE'}
            </p>
            <h2>{quiz.status === 'QUIZ_COMPLETE' ? 'Every point. Every moment.' : round.name}</h2>
            <p className="muted">
              {quiz.status === 'QUIZ_COMPLETE'
                ? 'Your final standings are in. Equal scores share the same rank.'
                : 'Here’s how the teams stand. Review the scores before moving on.'}
            </p>
          </div>
          <ResultsTable quiz={quiz} />
          <div className="summary-actions">
            <ExportButton quiz={quiz} />
            <button className="btn" disabled={busy} onClick={() => void act({ type: 'resume' })}>
              Continue quiz
            </button>
            {quiz.status === 'QUIZ_COMPLETE' ? (
              <button
                className="btn primary"
                disabled={busy}
                onClick={() => {
                  setNextMaster(quiz.master);
                  setStartRound('tieBreak');
                }}
              >
                <Zap size={16} /> Add tie-break question
              </button>
            ) : (
              <button
                className="btn primary"
                disabled={busy}
                onClick={() => {
                  if (quiz.state.roundIndex + 1 >= quiz.rounds.length)
                    void act({ type: 'nextRound' });
                  else {
                    setNextMaster(roundMaster(quiz, quiz.state.roundIndex + 1));
                    setStartRound('nextRound');
                  }
                }}
              >
                {quiz.state.roundIndex + 1 < quiz.rounds.length
                  ? 'Start next round'
                  : 'Show final results'}{' '}
                <ArrowRight size={16} />
              </button>
            )}
          </div>
          {quiz.status === 'ROUND_COMPLETE' && <Rotation quiz={quiz} act={act} busy={busy} />}
        </section>
      ) : tab === 'scoring' ? (
        <>
          <div className="mobile-current">
            <span>
              R{quiz.state.roundIndex + 1} · Q{quiz.state.question}/{round.questions}
            </span>
            <strong>Direct: Team {quiz.teams.find((t) => t.id === a.directTeamId)?.letter}</strong>
          </div>
          <section className="panel question-panel">
            <div className="question-main">
              <div className="round-heading">
                <span className="round-icon">
                  <Flag size={20} />
                </span>
                <div>
                  <p className="eyebrow">
                    ROUND {quiz.state.roundIndex + 1} OF {quiz.rounds.length}
                  </p>
                  <h2>{round.name}</h2>
                </div>
                <div className="question-counter">
                  <span>QUESTION</span>
                  <strong>
                    {String(quiz.state.question).padStart(2, '0')}
                    <small> / {round.questions}</small>
                  </strong>
                </div>
              </div>
              <div className="progress">
                <span style={{ width: `${(quiz.state.question / round.questions) * 100}%` }} />
              </div>
              <div className="question-selects">
                <Field label="Current direct team">
                  <select
                    disabled={busy}
                    value={a.directTeamId}
                    onChange={(e) =>
                      void act({ type: 'assign', target: 'directTeamId', teamId: e.target.value })
                    }
                  >
                    {quiz.teams.map((t) => (
                      <option value={t.id} key={t.id}>
                        {teamLabel(t)}
                      </option>
                    ))}
                  </select>
                </Field>
                <ArrowRight className="select-arrow" size={18} />
                <Field
                  label={
                    quiz.state.bounceEnabled === false
                      ? 'Next direct team (team order)'
                      : 'Next direct team (override anytime)'
                  }
                >
                  <select
                    disabled={busy || quiz.state.bounceEnabled === false}
                    value={a.nextTeamId}
                    onChange={(e) =>
                      void act({ type: 'assign', target: 'nextTeamId', teamId: e.target.value })
                    }
                  >
                    {quiz.teams.map((t) => (
                      <option value={t.id} key={t.id}>
                        {teamLabel(t)}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              {a.bounceTeamId && (
                <p className="bounce-status">
                  <ArrowRightLeft size={14} /> Bounced to{' '}
                  {teamLabel(quiz.teams.find((t) => t.id === a.bounceTeamId))}. Use Bonus to award
                  points.
                </p>
              )}
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={quiz.state.bounceEnabled !== false}
                  disabled={busy}
                  onChange={(e) => void act({ type: 'bounceMode', enabled: e.target.checked })}
                />
                Bounce rotation
              </label>
              <p className="muted">
                {quiz.state.bounceEnabled !== false
                  ? 'Next question follows the team that scores Direct or Bonus.'
                  : 'Questions follow team order: A, B, C, and so on.'}
              </p>
              <div className="question-buttons">
                <button
                  className="btn"
                  disabled={busy || quiz.state.question === 1}
                  onClick={() => void act({ type: 'navigate', delta: -1 })}
                >
                  <ArrowLeft size={16} /> Previous
                </button>
                <button
                  className="btn primary next-question-btn"
                  disabled={busy || quiz.state.question === round.questions}
                  onClick={() => void act({ type: 'navigate', delta: 1 })}
                >
                  Next question <ArrowRight size={16} />
                </button>
                <button
                  className="btn bounce-button"
                  disabled={busy}
                  onClick={() => setBounce(true)}
                >
                  <ArrowRightLeft size={16} /> Bounce question
                </button>
              </div>
            </div>
            <TimerDisplay quiz={quiz} act={act} busy={busy} />
          </section>
          <div className={`scoring-layout ${quiz.teams.length === 8 ? 'eight-teams' : ''}`}>
            <div className="scoring-main">
              <div className="section-heading teams-heading">
                <div>
                  <h2>
                    Team scores <span className="count">{quiz.teams.length}</span>
                  </h2>
                  <p className="muted">One question. Every team in play.</p>
                </div>
                <button
                  className="btn undo"
                  disabled={busy || !quiz.events.some((e) => !e.voidedAt)}
                  onClick={() => void act({ type: 'undo' })}
                >
                  <Undo2 size={16} /> Undo last score
                </button>
              </div>
              <div className="team-grid">
                {quiz.teams.map((t) => (
                  <TeamCard
                    key={t.id}
                    team={t}
                    quiz={quiz}
                    act={act}
                    busy={busy}
                    onDetails={() => setDetails(t)}
                    onAdjust={() => setAdjust(t)}
                  />
                ))}
              </div>
              <Help />
              <div className="round-footer">
                <span className="muted">All done with this round?</span>
                <button className="btn" disabled={busy} onClick={() => setConfirm('round')}>
                  Complete round <ChevronRight size={16} />
                </button>
                <button className="text-btn red" disabled={busy} onClick={() => setConfirm('end')}>
                  End quiz
                </button>
              </div>
            </div>
            <aside className="dashboard-aside">
              <Leaderboard quiz={quiz} compact />
              <History quiz={quiz} act={act} busy={busy} compact onAll={() => setTab('history')} />
              <div className="shortcut-note">
                <span>STAY IN THE FLOW</span>
                <p>
                  <kbd>←</kbd>
                  <kbd>→</kbd> Change question <kbd>space</kbd> Timer
                </p>
              </div>
            </aside>
          </div>
        </>
      ) : null}
      {tab === 'leaderboard' && (
        <div className="leaderboard-page">
          <div className="section-heading">
            <div>
              <h2>The standings</h2>
              <p className="muted">Round by round. Point by point.</p>
            </div>
            <ExportButton quiz={quiz} />
          </div>
          <div className="panel">
            <ResultsTable quiz={quiz} />
          </div>
          <div className="team-detail-grid">
            {quiz.teams.map((t) => (
              <button key={t.id} className="btn" onClick={() => setDetails(t)}>
                <ListOrdered size={16} /> {t.name || `Team ${t.letter}`} · View details
              </button>
            ))}
          </div>
        </div>
      )}
      {tab === 'history' && <History quiz={quiz} act={act} busy={busy} />}
      {tab === 'settings' && <Settings quiz={quiz} act={act} busy={busy} onDelete={onDelete} />}
      {bounce && <BounceModal quiz={quiz} act={act} busy={busy} onClose={() => setBounce(false)} />}
      {confirm && (
        <Confirm
          title={confirm === 'round' ? 'Complete this round?' : 'End the quiz?'}
          description={
            confirm === 'round'
              ? `You’re on question ${quiz.state.question} of ${round.questions}. You can review the round summary and resume scoring if needed.`
              : 'Show the final standings now. You can continue the quiz or add tie-break questions from the results screen.'
          }
          label={confirm === 'round' ? 'Complete round' : 'Show final results'}
          busy={busy}
          onClose={() => setConfirm(null)}
          onConfirm={() =>
            void act({ type: confirm === 'round' ? 'completeRound' : 'endQuiz' }).then((ok) => {
              if (ok) setConfirm(null);
            })
          }
        />
      )}
      {details && (
        <Modal title={teamLabel(details)} onClose={() => setDetails(null)} wide>
          <div className="detail-scores">
            <div>
              <small>TOTAL SCORE</small>
              <strong>{total(quiz, details.id)}</strong>
            </div>
            {quiz.rounds.map((r) => (
              <div key={r.id}>
                <small>{r.name}</small>
                <strong>{total(quiz, details.id, r.id)}</strong>
              </div>
            ))}
          </div>
          <p className="muted">{details.members.join(' · ')}</p>
          <button
            className="btn"
            disabled={busy}
            onClick={() => {
              setAdjust(details);
              setDetails(null);
            }}
          >
            <Pencil size={16} /> Edit score / adjustment
          </button>
          <History quiz={quiz} act={act} busy={busy} teamId={details.id} />
        </Modal>
      )}
      {adjust && (
        <Adjustment
          team={adjust}
          quiz={quiz}
          act={act}
          busy={busy}
          onClose={() => setAdjust(null)}
        />
      )}
    </main>
  );
}
export function Projector({ quiz }: { quiz: Quiz }) {
  const round = quiz.rounds[quiz.state.roundIndex],
    a = currentAssignment(quiz);
  if (!round)
    return (
      <main className="projector">
        <h1>{quiz.name}</h1>
        <p>The quiz will begin shortly.</p>
      </main>
    );
  return (
    <main className="projector">
      <div className="projector-top">
        <span className="brand-word">
          <Zap size={26} /> QuiBuzz <small>ON STAGE</small>
        </span>
        <button
          className="icon-btn"
          aria-label="Toggle fullscreen"
          onClick={() => {
            if (document.fullscreenElement) void document.exitFullscreen();
            else void document.documentElement.requestFullscreen().catch(() => {});
          }}
        >
          <Maximize size={22} />
        </button>
      </div>
      <header>
        <p className="eyebrow">
          {quiz.status === 'QUIZ_COMPLETE'
            ? 'QUIZ COMPLETE · FINAL RESULTS'
            : quiz.status === 'ROUND_COMPLETE'
              ? 'ROUND COMPLETE'
              : `ROUND ${quiz.state.roundIndex + 1} OF ${quiz.rounds.length} · ${round.name}`}
        </p>
        <h1>{quiz.name}</h1>
        <p>Hosted by {roundMaster(quiz)}</p>
      </header>
      <div className="projector-layout">
        <Leaderboard quiz={quiz} />
        <aside>
          <div className="panel projector-question">
            <span className="eyebrow">CURRENT QUESTION</span>
            <strong>
              {String(quiz.state.question).padStart(2, '0')}
              <small> / {round.questions}</small>
            </strong>
            <div className="progress">
              <span style={{ width: `${(quiz.state.question / round.questions) * 100}%` }} />
            </div>
            <span className="eyebrow">DIRECT TEAM</span>
            <h2>{teamLabel(quiz.teams.find((t) => t.id === a?.directTeamId))}</h2>
          </div>
          <TimerDisplay quiz={quiz} projector />
        </aside>
      </div>
      <div className="projector-footer">
        <span className="status-dot" /> LIVE SCORES · EVERY POINT COUNTS
      </div>
    </main>
  );
}
