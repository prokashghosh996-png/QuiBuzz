import { Trophy, ArrowUpRight, Download } from 'lucide-react';
import { standings, total, type Quiz } from '../../shared/types';
export function Leaderboard({
  quiz,
  compact = false,
  showPlayers = false,
}: {
  quiz: Quiz;
  compact?: boolean;
  showPlayers?: boolean;
}) {
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
        {standings(quiz).map(({ team, score, rank, tied }) => (
          <div className={`leader-row ${rank === 1 ? 'first' : ''}`} key={team.id}>
            <span className="rank">
              {rank === 1 ? <Trophy size={17} /> : String(rank).padStart(2, '0')}
            </span>
            <span className={`avatar color-${team.initialOrder % 6}`}>{team.letter}</span>
            <div className="leader-name">
              <strong>{team.name || `Team ${team.letter}`}</strong>
              {showPlayers && team.members.length > 0 && (
                <small className="leader-players">{team.members.join(' - ')}</small>
              )}
              <small>
                Team {team.letter}
                {tied ? ' · Tied' : ''}
              </small>
            </div>
            <b className="leader-score" key={score}>
              {score}
            </b>
          </div>
        ))}
      </div>
      <div className="leader-foot">
        <span className="status-dot" /> Updates live with every score <ArrowUpRight size={14} />
      </div>
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
