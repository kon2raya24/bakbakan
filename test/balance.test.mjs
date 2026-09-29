// CPU against CPU: the difficulty levels are in the right order, every fighter can win, and fights
// look like fights (blocking, specials, throws, KOs rather than time-outs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createMatch, tick } from '../src/fight.mjs';
import { createAI, aiInput } from '../src/ai.mjs';
import { ROSTER } from '../src/roster.mjs';

const KEY = { roundEnd: 'rounds', timeup: 'timeups', hit: 'hits', block: 'blocks', special: 'specials', super: 'supers', throw: 'throws' };
function match(p1, p2, l1, l2, seed) {
  const g = createMatch({ p1, p2, seed });
  const a = createAI(0, l1, seed), b = createAI(1, l2, seed + 1);
  const st = { rounds: 0, timeups: 0, hits: 0, blocks: 0, specials: 0, supers: 0, throws: 0 };
  for (let i = 0; i < 60 * 60 * 8 && g.phase !== 'matchOver'; i++) {
    for (const e of tick(g, [aiInput(a, g), aiInput(b, g)])) if (KEY[e.type]) st[KEY[e.type]]++;
  }
  return { winner: g.winner, over: g.phase === 'matchOver', ...st };
}
const ids = ROSTER.map((c) => c.id);

// A series with mixed characters, the stronger side on either side of the screen.
function series(l1, l2, n = 30) {
  let w = 0;
  const tot = { rounds: 0, timeups: 0, hits: 0, blocks: 0, specials: 0, supers: 0, throws: 0, unfinished: 0 };
  for (let sd = 1; sd <= n; sd++) {
    const c1 = ids[sd % 4], c2 = ids[(sd * 3 + 1) % 4], flip = sd % 2;
    const r = flip ? match(c2, c1, l2, l1, sd) : match(c1, c2, l1, l2, sd);
    if (r.winner === (flip ? 1 : 0)) w++;
    for (const k of Object.keys(tot)) if (k in r) tot[k] += r[k];
    if (!r.over) tot.unfinished++;
  }
  return { w, n, ...tot };
}

test('the harder CPU beats the easier one', () => {
  const a = series('mahirap', 'madali');
  assert.ok(a.w >= 26, `mahirap beat madali ${a.w}/${a.n}`);
  const b = series('katamtaman', 'madali');
  assert.ok(b.w >= 19, `katamtaman beat madali ${b.w}/${b.n}`);
  const c = series('mahirap', 'katamtaman');
  assert.ok(c.w >= 22, `mahirap beat katamtaman ${c.w}/${c.n}`);
});

test('fights look like fights: they finish, mostly by KO, with guarding, specials and throws', () => {
  const s = series('katamtaman', 'katamtaman');
  assert.equal(s.unfinished, 0);
  assert.ok(s.timeups / s.rounds < 0.25, `${s.timeups} of ${s.rounds} rounds timed out`);
  assert.ok(s.blocks / s.rounds > 5, 'the CPU guards');
  assert.ok(s.specials / s.rounds > 4, 'the CPU uses its specials');
  assert.ok(s.throws > 5, 'the CPU throws');
  assert.ok(s.supers / s.rounds > 0.3 && s.supers / s.rounds < 2.5, `supers per round ${(s.supers / s.rounds).toFixed(2)}`);
});

test('every fighter can win, and none runs away with it', () => {
  const wins = {};
  for (const c1 of ids) for (const c2 of ids) {
    if (c1 === c2) continue;
    for (let sd = 1; sd <= 8; sd++) {
      const flip = sd % 2 === 0, r = flip ? match(c2, c1, 'katamtaman', 'katamtaman', sd) : match(c1, c2, 'katamtaman', 'katamtaman', sd);
      if (r.winner === (flip ? 1 : 0)) wins[c1] = (wins[c1] || 0) + 1;
    }
  }
  const games = 8 * (ids.length - 1);
  for (const id of ids) {
    const share = (wins[id] || 0) / games;
    assert.ok(share >= 0.25 && share <= 0.75, `${id} won ${wins[id] || 0}/${games}`);
  }
});

test('the CPU is deterministic for a seed', () => {
  const a = match('lakan', 'balut', 'katamtaman', 'mahirap', 5), b = match('lakan', 'balut', 'katamtaman', 'mahirap', 5);
  assert.deepEqual(a, b);
});
