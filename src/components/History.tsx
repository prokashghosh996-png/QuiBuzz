import { useState } from 'react';
import { History as HistoryIcon, Pencil, Trash2, Undo2, Search, Filter } from 'lucide-react';
import {
  points,
  scoreLabels,
  teamLabel,
  total,
  type Quiz,
  type ScoreEvent,
  type Team,
} from '../../shared/types';
import type { Act } from '../useQuiz';
import { Field, Modal } from './ui';
export function EventEditor({
  event,
  act,
  busy,
  onClose,
  remove = false,
}: {
  event: ScoreEvent;
  act: Act;
  busy: boolean;
  onClose: () => void;
  remove?: boolean;
}) {
  const [marks, setMarks] = useState(event.marks);
  const [reason, setReason] = useState('');
  return (
    <Modal title={remove ? 'Remove scoring entry?' : 'Correct scoring entry'} onClose={onClose}>
      <p className="muted">
        {remove
          ? 'This score will be excluded from totals. The original entry and your reason remain in history.'
          : 'The original entry will stay in history and a replacement score will be recorded.'}
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void act(
            remove
              ? { type: 'void', eventId: event.id, reason }
              : { type: 'editEvent', eventId: event.id, marks, reason },
          ).then((ok) => {
            if (ok) onClose();
          });
        }}
        className="form-stack"
      >
        {!remove && (
          <Field label="Corrected points (signed)">
            <input
              type="number"
              required
              min={-100000}
              max={100000}
              value={marks}
              onChange={(e) => setMarks(Number(e.target.value))}
            />
          </Field>
        )}
        <Field label="Reason">
          <textarea
            autoFocus
            required
            maxLength={500}
            value={reason}
            placeholder="Explain this correction"
            onChange={(e) => setReason(e.target.value)}
          />
        </Field>
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            className={`btn ${remove ? 'danger-solid' : 'primary'}`}
            disabled={busy || !reason.trim()}
          >
            {remove ? 'Remove entry' : 'Save correction'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
export function Adjustment({
  team,
  quiz,
  act,
  busy,
  onClose,
}: {
  team: Team;
  quiz: Quiz;
  act: Act;
  busy: boolean;
  onClose: () => void;
}) {
  const [marks, setMarks] = useState(0);
  const [reason, setReason] = useState('');
  return (
    <Modal title={`Adjust ${team.name || `Team ${team.letter}`}`} onClose={onClose}>
      <p className="muted">
        Current total: <strong>{total(quiz, team.id)}</strong>. This adjustment is recorded in{' '}
        {quiz.rounds[quiz.state.roundIndex].name}, question {quiz.state.question}.
      </p>
      <form
        className="form-stack"
        onSubmit={(e) => {
          e.preventDefault();
          void act({ type: 'adjust', teamId: team.id, marks, reason }).then((ok) => {
            if (ok) onClose();
          });
        }}
      >
        <Field label="Adjustment points" hint="Use a signed amount, such as 5 or -10.">
          <input
            autoFocus
            required
            type="number"
            min={-100000}
            max={100000}
            value={marks}
            onChange={(e) => setMarks(Number(e.target.value))}
          />
        </Field>
        <Field label="Reason">
          <textarea
            required
            value={reason}
            maxLength={500}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Accepted alternate answer"
          />
        </Field>
        <div className="info-box">
          New total: <strong>{total(quiz, team.id) + marks}</strong>
        </div>
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" disabled={busy || !reason.trim() || marks === 0}>
            Record adjustment
          </button>
        </div>
      </form>
    </Modal>
  );
}
export function History({
  quiz,
  act,
  busy,
  compact = false,
  teamId,
  onAll,
}: {
  quiz: Quiz;
  act: Act;
  busy: boolean;
  compact?: boolean;
  teamId?: string;
  onAll?: () => void;
}) {
  const [filter, setFilter] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selectedTeam, setSelectedTeam] = useState('');
  const [question, setQuestion] = useState('');
  const [sort, setSort] = useState('recent');
  const [showVoided, setShowVoided] = useState(true);
  const [edit, setEdit] = useState<{ event: ScoreEvent; remove: boolean } | null>(null);
  const all = quiz.events
    .slice()
    .reverse()
    .filter(
      (e) =>
        (!teamId || e.teamId === teamId) &&
        (!selectedTeam || e.teamId === selectedTeam) &&
        (!question || e.question === Number(question)) &&
        (showVoided || !e.voidedAt) &&
        (!filter ||
          `${teamLabel(quiz.teams.find((t) => t.id === e.teamId))} ${scoreLabels[e.type]} ${e.reason}`
            .toLowerCase()
            .includes(filter.toLowerCase())),
    );
  if (sort === 'team')
    all.sort(
      (a, b) =>
        (quiz.teams.find((t) => t.id === a.teamId)?.initialOrder ?? 0) -
        (quiz.teams.find((t) => t.id === b.teamId)?.initialOrder ?? 0),
    );
  if (sort === 'question')
    all.sort(
      (a, b) =>
        (quiz.rounds.find((r) => r.id === a.roundId)?.order ?? 0) -
          (quiz.rounds.find((r) => r.id === b.roundId)?.order ?? 0) || a.question - b.question,
    );
  const events = compact ? all.slice(0, 5) : all;
  return (
    <section className={`panel history-panel ${compact ? 'compact' : ''}`}>
      <div className="section-heading">
        <h2>
          <HistoryIcon size={19} /> {compact ? 'Recent activity' : 'Score history'}
        </h2>
        {compact ? (
          <button className="text-btn" onClick={onAll}>
            View all
          </button>
        ) : (
          <button
            className="btn"
            disabled={busy || !quiz.events.some((e) => !e.voidedAt)}
            onClick={() => void act({ type: 'undo' })}
          >
            <Undo2 size={16} /> Undo last score
          </button>
        )}
      </div>
      {!compact && (
        <div className="history-filters">
          <button
            className="btn"
            aria-expanded={filtersOpen}
            onClick={() => setFiltersOpen(!filtersOpen)}
          >
            <Filter size={16} /> Filter / sort
          </button>
          {filtersOpen && (
            <>
              {!teamId && (
                <Field label="Team">
                  <select value={selectedTeam} onChange={(e) => setSelectedTeam(e.target.value)}>
                    <option value="">All teams</option>
                    {quiz.teams.map((t) => (
                      <option key={t.id} value={t.id}>
                        {teamLabel(t)}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
              <Field label="Question number">
                <input
                  type="number"
                  min={1}
                  placeholder="All questions"
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                />
              </Field>
              <Field label="Sort by">
                <select value={sort} onChange={(e) => setSort(e.target.value)}>
                  <option value="recent">Most recent</option>
                  <option value="team">Team order</option>
                  <option value="question">Round and question number</option>
                </select>
              </Field>
              <button
                className="btn"
                onClick={() => {
                  setSelectedTeam('');
                  setQuestion('');
                  setSort('recent');
                  setFilter('');
                }}
              >
                Clear filters
              </button>
            </>
          )}
          <label className="search">
            <Search size={17} />
            <input
              aria-label="Search score history"
              placeholder="Search teams or actions…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
          </label>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={showVoided}
              onChange={(e) => setShowVoided(e.target.checked)}
            />{' '}
            Show removed entries
          </label>
        </div>
      )}
      <div className="activity-list">
        {!events.length && (
          <div className="empty-small">
            <HistoryIcon size={26} />
            <strong>No scores yet</strong>
            <p>Every point awarded will appear here.</p>
          </div>
        )}
        {events.map((e) => {
          const t = quiz.teams.find((t) => t.id === e.teamId)!;
          const r = quiz.rounds.find((r) => r.id === e.roundId)!;
          return (
            <div className={`activity-row ${e.voidedAt ? 'voided' : ''}`} key={e.id}>
              <span className={`avatar small color-${t.initialOrder % 6}`}>{t.letter}</span>
              <div className="activity-main">
                <strong>{t.name || `Team ${t.letter}`}</strong>
                <span>
                  {scoreLabels[e.type]} · R{r.order + 1}, Q{e.question}
                  {e.replacesId ? ' · Corrected' : ''}
                </span>
                {e.reason && <small>{e.reason}</small>}
                {e.voidedAt && <small className="red">Removed: {e.voidReason}</small>}
                <time dateTime={e.createdAt}>
                  {new Date(e.createdAt).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                  })}
                </time>
              </div>
              <b className={e.marks < 0 ? 'red' : 'green'}>{points(e.marks)}</b>
              {!compact && !e.voidedAt && (
                <div className="entry-actions">
                  <button
                    className="icon-btn"
                    disabled={busy}
                    aria-label={`Edit ${t.name || t.letter} score`}
                    onClick={() => setEdit({ event: e, remove: false })}
                  >
                    <Pencil size={15} />
                  </button>
                  <button
                    className="icon-btn red"
                    disabled={busy}
                    aria-label={`Remove ${t.name || t.letter} score`}
                    onClick={() => setEdit({ event: e, remove: true })}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {edit && <EventEditor {...edit} act={act} busy={busy} onClose={() => setEdit(null)} />}
    </section>
  );
}
