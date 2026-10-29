import { test } from 'node:test';
import assert from 'node:assert/strict';
import { actionSchema } from '../shared/validation.js';
import { hasQuestionScore, resolveBounceNextTeamId, type ScoreEvent } from '../shared/types.js';

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

test('bounce rule follows furthest team in rotation regardless of instruction sequence for part bonus and part direct', () => {
  const order = ['team-A', 'team-B', 'team-C', 'team-D', 'team-E', 'team-F'];
  const directTeamId = 'team-A';
  const roundId = 'round-1';
  const question = 1;

  const eventTeamB: ScoreEvent = {
    id: 'e-b',
    teamId: 'team-B',
    roundId,
    question,
    type: 'BONUS_CORRECT',
    marks: 5,
    reason: 'Part Bonus',
    createdAt: new Date().toISOString(),
    voidedAt: null,
    voidReason: null,
    replacesId: null,
  };

  const eventTeamE: ScoreEvent = {
    id: 'e-e',
    teamId: 'team-E',
    roundId,
    question,
    type: 'BONUS_CORRECT',
    marks: 5,
    reason: 'Part Bonus',
    createdAt: new Date().toISOString(),
    voidedAt: null,
    voidReason: null,
    replacesId: null,
  };

  const eventTeamA: ScoreEvent = {
    id: 'e-a',
    teamId: 'team-A',
    roundId,
    question,
    type: 'DIRECT_CORRECT',
    marks: 5,
    reason: 'Part Direct',
    createdAt: new Date().toISOString(),
    voidedAt: null,
    voidReason: null,
    replacesId: null,
  };

  // Case 1: Team E scored first, Team B scored later -> next team must be Team F (following E)
  const nextTeamEthenB = resolveBounceNextTeamId(
    order,
    directTeamId,
    [eventTeamE, eventTeamB],
    roundId,
    question,
  );
  assert.equal(nextTeamEthenB, 'team-F');

  // Case 2: Team B scored first, Team E scored later -> next team must still be Team F (following E)
  const nextTeamBthenE = resolveBounceNextTeamId(
    order,
    directTeamId,
    [eventTeamB, eventTeamE],
    roundId,
    question,
  );
  assert.equal(nextTeamBthenE, 'team-F');

  // Case 3: Team A got part direct and Team E got part bonus (A scored later than E) -> next team is Team F
  const nextTeamEthenA = resolveBounceNextTeamId(
    order,
    directTeamId,
    [eventTeamE, eventTeamA],
    roundId,
    question,
  );
  assert.equal(nextTeamEthenA, 'team-F');

  // Case 4: Team A got part direct and Team E got part bonus (E scored later than A) -> next team is Team F
  const nextTeamAthenE = resolveBounceNextTeamId(
    order,
    directTeamId,
    [eventTeamA, eventTeamE],
    roundId,
    question,
  );
  assert.equal(nextTeamAthenE, 'team-F');

  // Case 5: Team A got part direct and Team B got part bonus -> next team is Team C (following B)
  const nextTeamAthenB = resolveBounceNextTeamId(
    order,
    directTeamId,
    [eventTeamA, eventTeamB],
    roundId,
    question,
  );
  assert.equal(nextTeamAthenB, 'team-C');

  // Case 6: Team E is voided, leaving only Team B -> next team is Team C
  const voidedE = { ...eventTeamE, voidedAt: new Date().toISOString() };
  const nextAfterVoidE = resolveBounceNextTeamId(
    order,
    directTeamId,
    [voidedE, eventTeamB],
    roundId,
    question,
  );
  assert.equal(nextAfterVoidE, 'team-C');

  // Case 7: Both B and E are voided, leaving only Team A -> next team is Team B
  const voidedB = { ...eventTeamB, voidedAt: new Date().toISOString() };
  const nextAfterVoidBoth = resolveBounceNextTeamId(
    order,
    directTeamId,
    [voidedE, voidedB, eventTeamA],
    roundId,
    question,
  );
  assert.equal(nextAfterVoidBoth, 'team-B');

  // Case 8: Wrap-around rotation when direct team is Team D:
  // Direct is Team D. Team F (dist 2) and Team B (dist 4) score bonus.
  // Team B is later in bounce rotation from D than Team F, so next team is Team C (following B).
  const nextWrapAround = resolveBounceNextTeamId(
    order,
    'team-D',
    [
      { ...eventTeamB, roundId, question },
      { id: 'e-f', teamId: 'team-F', roundId, question, type: 'BONUS_CORRECT', marks: 5, reason: 'Part Bonus', createdAt: new Date().toISOString(), voidedAt: null, voidReason: null, replacesId: null },
    ],
    roundId,
    question,
  );
  assert.equal(nextWrapAround, 'team-C');
});


test('anticlockwise bounce rotation moves to previous team of furthest scorer', () => {
  const order = ['team-A', 'team-B', 'team-C', 'team-D', 'team-E', 'team-F', 'team-G'];
  const directTeamId = 'team-G';
  const roundId = 'round-2';
  const question = 1;

  // Direct team G answers directly -> next direct team is Team F (previous team in anticlockwise)
  const eventDirectG = {
    id: 'e-g',
    teamId: 'team-G',
    roundId,
    question,
    type: 'DIRECT_CORRECT',
    marks: 10,
    reason: 'Direct',
    createdAt: new Date().toISOString(),
    voidedAt: null,
    voidReason: null,
    replacesId: null,
  };

  const nextDirectG = resolveBounceNextTeamId(
    order,
    directTeamId,
    [eventDirectG],
    roundId,
    question,
    'ANTICLOCKWISE',
  );
  assert.equal(nextDirectG, 'team-F');

  // Question bounces: Team E (+5) and Team C (+5) answer partial bonus.
  // In anticlockwise from G: G (0) -> F (1) -> E (2) -> D (3) -> C (4).
  // Team C is the furthest scorer in anticlockwise rotation (dist 4 vs 2).
  // The next team is previous team of Team C -> Team B!
  const eventBonusE = {
    id: 'e-e',
    teamId: 'team-E',
    roundId,
    question,
    type: 'BONUS_CORRECT',
    marks: 5,
    reason: 'Part Bonus',
    createdAt: new Date().toISOString(),
    voidedAt: null,
    voidReason: null,
    replacesId: null,
  };

  const eventBonusC = {
    id: 'e-c',
    teamId: 'team-C',
    roundId,
    question,
    type: 'BONUS_CORRECT',
    marks: 5,
    reason: 'Part Bonus',
    createdAt: new Date().toISOString(),
    voidedAt: null,
    voidReason: null,
    replacesId: null,
  };

  // Entered E first, C later
  const nextEthenC = resolveBounceNextTeamId(
    order,
    directTeamId,
    [eventBonusE, eventBonusC],
    roundId,
    question,
    'ANTICLOCKWISE',
  );
  assert.equal(nextEthenC, 'team-B');

  // Entered C first, E later (instruction sequence independence)
  const nextCthenE = resolveBounceNextTeamId(
    order,
    directTeamId,
    [eventBonusC, eventBonusE],
    roundId,
    question,
    'ANTICLOCKWISE',
  );
  assert.equal(nextCthenE, 'team-B');

  // No scores recorded -> defaults to direct team G -> next is Team F
  const nextUnanswered = resolveBounceNextTeamId(
    order,
    directTeamId,
    [],
    roundId,
    question,
    'ANTICLOCKWISE',
  );
  assert.equal(nextUnanswered, 'team-F');
});
