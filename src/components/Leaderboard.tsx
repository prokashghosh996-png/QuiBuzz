import { useEffect, useRef, useState } from 'react';
import { Trophy, ArrowUpRight, Download, History as HistoryIcon } from 'lucide-react';
import {
  standings,
  total,
  points,
  scoreLabels,
  type Quiz,
  type Team,
} from '../../shared/types';
import { Modal } from './ui';

interface ScoreChange {
  delta: number;
  timestamp: number;
}

export function Leaderboard({
  quiz,
  compact = false,
  showPlayers = false,
  interactive = true,
}: {
  quiz: Quiz;
  compact?: boolean;
  showPlayers?: boolean;
  interactive?: boolean;
}) {
  const prevScoresRef = useRef<Record<string, number>>({});
  const [changes, setChanges] = useState<Record<string, ScoreChange>>({});
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);

  useEffect(() => {
    const currentScores: Record<string, number> = {};
    const newChanges: Record<string, ScoreChange> = {};
    const now = Date.now();

    for (const team of quiz.teams) {
      const currentScore = total(quiz, team.id);
      currentScores[team.id] = currentScore;

      const prevScore = prevScoresRef.current[team.id];
      // Only trigger animation if we had a recorded previous score and it changed
      if (prevScore !== undefined && currentScore !== prevScore) {
        newChanges[team.id] = {
          delta: currentScore - prevScore,
          timestamp: now,
        };
      }
    }

    prevScoresRef.current = currentScores;

    if (Object.keys(newChanges).length > 0) {
      setChanges((prev) => ({ ...prev, ...newChanges }));
      const timer = setTimeout(() => {
        setChanges((prev) => {
          const next = { ...prev };
          for (const id of Object.keys(newChanges)) {
            if (next[id]?.timestamp === now) {
              delete next[id];
            }
          }
          return next;
        });
      }, 2500);
      return () => clearTimeout(timer);
    }
  }, [quiz]);

  return (
    <section className={`panel leaderboard ${compact ? 'compact' : ''}`}>
      <div className="section-heading">
        <h2>
          <Trophy size={19} />{' '}
          {quiz.status === 'QUIZ_COMPLETE' ? 'Final leaderboard' : 'Live leaderboard'}
        </h2>
        <span className="badge neutral">TOTAL</span>
      </div>
      <div className="leader-list">
        {standings(quiz).map(({ team, score, rank, tied }) => {
          const change = changes[team.id];
          const isPositive = change && change.delta > 0;
          const isNegative = change && change.delta < 0;

          const rowFlashClass = isPositive
            ? 'score-flash-positive'
            : isNegative
              ? 'score-flash-negative'
              : '';

          const pulseClass = isPositive
            ? 'score-pulse-positive'
            : isNegative
              ? 'score-pulse-negative'
              : '';

          return (
            <div
              className={`leader-row ${rank === 1 ? 'first' : ''} ${interactive ? 'clickable' : ''
                } ${rowFlashClass}`}
              key={team.id}
              role={interactive ? 'button' : undefined}
              tabIndex={interactive ? 0 : undefined}
              aria-label={
                interactive
                  ? `View score history for ${team.name || `Team ${team.letter}`}`
                  : undefined
              }
              onClick={interactive ? () => setSelectedTeam(team) : undefined}
              onKeyDown={
                interactive
                  ? (e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setSelectedTeam(team);
                    }
                  }
                  : undefined
              }
            >
              <span className="rank">
                {rank === 1 ? <Trophy size={17} /> : String(rank).padStart(2, '0')}
              </span>
              <span className={`avatar color-${team.initialOrder % 6}`}>{team.letter}</span>
              <div className="leader-name">
                <strong>{team.name || `Team ${team.letter}`}</strong>
                {showPlayers && team.members.length > 0 && (
                  <small className="leader-players">{team.members.join(' · ')}</small>
                )}
                <small>
                  Team {team.letter}
                  {tied ? ' · Tied' : ''}
                </small>
              </div>
              <div className="leader-score-wrapper">
                {change && (
                  <span
                    key={`${team.id}-${change.timestamp}`}
                    className={`projector-score-badge ${isPositive ? 'positive' : 'negative'}`}
                  >
                    {isPositive ? `+${change.delta}` : change.delta}
                  </span>
                )}
                <b className={`leader-score ${pulseClass}`} key={score}>
                  {score}
                </b>
              </div>
            </div>
          );
        })}
      </div>
      <div className="leader-foot">
        <span>
          <span className="status-dot" /> Updates live with every score
        </span>
        {interactive && (
          <span className="leader-tap-hint">
            <HistoryIcon size={12} /> Tap team for history
          </span>
        )}
        <ArrowUpRight size={14} />
      </div>

      {selectedTeam && (
        <Modal
          title={`Team ${selectedTeam.letter} Score History`}
          onClose={() => setSelectedTeam(null)}
        >
          <div className="team-history-dialog">
            <div className="team-history-header">
              <div className="team-history-identity">
                <span className={`avatar color-${selectedTeam.initialOrder % 6}`}>
                  {selectedTeam.letter}
                </span>
                <div>
                  <h3>{selectedTeam.name || `Team ${selectedTeam.letter}`}</h3>
                  {selectedTeam.members.length > 0 && (
                    <p className="team-members-list">{selectedTeam.members.join(' · ')}</p>
                  )}
                </div>
              </div>
              <div className="team-history-score-box">
                <span className="score-box-label">CURRENT SCORE</span>
                <strong className="score-box-value">{total(quiz, selectedTeam.id)}</strong>
              </div>
            </div>

            {quiz.rounds.length > 1 && (
              <div className="team-round-breakdown">
                {quiz.rounds.map((round, idx) => {
                  const roundScore = total(quiz, selectedTeam.id, round.id);
                  return (
                    <div key={round.id} className="team-round-pill">
                      <span className="round-pill-name">R{idx + 1}: {round.name}</span>
                      <b
                        className={`round-pill-score ${roundScore > 0 ? 'green' : roundScore < 0 ? 'red' : ''
                          }`}
                      >
                        {points(roundScore)}
                      </b>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="team-history-section">
              <span className="eyebrow">QUESTION-BY-QUESTION BREAKDOWN</span>
              {(() => {
                const events = quiz.events
                  .filter((e) => !e.voidedAt && e.teamId === selectedTeam.id)
                  .slice()
                  .reverse();

                if (events.length === 0) {
                  return (
                    <div className="team-history-empty">
                      <HistoryIcon size={24} />
                      <p>No score history yet for this team.</p>
                      <small className="muted">Points scored or deducted will appear here.</small>
                    </div>
                  );
                }

                return (
                  <div className="team-history-list">
                    {events.map((e) => {
                      const roundIdx = quiz.rounds.findIndex((r) => r.id === e.roundId);
                      const roundName =
                        roundIdx >= 0
                          ? quiz.rounds[roundIdx]?.name || `Round ${roundIdx + 1}`
                          : 'Round';
                      const isPositive = e.marks > 0;
                      const isNegative = e.marks < 0;

                      return (
                        <div
                          key={e.id}
                          className={`team-history-item ${isPositive ? 'positive' : isNegative ? 'negative' : ''
                            }`}
                        >
                          <div className="item-meta">
                            <span className="item-q-badge">Q{e.question}</span>
                            <div className="item-details">
                              <strong>
                                Question {e.question}
                                {quiz.rounds.length > 1 && (
                                  <span className="round-tag"> · {roundName}</span>
                                )}
                              </strong>
                              <div className="item-type-desc">
                                <span className="badge-type">
                                  {e.reason ||
                                    (e.type === 'POUNCE_CORRECT' && e.marks < quiz.positive
                                      ? 'Part Pounce'
                                      : scoreLabels[e.type])}
                                </span>
                                <span className="item-sentence">
                                  {isPositive
                                    ? `+${e.marks} added on Question ${e.question}`
                                    : isNegative
                                      ? `${e.marks} deducted on Question ${e.question}`
                                      : `0 points recorded`}
                                </span>
                                {e.reason &&
                                  !['Part Direct', 'Part Bonus', 'Part Pounce'].includes(
                                    e.reason,
                                  ) && <span className="item-reason">({e.reason})</span>}
                              </div>
                            </div>
                          </div>
                          <div
                            className={`item-points ${isPositive ? 'green' : isNegative ? 'red' : ''
                              }`}
                          >
                            {points(e.marks)}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
          </div>
        </Modal>
      )}
    </section>
  );
}

function csvCell(value: unknown) {
  let s = String(value);
  if (/^[=+@\-\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replaceAll('"', '""')}"`;
}

export function exportResults(q: Quiz) {
  const rows: unknown[][] = [
    ['Quiz', q.name],
    ['Quiz master', q.master],
    ['Status', q.status],
    [],
    ['Rank', 'Tied', 'Team', 'Name', 'Members', ...q.rounds.map((r) => r.name), 'Total'],
  ];
  standings(q).forEach(({ team, rank, tied, score }) =>
    rows.push([
      rank,
      tied ? 'TIED' : '',
      `Team ${team.letter}`,
      team.name,
      team.members.join(' / '),
      ...q.rounds.map((r) => total(q, team.id, r.id)),
      score,
    ]),
  );
  const blob = new Blob(['\uFEFF' + rows.map((row) => row.map(csvCell).join(',')).join('\r\n')], {
    type: 'text/csv;charset=utf-8;',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${q.name.replace(/[^a-z0-9]/gi, '-')}-results.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function ResultsTable({ quiz }: { quiz: Quiz }) {
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Rank</th>
            <th>Team</th>
            {quiz.rounds.map((r) => (
              <th key={r.id}>{r.name}</th>
            ))}
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          {standings(quiz).map(({ team, rank, score, tied }) => (
            <tr key={team.id}>
              <td>
                <strong>{rank}</strong>
                {tied && <small className="tie-label">TIED</small>}
              </td>
              <td>
                <strong>{team.name || `Team ${team.letter}`}</strong>
                <small>
                  Team {team.letter} · {team.members.join(', ')}
                </small>
              </td>
              {quiz.rounds.map((r) => (
                <td key={r.id}>{total(quiz, team.id, r.id)}</td>
              ))}
              <td>
                <b className="table-total">{score}</b>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ExportButton({ quiz }: { quiz: Quiz }) {
  return (
    <button className="btn" onClick={() => exportResults(quiz)}>
      <Download size={16} /> Export results
    </button>
  );
}
