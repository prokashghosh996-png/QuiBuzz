import { z } from 'zod';
const count = (min: number, max = 1000) => z.number().int().min(min).max(max);
export const draftSchema = z.object({
  name: z.string().max(160),
  master: z.string().max(100),
  positive: count(1, 10000),
  negative: count(0, 10000),
  pounceSeconds: count(1, 3600),
  step: count(0, 5),
  bounceEnabled: z.boolean().optional(),
  teams: z
    .array(
      z.object({
        name: z.string().max(100),
        members: z.array(z.string().max(100)).min(1).max(100),
      }),
    )
    .min(2)
    .max(100),
  rounds: z
    .array(
      z.object({
        name: z.string().max(100),
        questions: count(1),
        master: z.string().trim().max(100).optional(),
      }),
    )
    .min(1)
    .max(100),
});
export const readySchema = draftSchema.superRefine((d, ctx) => {
  const issue = (path: (string | number)[], message: string) =>
    ctx.addIssue({ code: 'custom', path, message });
  if (!d.name.trim()) issue(['name'], 'Quiz name is required.');
  if (!d.master.trim()) issue(['master'], 'Quiz master name is required.');
  d.teams.forEach((t, i) =>
    t.members.forEach((m, j) => {
      if (!m.trim())
        issue(['teams', i, 'members', j], `Team ${i + 1}: member ${j + 1} needs a name.`);
    }),
  );
  d.rounds.forEach((r, i) => {
    if (!r.name.trim()) issue(['rounds', i, 'name'], `Round ${i + 1} needs a name.`);
  });
});
const id = z.string().min(1).max(100);
export const actionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('saveDraft'), draft: draftSchema }),
  z.object({ type: z.literal('ready'), draft: readySchema }),
  z.object({ type: z.literal('start') }),
  z.object({ type: z.literal('bounceMode'), enabled: z.boolean() }),
  z.object({
    type: z.literal('score'),
    teamId: id,
    scoreType: z.enum(['DIRECT_CORRECT', 'BONUS_CORRECT', 'POUNCE_CORRECT', 'POUNCE_WRONG']),
  }),
  z.object({
    type: z.literal('adjust'),
    teamId: id,
    marks: z.number().int().min(-100000).max(100000),
    reason: z.string().trim().min(1).max(500),
  }),
  z.object({ type: z.literal('undo') }),
  z.object({ type: z.literal('void'), eventId: id, reason: z.string().trim().min(1).max(500) }),
  z.object({
    type: z.literal('editEvent'),
    eventId: id,
    marks: z.number().int().min(-100000).max(100000),
    reason: z.string().trim().min(1).max(500),
  }),
  z.object({ type: z.literal('navigate'), delta: z.union([z.literal(-1), z.literal(1)]) }),
  z.object({
    type: z.literal('assign'),
    target: z.enum(['directTeamId', 'nextTeamId', 'bounceTeamId']),
    teamId: id,
  }),
  z.object({ type: z.literal('order'), order: z.array(id).min(2) }),
  z.object({ type: z.literal('timer'), operation: z.enum(['start', 'pause', 'reset']) }),
  z.object({
    type: z.literal('settings'),
    positive: count(1, 10000),
    negative: count(0, 10000),
    pounceSeconds: count(1, 3600),
    confirmed: z.boolean(),
  }),
  z.object({
    type: z.literal('roundMaster'),
    roundId: id,
    master: z.string().trim().min(1).max(100),
  }),
  z.object({ type: z.literal('completeRound') }),
  z.object({ type: z.literal('nextRound'), master: z.string().trim().min(1).max(100).optional() }),
  z.object({ type: z.literal('endQuiz') }),
  z.object({ type: z.literal('resume') }),
  z.object({ type: z.literal('tieBreak'), master: z.string().trim().min(1).max(100).optional() }),
  z.object({ type: z.literal('reset'), restart: z.boolean(), confirmed: z.literal(true) }),
]);
export type Action = z.infer<typeof actionSchema>;
export const commandSchema = z.object({
  requestId: z.string().uuid(),
  version: count(0, 2147483647),
  action: actionSchema,
});
