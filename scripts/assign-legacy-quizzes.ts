import { db } from '../server/db.js';
import { normalizeIdentifier } from '../server/auth.js';
const identifier = process.argv[2];
const apply = process.argv.includes('--apply');
const quizIndex = process.argv.indexOf('--quiz');
const quizId = quizIndex < 0 ? undefined : process.argv[quizIndex + 1];
try {
  if (!identifier || (quizIndex >= 0 && !quizId))
    throw new Error(
      'Usage: npx tsx scripts/assign-legacy-quizzes.ts EMAIL_OR_PHONE [--quiz QUIZ_ID] [--apply]',
    );
  const user = await db.user.findFirst({ where: normalizeIdentifier(identifier) });
  if (!user) throw new Error('Create the destination account in QuiBuzz first.');
  const where = { ownerId: null, ...(quizId ? { id: quizId } : {}) };
  const count = await db.quiz.count({ where });
  if (apply) {
    const result = await db.quiz.updateMany({ where, data: { ownerId: user.id } });
    console.log(`Assigned ${result.count} previously unowned quizzes to ${user.name}.`);
  } else
    console.log(
      `${count} unowned quizzes would be assigned to ${user.name}. Add --apply to perform this assignment.`,
    );
} finally {
  await db.$disconnect();
}
