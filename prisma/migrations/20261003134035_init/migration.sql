-- CreateEnum
CREATE TYPE "QuizStatus" AS ENUM ('SETUP', 'READY', 'LIVE', 'ROUND_COMPLETE', 'QUIZ_COMPLETE');

-- CreateEnum
CREATE TYPE "ScoreType" AS ENUM ('DIRECT_CORRECT', 'BONUS_CORRECT', 'POUNCE_CORRECT', 'POUNCE_WRONG', 'MANUAL_ADJUSTMENT');

-- CreateTable
CREATE TABLE "Quiz" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "master" TEXT NOT NULL DEFAULT '',
    "status" "QuizStatus" NOT NULL DEFAULT 'SETUP',
    "positive" INTEGER NOT NULL DEFAULT 10,
    "negative" INTEGER NOT NULL DEFAULT 5,
    "pounceSeconds" INTEGER NOT NULL DEFAULT 5,
    "version" INTEGER NOT NULL DEFAULT 0,
    "draft" JSONB NOT NULL,
    "state" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Quiz_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Team" (
    "id" TEXT NOT NULL,
    "quizId" TEXT NOT NULL,
    "letter" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "members" TEXT[],
    "initialOrder" INTEGER NOT NULL,

    CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Round" (
    "id" TEXT NOT NULL,
    "quizId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "questions" INTEGER NOT NULL,
    "order" INTEGER NOT NULL,

    CONSTRAINT "Round_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScoreEvent" (
    "id" TEXT NOT NULL,
    "sequence" SERIAL NOT NULL,
    "quizId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "question" INTEGER NOT NULL,
    "type" "ScoreType" NOT NULL,
    "marks" INTEGER NOT NULL,
    "reason" TEXT NOT NULL DEFAULT '',
    "replacesId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "voidedAt" TIMESTAMP(3),
    "voidReason" TEXT,

    CONSTRAINT "ScoreEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Command" (
    "id" TEXT NOT NULL,
    "quizId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Command_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Team_quizId_letter_key" ON "Team"("quizId", "letter");

-- CreateIndex
CREATE UNIQUE INDEX "Round_quizId_order_key" ON "Round"("quizId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "ScoreEvent_sequence_key" ON "ScoreEvent"("sequence");

-- CreateIndex
CREATE INDEX "ScoreEvent_quizId_createdAt_idx" ON "ScoreEvent"("quizId", "createdAt");

-- CreateIndex
CREATE INDEX "ScoreEvent_teamId_roundId_idx" ON "ScoreEvent"("teamId", "roundId");

-- CreateIndex
CREATE INDEX "Command_quizId_createdAt_idx" ON "Command"("quizId", "createdAt");

-- AddForeignKey
ALTER TABLE "Team" ADD CONSTRAINT "Team_quizId_fkey" FOREIGN KEY ("quizId") REFERENCES "Quiz"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Round" ADD CONSTRAINT "Round_quizId_fkey" FOREIGN KEY ("quizId") REFERENCES "Quiz"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoreEvent" ADD CONSTRAINT "ScoreEvent_quizId_fkey" FOREIGN KEY ("quizId") REFERENCES "Quiz"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoreEvent" ADD CONSTRAINT "ScoreEvent_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoreEvent" ADD CONSTRAINT "ScoreEvent_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "Round"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Command" ADD CONSTRAINT "Command_quizId_fkey" FOREIGN KEY ("quizId") REFERENCES "Quiz"("id") ON DELETE CASCADE ON UPDATE CASCADE;
