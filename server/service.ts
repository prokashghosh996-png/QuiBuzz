import { Prisma } from '@prisma/client';
import { isDeepStrictEqual } from 'node:util';
import { db } from './db.js';
import {
  defaultDraft,
  emptyState,
  followingTeam,
  questionKey,
  teamLetter,
  type Draft,
  type LiveState,
} from '../shared/types.js';
import { commandSchema } from '../shared/validation.js';

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
const fail = (message: string): never => {
  throw new HttpError(409, message);
};
const json = (value: unknown) => value as Prisma.InputJsonValue;
const include = {
  teams: { orderBy: { initialOrder: 'asc' as const } },
  rounds: { orderBy: { order: 'asc' as const } },
  events: { orderBy: { sequence: 'asc' as const } },
};
export async function getQuiz(id: string) {
  const quiz = await db.quiz.findUnique({ where: { id }, include });
  if (!quiz) throw new HttpError(404, 'This quiz could not be found.');
  return quiz;
}
export async function createQuiz(draft: Draft = defaultDraft()) {
  return db.quiz.create({
    data: { name: draft.name || 'Untitled quiz', draft: json(draft), state: json(emptyState()) },
    include,
  });
}

export async function command(quizId: string, body: unknown) {
  const { requestId, version, action } = commandSchema.parse(body);
  await db.$transaction(
    async (tx) => {
      // PostgreSQL's row lock serializes every mutation for this quiz, including undo.
      await tx.$queryRaw`SELECT id FROM "Quiz" WHERE id = ${quizId} FOR UPDATE`;
      const previous = await tx.command.findUnique({ where: { id: requestId } });
      if (previous) {
        if (previous.quizId !== quizId || !isDeepStrictEqual(previous.payload, action))
          fail('Request ID already used for a different action.');
        return;
      }
      const q = await tx.quiz.findUnique({ where: { id: quizId }, include });
      if (!q) throw new HttpError(404, 'Quiz not found.');
      if (q.version !== version)
        fail(
          'The quiz changed in another window. The latest state has been loaded; check it before trying again.',
        );
      const s = structuredClone(q.state) as unknown as LiveState;
      const round = q.rounds[s.roundIndex];
      const assignment = () => s.assignments[questionKey(s)] ?? fail('No current question.');
      const team = (id: string) =>
        q.teams.find((t) => t.id === id) ?? fail('Team does not belong to this quiz.');
      const live = () => {
        if (q.status !== 'LIVE') fail('Resume the quiz before changing live controls.');
      };
      const started = () => {
        if (!round || ['SETUP', 'READY'].includes(q.status)) fail('Start the quiz first.');
      };
      const activeEvent = (id: string) =>
        q.events.find((e) => e.id === id && !e.voidedAt) ??
        fail('This scoring entry is already removed or does not exist.');
      const pause = () => {
        s.timer = {
          remainingMs: s.timer.endsAt
            ? Math.max(0, s.timer.endsAt - Date.now())
            : s.timer.remainingMs,
          endsAt: null,
        };
      };
      const resetTimer = () => {
        s.timer = { remainingMs: q.pounceSeconds * 1000, endsAt: null };
      };
      const initQuestion = (direct: string) => {
        s.assignments[questionKey(s)] ??= {
          directTeamId: direct,
          nextTeamId: followingTeam(s.order, direct),
          bounceTeamId: null,
        };
      };
      const update: Prisma.QuizUpdateInput = {};
      switch (action.type) {
        case 'saveDraft':
        case 'ready': {
          if (!['SETUP', 'READY'].includes(q.status))
            fail('Setup is locked after the quiz starts.');
          update.draft = json(action.draft);
          update.name = action.draft.name.trim() || 'Untitled quiz';
          update.master = action.draft.master.trim();
          update.status = action.type === 'ready' ? 'READY' : 'SETUP';
          break;
        }
        case 'start': {
          if (q.status !== 'READY') fail('Review and validate setup before starting.');
          const d = q.draft as unknown as Draft;
          const teams = [];
          for (const [i, t] of d.teams.entries())
            teams.push(
              await tx.team.create({
                data: {
                  quizId,
                  letter: teamLetter(i),
                  name: t.name.trim(),
                  members: t.members.map((m) => m.trim()),
                  initialOrder: i,
                },
              }),
            );
          for (const [i, r] of d.rounds.entries())
            await tx.round.create({
              data: { quizId, name: r.name.trim(), questions: r.questions, order: i },
            });
          s.order = teams.map((t) => t.id);
          s.roundIndex = 0;
          s.question = 1;
          initQuestion(s.order[0]);
          s.timer = { remainingMs: d.pounceSeconds * 1000, endsAt: null };
          update.positive = d.positive;
          update.negative = d.negative;
          update.pounceSeconds = d.pounceSeconds;
          update.status = 'LIVE';
          break;
        }
        case 'score':
        case 'adjust': {
          if (action.type === 'score') live();
          else started();
          team(action.teamId);
          if (
            action.type === 'score' &&
            action.scoreType === 'DIRECT_CORRECT' &&
            action.teamId !== assignment().directTeamId
          )
            fail('Only the current direct question team can receive Direct points.');
          if (
            action.type === 'score' &&
            action.scoreType === 'BONUS_CORRECT' &&
            action.teamId === assignment().directTeamId
          )
            fail('The current direct question team cannot receive Bonus points.');
          if (
            action.type === 'score' &&
            (action.scoreType === 'POUNCE_CORRECT' || action.scoreType === 'POUNCE_WRONG') &&
            action.teamId === assignment().directTeamId
          )
            fail('The current direct question team cannot pounce.');
            if (
              action.type === 'score' &&
              q.events.some(
                (event) =>
                  !event.voidedAt &&
                  event.teamId === action.teamId &&
                  event.roundId === round.id &&
                  event.question === s.question &&
                  event.type !== 'MANUAL_ADJUSTMENT',
              )
            )
              fail('This team already has a score for this question. Edit or undo its existing score.');
          await tx.scoreEvent.create({
            data: {
              quizId,
              teamId: action.teamId,
              roundId: round.id,
              question: s.question,
              type: action.type === 'score' ? action.scoreType : 'MANUAL_ADJUSTMENT',
              marks:
                action.type === 'adjust'
                  ? action.marks
                  : action.scoreType === 'POUNCE_WRONG'
                    ? -q.negative
                    : q.positive,
              reason: action.type === 'adjust' ? action.reason : '',
            },
          });
          if (
            action.type === 'score' &&
            (action.scoreType === 'DIRECT_CORRECT' || action.scoreType === 'BONUS_CORRECT')
          )
            assignment().nextTeamId = followingTeam(s.order, action.teamId);
          break;
        }
        case 'undo': {
          started();
          const event =
            q.events.filter((e) => !e.voidedAt).at(-1) ?? fail('There are no scores to undo.');
          await tx.scoreEvent.update({
            where: { id: event.id },
            data: { voidedAt: new Date(), voidReason: 'Undo last score' },
          });
          break;
        }
        case 'void':
        case 'editEvent': {
          started();
          const event = activeEvent(action.eventId);
          await tx.scoreEvent.update({
            where: { id: event.id },
            data: { voidedAt: new Date(), voidReason: action.reason },
          });
          if (action.type === 'editEvent')
            await tx.scoreEvent.create({
              data: {
                quizId,
                teamId: event.teamId,
                roundId: event.roundId,
                question: event.question,
                type: event.type,
                marks: action.marks,
                reason: action.reason,
                replacesId: event.id,
              },
            });
          break;
        }
        case 'navigate': {
          live();
          const next = s.question + action.delta;
          if (next < 1 || next > round.questions) fail('Question is outside the current round.');
          const direct = assignment().nextTeamId;
          s.question = next;
          initQuestion(direct);
          resetTimer();
          break;
        }
        case 'assign':
          live();
          team(action.teamId);
          assignment()[action.target] = action.teamId;
          if (action.target === 'directTeamId')
            assignment().nextTeamId = followingTeam(s.order, action.teamId);
          break;
        case 'order': {
          started();
          if (
            new Set(action.order).size !== q.teams.length ||
            action.order.length !== q.teams.length ||
            action.order.some((id) => !q.teams.some((t) => t.id === id))
          )
            fail('Team order must include each team exactly once.');
          s.order = action.order;
          assignment().nextTeamId = followingTeam(s.order, assignment().directTeamId);
          break;
        }
        case 'timer': {
          live();
          if (action.operation === 'reset') resetTimer();
          if (action.operation === 'pause') pause();
          if (action.operation === 'start' && (!s.timer.endsAt || s.timer.endsAt <= Date.now())) {
            const expired = s.timer.endsAt !== null && s.timer.endsAt <= Date.now();
            s.timer.endsAt =
              Date.now() +
              (!expired && s.timer.remainingMs > 0 ? s.timer.remainingMs : q.pounceSeconds * 1000);
          }
          break;
        }
        case 'roundMaster': {
          started();
          if (!q.rounds.some((r) => r.id === action.roundId))
            fail('Round does not belong to this quiz.');
          s.roundMasters = { ...s.roundMasters, [action.roundId]: action.master };
          break;
        }
        case 'settings': {
          started();
          if (
            (action.positive !== q.positive || action.negative !== q.negative) &&
            !action.confirmed
          )
            fail('Confirm the scoring rule change. Existing scores will remain unchanged.');
          update.positive = action.positive;
          update.negative = action.negative;
          update.pounceSeconds = action.pounceSeconds;
          if (q.pounceSeconds !== action.pounceSeconds)
            s.timer = { remainingMs: action.pounceSeconds * 1000, endsAt: null };
          break;
        }
        case 'completeRound':
          live();
          update.status = 'ROUND_COMPLETE';
          pause();
          break;
        case 'nextRound': {
          if (q.status !== 'ROUND_COMPLETE') fail('Complete the current round first.');
          if (s.roundIndex + 1 >= q.rounds.length) {
            update.status = 'QUIZ_COMPLETE';
            break;
          }
          s.roundIndex++;
          if (action.master)
            s.roundMasters = { ...s.roundMasters, [q.rounds[s.roundIndex].id]: action.master };
          s.question = 1;
          initQuestion(s.order[0]);
          resetTimer();
          update.status = 'LIVE';
          break;
        }
        case 'endQuiz':
          started();
          pause();
          update.status = 'QUIZ_COMPLETE';
          break;
        case 'resume':
          started();
          update.status = 'LIVE';
          break;
        case 'tieBreak': {
          if (q.status !== 'QUIZ_COMPLETE')
            fail('Finish the quiz before adding a tie-break round.');
          const number = q.rounds.filter((r) => r.name.startsWith('Tie-break')).length + 1;
          const tieRound = await tx.round.create({
            data: { quizId, name: `Tie-break ${number}`, questions: 1, order: q.rounds.length },
          });
          if (action.master) s.roundMasters = { ...s.roundMasters, [tieRound.id]: action.master };
          s.roundIndex = q.rounds.length;
          s.question = 1;
          initQuestion(s.order[0]);
          resetTimer();
          update.status = 'LIVE';
          break;
        }
        case 'reset': {
          started();
          await tx.scoreEvent.updateMany({
            where: { quizId, voidedAt: null },
            data: {
              voidedAt: new Date(),
              voidReason: action.restart ? 'Quiz restarted' : 'Scores reset',
            },
          });
          if (action.restart) {
            s.roundIndex = 0;
            s.question = 1;
            s.assignments = {};
            initQuestion(s.order[0]);
            resetTimer();
            update.status = 'LIVE';
          }
          break;
        }
      }
      await tx.quiz.update({
        where: { id: quizId },
        data: { ...update, state: json(s), version: { increment: 1 } },
      });
      await tx.command.create({
        data: { id: requestId, quizId, action: action.type, payload: json(action) },
      });
    },
    { timeout: 15000 },
  );
  return getQuiz(quizId);
}

export async function createDemo() {
  const d = defaultDraft();
  d.name = 'CodeSphere Tech Quiz 2026';
  d.master = 'Alex Morgan';
  d.teams = [
    { name: 'Neural Strikers', members: ['Prokash', 'Rahul', 'Arjun'] },
    { name: 'Code Warriors', members: ['Ananya', 'Sneha'] },
    { name: 'Binary Brains', members: ['Riya', 'Aman'] },
    { name: 'The Debuggers', members: ['Sam', 'Ishaan'] },
    { name: 'Logic Legends', members: ['Priya', 'Dev'] },
    { name: 'Syntax Squad', members: ['Nisha', 'Rohan'] },
  ];
  let q = await createQuiz(d);
  const act = async (action: unknown) => {
    q = await command(q.id, { requestId: crypto.randomUUID(), version: q.version, action });
  };
  await act({ type: 'ready', draft: d });
  await act({ type: 'start' });
  await act({ type: 'score', teamId: q.teams[0].id, scoreType: 'DIRECT_CORRECT' });
  await act({ type: 'score', teamId: q.teams[2].id, scoreType: 'POUNCE_CORRECT' });
  await act({ type: 'navigate', delta: 1 });
  await act({ type: 'score', teamId: q.teams[1].id, scoreType: 'DIRECT_CORRECT' });
  await act({ type: 'score', teamId: q.teams[4].id, scoreType: 'POUNCE_CORRECT' });
  await act({ type: 'score', teamId: q.teams[3].id, scoreType: 'POUNCE_WRONG' });
  await act({ type: 'navigate', delta: 1 });
  await act({ type: 'score', teamId: q.teams[2].id, scoreType: 'DIRECT_CORRECT' });
  await act({ type: 'score', teamId: q.teams[0].id, scoreType: 'POUNCE_CORRECT' });
  await act({ type: 'score', teamId: q.teams[5].id, scoreType: 'POUNCE_CORRECT' });
  await act({ type: 'navigate', delta: 1 });
  return q;
}
