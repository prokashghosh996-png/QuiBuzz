export type Status = 'SETUP' | 'READY' | 'LIVE' | 'ROUND_COMPLETE' | 'QUIZ_COMPLETE';
export type ScoreType =
  'DIRECT_CORRECT' | 'BONUS_CORRECT' | 'POUNCE_CORRECT' | 'POUNCE_WRONG' | 'MANUAL_ADJUSTMENT';
export interface Draft {
  name: string;
  master: string;
  positive: number;
  negative: number;
  pounceSeconds: number;
  step: number;
  teams: { name: string; members: string[] }[];
  rounds: { name: string; questions: number; master?: string }[];
}
export interface QuestionState {
  directTeamId: string;
  nextTeamId: string;
  bounceTeamId: string | null;
}
export interface LiveState {
  roundMasters?: Record<string, string>;
  roundIndex: number;
  question: number;
  order: string[];
  assignments: Record<string, QuestionState>;
  timer: { remainingMs: number; endsAt: number | null };
}
export interface Team {
  id: string;
  letter: string;
  name: string;
  members: string[];
  initialOrder: number;
}
export interface Round {
  id: string;
  name: string;
  questions: number;
  order: number;
}
export interface ScoreEvent {
  id: string;
  teamId: string;
  roundId: string;
  question: number;
  type: ScoreType;
  marks: number;
  reason: string;
  createdAt: string;
  voidedAt: string | null;
  voidReason: string | null;
  replacesId: string | null;
}
export interface Quiz {
  id: string;
  name: string;
  master: string;
  status: Status;
  positive: number;
  negative: number;
  pounceSeconds: number;
  version: number;
  draft: Draft;
  state: LiveState;
  teams: Team[];
  rounds: Round[];
  events: ScoreEvent[];
  updatedAt: string;
}
export interface QuizListItem {
  id: string;
  name: string;
  master: string;
  status: Status;
  updatedAt: string;
  _count: { teams: number; rounds: number };
}
export const scoreLabels: Record<ScoreType, string> = {
  DIRECT_CORRECT: 'Direct',
  BONUS_CORRECT: 'Bonus',
  POUNCE_CORRECT: 'Pounce',
  POUNCE_WRONG: 'Pounce',
  MANUAL_ADJUSTMENT: 'Adjustment',
};
export const defaultDraft = (): Draft => ({
  name: '',
  master: '',
  positive: 10,
  negative: 5,
  pounceSeconds: 5,
  step: 0,
  teams: Array.from({ length: 4 }, () => ({ name: '', members: ['', ''] })),
  rounds: [
    { name: 'General knowledge', questions: 12 },
    { name: 'Technology', questions: 10 },
    { name: 'Rapid fire', questions: 8 },
  ],
});
export const emptyState = (): LiveState => ({
  roundIndex: 0,
  question: 1,
  order: [],
  assignments: {},
  timer: { remainingMs: 5000, endsAt: null },
});
export function teamLetter(index: number): string {
  let s = '';
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26))
    s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}
export const teamLabel = (t?: Team) =>
  t ? `Team ${t.letter}${t.name ? ` — ${t.name}` : ''}` : '—';
export const points = (n: number) => `${n >= 0 ? '+' : '−'}${Math.abs(n)}`;
export const total = (quiz: Quiz, teamId: string, roundId?: string) =>
  quiz.events
    .filter((e) => !e.voidedAt && e.teamId === teamId && (!roundId || e.roundId === roundId))
    .reduce((sum, e) => sum + e.marks, 0);
export function standings(quiz: Quiz) {
  const rows = quiz.teams
    .map((team) => ({ team, score: total(quiz, team.id) }))
    .sort((a, b) => b.score - a.score || a.team.initialOrder - b.team.initialOrder);
  return rows.map((row) => ({
    ...row,
    rank: rows.findIndex((r) => r.score === row.score) + 1,
    tied: rows.filter((r) => r.score === row.score).length > 1,
  }));
}
export const questionKey = (s: LiveState) => `${s.roundIndex}:${s.question}`;
export const currentAssignment = (q: Quiz) => q.state.assignments[questionKey(q.state)];
export const followingTeam = (order: string[], id: string) =>
  order[(order.indexOf(id) + 1) % order.length];

export const roundMaster = (q: Quiz, index = q.state.roundIndex) =>
  q.state.roundMasters?.[q.rounds[index]?.id] || q.draft.rounds[index]?.master?.trim() || q.master;

// Manual corrections do not count as another scoring attempt.
export function hasQuestionScore(
  events: ReadonlyArray<
    Pick<ScoreEvent, 'teamId' | 'roundId' | 'question' | 'type'> & { voidedAt: unknown }
  >,
  teamId: string,
  roundId: string,
  question: number,
): boolean {
  return events.some(
    (event) =>
      !event.voidedAt &&
      event.teamId === teamId &&
      event.roundId === roundId &&
      event.question === question &&
      event.type !== 'MANUAL_ADJUSTMENT',
  );
}
