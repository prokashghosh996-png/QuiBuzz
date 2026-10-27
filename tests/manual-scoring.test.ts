import { test } from 'node:test';
import assert from 'node:assert/strict';
import { actionSchema } from '../shared/validation.js';
import { hasQuestionScore, type ScoreEvent } from '../shared/types.js';

test('manual scoring action validation accepts valid marks and reasons', () => {
  const validAction = {
    type: 'score',
    teamId: 'team-1',
    scoreType: 'DIRECT_CORRECT',
    marks: 6,
    reason: 'Part Direct',
  };
  const parseResult = actionSchema.safeParse(validAction);
  assert.equal(parseResult.success, true);

  const validBonus = {
    type: 'score',
    teamId: 'team-2',
    scoreType: 'BONUS_CORRECT',
    marks: 4,
    reason: 'Part Bonus',
  };
  assert.equal(actionSchema.safeParse(validBonus).success, true);
});

test('manual scoring action validation rejects invalid marks', () => {
  const zeroMarks = {
    type: 'score',
    teamId: 'team-1',
    scoreType: 'DIRECT_CORRECT',
    marks: 0,
  };
  assert.equal(actionSchema.safeParse(zeroMarks).success, false);

  const negativeMarks = {
    type: 'score',
    teamId: 'team-1',
    scoreType: 'DIRECT_CORRECT',
    marks: -5,
  };
  assert.equal(actionSchema.safeParse(negativeMarks).success, false);
});

test('manual score deactivates further scoring for that team', () => {
  const events: ScoreEvent[] = [
    {
      id: 'event-1',
      teamId: 'team-1',
      roundId: 'round-1',
      question: 1,
      type: 'DIRECT_CORRECT',
      marks: 6,
      reason: 'Part Direct',
      createdAt: new Date().toISOString(),
      voidedAt: null,
      voidReason: null,
      replacesId: null,
    },
  ];

  // Team 1 has scored for question 1
  assert.equal(hasQuestionScore(events, 'team-1', 'round-1', 1), true);

  // Team 2 has not yet scored for question 1
  assert.equal(hasQuestionScore(events, 'team-2', 'round-1', 1), false);

  // If event is voided, team 1 can score again
  events[0].voidedAt = new Date().toISOString();
  assert.equal(hasQuestionScore(events, 'team-1', 'round-1', 1), false);
});
