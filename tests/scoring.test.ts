import { test } from 'node:test';
import assert from 'node:assert/strict';
import { db } from '../server/db.js';
import { command, createQuiz, getQuiz } from '../server/service.js';
import { defaultDraft, total, standings, type Quiz } from '../shared/types.js';
import { readySchema } from '../shared/validation.js';

test('setup validation catches missing members, quiz master and invalid scoring', () => {
  const d = defaultDraft();
  assert.equal(readySchema.safeParse(d).success, false);
  d.name = 'Test';
  d.master = 'Host';
  d.teams.forEach((t) => (t.members = ['Member']));
  assert.equal(readySchema.safeParse(d).success, true);
  d.negative = -5;
  assert.equal(readySchema.safeParse(d).success, false);
  d.negative = 0;
  d.positive = 0;
  assert.equal(readySchema.safeParse(d).success, false);
});

test('PostgreSQL scoring, bounce, pounces, retries, concurrency, history and refresh', async () => {
  const d = defaultDraft();
  d.name = 'Automated integration test';
  d.master = 'Test host';
  d.teams = Array.from({ length: 6 }, (_, i) => ({ name: '', members: [`Member ${i + 1}`] }));
  d.rounds = [
    { name: 'General', questions: 12 },
    { name: 'Technology', questions: 10 },
  ];
  let q = await createQuiz(d);
  const act = async (action: unknown) => {
    q = await command(q.id, { requestId: crypto.randomUUID(), version: q.version, action });
  };
  const score = (index: number) => total(q as unknown as Quiz, q.teams[index].id);
  try {
    await assert.rejects(() => act({ type: 'start' }), /Review/);
    await act({ type: 'ready', draft: d });
    await act({ type: 'start' });
    assert.equal(q.teams.length, 6);
    assert.equal(q.status, 'LIVE');
    await act({ type: 'assign', target: 'directTeamId', teamId: q.teams[3].id });
    for (const scoreType of ['POUNCE_CORRECT', 'POUNCE_WRONG']) {
      await assert.rejects(
        () => act({ type: 'score', teamId: q.teams[3].id, scoreType }),
        /cannot pounce/,
      );
    }
    await assert.rejects(
      () => act({ type: 'score', teamId: q.teams[3].id, scoreType: 'BONUS_CORRECT' }),
      /cannot receive Bonus/,
    );
    await act({ type: 'assign', target: 'bounceTeamId', teamId: q.teams[4].id });
    await act({ type: 'score', teamId: q.teams[4].id, scoreType: 'BONUS_CORRECT' });
    await act({ type: 'score', teamId: q.teams[0].id, scoreType: 'POUNCE_CORRECT' });
    await act({ type: 'score', teamId: q.teams[2].id, scoreType: 'POUNCE_WRONG' });
    assert.deepEqual([score(4), score(0), score(2)], [10, 10, -5]);
    assert.equal(q.events.length, 3);
    for (const scoreType of ['BONUS_CORRECT', 'POUNCE_CORRECT', 'POUNCE_WRONG']) {
      await assert.rejects(
        () => act({ type: 'score', teamId: q.teams[0].id, scoreType }),
        /already has a score/,
      );
    }
    assert.ok(q.events.every((e) => e.question === 1));
    let s = (q as unknown as Quiz).state;
    assert.equal(s.assignments['0:1'].directTeamId, q.teams[3].id);
    assert.equal(s.assignments['0:1'].nextTeamId, q.teams[5].id);
    await assert.rejects(
      () => act({ type: 'score', teamId: q.teams[1].id, scoreType: 'DIRECT_CORRECT' }),
      /Only the current direct/,
    );
    await act({ type: 'roundMaster', roundId: q.rounds[0].id, master: 'Round one host' });
    await act({ type: 'roundMaster', roundId: q.rounds[1].id, master: 'Round two host' });
    assert.equal(
      ((await getQuiz(q.id)) as unknown as Quiz).state.roundMasters?.[q.rounds[0].id],
      'Round one host',
    );
    await act({ type: 'assign', target: 'directTeamId', teamId: q.teams[1].id });
    const body = {
      requestId: crypto.randomUUID(),
      version: q.version,
      action: { type: 'score', teamId: q.teams[1].id, scoreType: 'DIRECT_CORRECT' },
    };
    q = await command(q.id, body);
    q = await command(q.id, body);
    assert.equal(score(1), 10);
    await assert.rejects(() => act(body.action), /already has a score/);
    assert.equal((q as unknown as Quiz).state.assignments['0:1'].nextTeamId, q.teams[2].id);
    assert.equal((q as unknown as Quiz).state.question, 1);
    await assert.rejects(
      () => command(q.id, { ...body, action: { ...body.action, teamId: q.teams[0].id } }),
      /different action/,
    );
    const version = q.version;
    const parallel = await Promise.allSettled(
      [3, 5].map((i) =>
        command(q.id, {
          requestId: crypto.randomUUID(),
          version,
          action: { type: 'score', teamId: q.teams[i].id, scoreType: 'POUNCE_CORRECT' },
        }),
      ),
    );
    assert.equal(parallel.filter((p) => p.status === 'fulfilled').length, 1);
    q = await getQuiz(q.id);
    await act({ type: 'undo' });
    assert.deepEqual([score(0), score(1)], [10, 10]);
    await act({ type: 'settings', positive: 20, negative: 10, pounceSeconds: 1, confirmed: true });
    assert.equal(score(2), -5);
    await assert.rejects(
      () => act({ type: 'score', teamId: q.teams[2].id, scoreType: 'POUNCE_WRONG' }),
      /already has a score/,
    );
    await act({ type: 'score', teamId: q.teams[3].id, scoreType: 'POUNCE_WRONG' });
    assert.equal(score(3), -10);
    await act({ type: 'undo' });
    await act({ type: 'score', teamId: q.teams[3].id, scoreType: 'POUNCE_CORRECT' });
    assert.equal(score(3), 20);
    await act({ type: 'undo' });
    assert.equal(score(2), -5);
    await act({ type: 'navigate', delta: 1 });
    s = (q as unknown as Quiz).state;
    assert.equal(s.question, 2);
    assert.equal(s.assignments['0:2'].directTeamId, q.teams[2].id);
    await act({ type: 'score', teamId: q.teams[0].id, scoreType: 'POUNCE_CORRECT' });
    await act({ type: 'undo' });
    await act({ type: 'navigate', delta: -1 });
    await assert.rejects(() => act(body.action), /already has a score/);
    assert.equal((q as unknown as Quiz).state.assignments['0:1'].directTeamId, q.teams[1].id);
    await act({ type: 'adjust', teamId: q.teams[2].id, marks: 5, reason: 'Accepted answer' });
    assert.equal(score(2), 0);
    const event = q.events.find((e) => e.teamId === q.teams[4].id && !e.voidedAt)!;
    await act({ type: 'editEvent', eventId: event.id, marks: 15, reason: 'Corrected award' });
    assert.equal(score(4), 15);
    await assert.rejects(
      () => act({ type: 'score', teamId: q.teams[4].id, scoreType: 'BONUS_CORRECT' }),
      /already has a score/,
    );
    assert.ok(q.events.find((e) => e.id === event.id)?.voidedAt);
    const replacement = q.events.find((e) => e.replacesId === event.id)!;
    await act({ type: 'void', eventId: replacement.id, reason: 'Removed after review' });
    assert.equal(score(4), 0);
    await act({ type: 'score', teamId: q.teams[4].id, scoreType: 'POUNCE_CORRECT' });
    assert.equal(score(4), 20);
    await act({ type: 'undo' });
    await act({ type: 'order', order: q.teams.map((t) => t.id).reverse() });
    await act({ type: 'timer', operation: 'start' });
    assert.ok((q as unknown as Quiz).state.timer.endsAt);
    await act({ type: 'timer', operation: 'pause' });
    assert.equal((q as unknown as Quiz).state.timer.endsAt, null);
    await act({ type: 'completeRound' });
    assert.equal(q.status, 'ROUND_COMPLETE');
    await act({ type: 'nextRound' });
    assert.equal((q as unknown as Quiz).state.roundIndex, 1);
    await act({ type: 'assign', target: 'directTeamId', teamId: q.teams[0].id });
    await act({ type: 'score', teamId: q.teams[0].id, scoreType: 'DIRECT_CORRECT' });
    assert.equal(score(0), 30);
    assert.equal(total(q as unknown as Quiz, q.teams[0].id, q.rounds[0].id), 10);
    assert.equal(total(q as unknown as Quiz, q.teams[0].id, q.rounds[1].id), 20);
    const fetched = await getQuiz(q.id);
    assert.deepEqual(fetched, q);
    await act({ type: 'endQuiz' });
    assert.equal(q.status, 'QUIZ_COMPLETE');
    await act({ type: 'tieBreak' });
    assert.equal(q.rounds.length, 3);
    assert.equal(q.status, 'LIVE');
    await act({ type: 'reset', restart: true, confirmed: true });
    assert.ok(q.events.every((e) => e.voidedAt));
    assert.equal((q as unknown as Quiz).state.question, 1);
    assert.ok(standings(q as unknown as Quiz).every((r) => r.tied && r.rank === 1));
    // Both awards follow the configured order, including wraparound after reversing.
    await act({ type: 'assign', target: 'directTeamId', teamId: q.teams[0].id });
    await act({ type: 'score', teamId: q.teams[0].id, scoreType: 'DIRECT_CORRECT' });
    assert.equal((q as unknown as Quiz).state.assignments['0:1'].nextTeamId, q.teams[5].id);
    await act({ type: 'score', teamId: q.teams[3].id, scoreType: 'BONUS_CORRECT' });
    assert.equal((q as unknown as Quiz).state.assignments['0:1'].nextTeamId, q.teams[2].id);
    await act({ type: 'assign', target: 'nextTeamId', teamId: q.teams[1].id });
    await act({ type: 'navigate', delta: 1 });
    assert.equal((q as unknown as Quiz).state.assignments['0:2'].directTeamId, q.teams[1].id);
  } finally {
    await db.quiz.delete({ where: { id: q.id } });
    await db.$disconnect();
  }
});
