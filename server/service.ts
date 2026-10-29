import { Prisma } from '@prisma/client';
import { isDeepStrictEqual } from 'node:util';
import { db } from './db.js';
import {
  defaultDraft,
  emptyState,
  getNonBounceDirectTeam,
  getNonBounceNextTeam,
  hasQuestionScore,
  nextTeamInDirection,
  questionKey,
  resolveBounceNextTeamId,
  teamLetter,
  type Draft,
  type LiveState,
  type RotationDirection,
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
export async function getQuiz(id: string, ownerId?: string) {
  const quiz = await db.quiz.findUnique({
    where: { id, ...(ownerId ? { ownerId } : {}) },
    include,
  });
  if (!quiz) throw new HttpError(404, 'This quiz could not be found.');
  return quiz;
}
export async function createQuiz(draft: Draft = defaultDraft(), ownerId?: string) {
  return db.quiz.create({
    data: {
      ownerId,
      name: draft.name || 'Untitled quiz',
      draft: json(draft),
      state: json(emptyState()),
    },
    include,
  });
}

export async function command(quizId: string, body: unknown, ownerId?: string) {
  const { requestId, version, action } = commandSchema.parse(body);
  await db.$transaction(
    async (tx) => {
      // PostgreSQL's row lock serializes every mutation for this quiz, including undo.
      await tx.$queryRaw`SELECT id FROM "Quiz" WHERE id = ${quizId} FOR UPDATE`;
      const q = await tx.quiz.findUnique({ where: { id: quizId }, include });
      if (!q || (ownerId && q.ownerId !== ownerId)) throw new HttpError(404, 'Quiz not found.');
      const previous = await tx.command.findUnique({ where: { id: requestId } });
      if (previous) {
        if (previous.quizId !== quizId || !isDeepStrictEqual(previous.payload, action))
          fail('Request ID already used for a different action.');
        return;
      }
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
      const currentRound = () => q.rounds[s.roundIndex];
      const currentDirection = (roundId?: string): RotationDirection => {
        const targetRoundId = roundId ?? currentRound()?.id;
        if (targetRoundId && s.roundDirections?.[targetRoundId]) {
          return s.roundDirections[targetRoundId];
        }
        const roundIdx = targetRoundId
          ? q.rounds.findIndex((r) => r.id === targetRoundId)
          : s.roundIndex;
        return (q.draft as unknown as Draft).rounds[roundIdx]?.direction || 'CLOCKWISE';
      };
      const initQuestion = (direct: string) => {
        const dir = currentDirection();
        s.assignments[questionKey(s)] ??= {
          directTeamId: direct,
          nextTeamId:
            s.bounceEnabled === false
              ? getNonBounceNextTeam(s.order, s.question, dir)
              : nextTeamInDirection(s.order, direct, dir),
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
          const createdRounds = [];
          for (const [i, r] of d.rounds.entries())
            createdRounds.push(
              await tx.round.create({
                data: { quizId, name: r.name.trim(), questions: r.questions, order: i },
              }),
            );
          s.bounceEnabled = d.bounceEnabled ?? true;
          s.order = teams.map((t) => t.id);
          s.roundDirections = {};
          for (const [i, r] of d.rounds.entries()) {
            s.roundDirections[createdRounds[i].id] = r.direction || 'CLOCKWISE';
          }
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
            hasQuestionScore(q.events, action.teamId, round.id, s.question)
          )
            fail(
              'This team already has a score for this question. Edit or undo its existing score.',
            );
          if (
            action.type === 'score' &&
            (action.scoreType === 'BONUS_CORRECT' || action.scoreType === 'DIRECT_CORRECT')
          ) {
            const currentDirectBonusEvents = q.events.filter(
              (event) =>
                !event.voidedAt &&
                event.roundId === round.id &&
                event.question === s.question &&
                (event.type === 'DIRECT_CORRECT' || event.type === 'BONUS_CORRECT'),
            );
            const awardedMarks = currentDirectBonusEvents.reduce(
              (sum, event) => sum + event.marks,
              0,
            );
            const remainingMarks = Math.max(0, q.positive - awardedMarks);
            const directAlreadyAwarded = currentDirectBonusEvents.some(
              (event) => event.type === 'DIRECT_CORRECT',
            );

            if (action.scoreType === 'DIRECT_CORRECT' && directAlreadyAwarded) {
              fail('Direct is closed: Direct points were already awarded for this question.');
            }

            if (action.marks !== undefined) {
              if (remainingMarks <= 0) {
                fail(
                  action.scoreType === 'DIRECT_CORRECT'
                    ? 'Direct is closed: Direct or Bonus points were already awarded for this question.'
                    : 'Bonus is closed: Direct or Bonus points were already awarded for this question.',
                );
              }
              if (action.marks > remainingMarks) {
                fail(
                  `Cannot award ${action.marks} points. Only ${remainingMarks} points remain for this question.`,
                );
              }
            } else if (awardedMarks > 0 || remainingMarks < q.positive) {
              fail(
                action.scoreType === 'DIRECT_CORRECT'
                  ? 'Direct is closed: Direct or Bonus points were already awarded for this question.'
                  : 'Bonus is closed: Direct or Bonus points were already awarded for this question.',
              );
            }
          }
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
                  : action.marks !== undefined
                    ? action.marks
                    : action.scoreType === 'POUNCE_WRONG'
                      ? -q.negative
                      : q.positive,
              reason:
                action.type === 'adjust'
                  ? action.reason
                  : action.reason ||
                    (action.marks !== undefined
                      ? action.scoreType === 'DIRECT_CORRECT'
                        ? 'Part Direct'
                        : 'Part Bonus'
                      : ''),
            },
          });
          if (
            action.type === 'score' &&
            s.bounceEnabled !== false &&
            (action.scoreType === 'DIRECT_CORRECT' || action.scoreType === 'BONUS_CORRECT')
          )
            assignment().nextTeamId = resolveBounceNextTeamId(
              s.order,
              assignment().directTeamId,
              [
                ...q.events,
                {
                  teamId: action.teamId,
                  roundId: round.id,
                  question: s.question,
                  type: action.scoreType,
                  voidedAt: null,
                },
              ],
              round.id,
              s.question,
              currentDirection(),
            );
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
          if (s.bounceEnabled !== false) {
            const updatedEvents = q.events.map((e) =>
              e.id === event.id ? { ...e, voidedAt: new Date() } : e,
            );
            assignment().nextTeamId = resolveBounceNextTeamId(
              s.order,
              assignment().directTeamId,
              updatedEvents,
              round.id,
              s.question,
              currentDirection(),
            );
          }
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
          const updatedEvents = q.events.map((e) =>
            e.id === event.id ? { ...e, voidedAt: new Date() } : e,
          );
          if (action.type === 'editEvent') {
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
            updatedEvents.push({
              ...event,
              id: 'edit-replacement',
              marks: action.marks,
              reason: action.reason,
              voidedAt: null,
            });
          }
          if (s.bounceEnabled !== false) {
            assignment().nextTeamId = resolveBounceNextTeamId(
              s.order,
              assignment().directTeamId,
              updatedEvents,
              round.id,
              s.question,
              currentDirection(),
            );
          }
          break;
        }
        case 'navigate': {
          live();
          const next = s.question + action.delta;
          if (next < 1 || next > round.questions) fail('Question is outside the current round.');
          const dir = currentDirection();
          const direct =
            s.bounceEnabled === false
              ? getNonBounceDirectTeam(s.order, next, dir)
              : assignment().nextTeamId;
          s.question = next;
          initQuestion(direct);
          resetTimer();
          break;
        }
        case 'bounceMode': {
          started();
          s.bounceEnabled = action.enabled;
          const dir = currentDirection();
          assignment().nextTeamId = action.enabled
            ? resolveBounceNextTeamId(
                s.order,
                assignment().directTeamId,
                q.events,
                round.id,
                s.question,
                dir,
              )
            : getNonBounceNextTeam(s.order, s.question, dir);
          break;
        }
        case 'assign':
          live();
          team(action.teamId);
          if (action.target === 'nextTeamId' && s.bounceEnabled === false)
            fail('Enable bounce rotation to override the next direct team.');
          assignment()[action.target] = action.teamId;
          if (action.target === 'directTeamId' && s.bounceEnabled !== false)
            assignment().nextTeamId = resolveBounceNextTeamId(
              s.order,
              action.teamId,
              q.events,
              round.id,
              s.question,
              currentDirection(),
            );
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
          const dir = currentDirection();
          assignment().nextTeamId =
            s.bounceEnabled === false
              ? getNonBounceNextTeam(s.order, s.question, dir)
              : resolveBounceNextTeamId(
                  s.order,
                  assignment().directTeamId,
                  q.events,
                  round.id,
                  s.question,
                  dir,
                );
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
        case 'roundDirection': {
          started();
          const targetRoundId = action.roundId || round.id;
          if (!q.rounds.some((r) => r.id === targetRoundId))
            fail('Round does not belong to this quiz.');
          s.roundDirections = { ...s.roundDirections, [targetRoundId]: action.direction };
          if (targetRoundId === round.id) {
            assignment().nextTeamId =
              s.bounceEnabled === false
                ? getNonBounceNextTeam(s.order, s.question, action.direction)
                : resolveBounceNextTeamId(
                    s.order,
                    assignment().directTeamId,
                    q.events,
                    round.id,
                    s.question,
                    action.direction,
                  );
          }
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
          const nextR = q.rounds[s.roundIndex];
          if (action.master)
            s.roundMasters = { ...s.roundMasters, [nextR.id]: action.master };
          if (action.direction)
            s.roundDirections = { ...s.roundDirections, [nextR.id]: action.direction };
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
          if (action.direction)
            s.roundDirections = { ...s.roundDirections, [tieRound.id]: action.direction };
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

export async function createDemo(ownerId?: string) {
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
  let q = await createQuiz(d, ownerId);
  const act = async (action: unknown) => {
    q = await command(
      q.id,
      { requestId: crypto.randomUUID(), version: q.version, action },
      ownerId,
    );
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
