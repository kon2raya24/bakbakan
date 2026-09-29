import test from 'node:test';
import assert from 'node:assert/strict';
import { createMatch, tick, hashState, NOIN, ROUND, JUGGLE, METER, PHYS } from '../src/fight.mjs';
import { byId } from '../src/roster.mjs';

const I = (o = {}) => ({ ...NOIN, ...o });
function ready(p1 = 'lakan', p2 = 'dalisay', x1 = -0.45, x2 = 0.45) {
  const g = createMatch({ p1, p2 });
  g.phase = 'fight'; g.phaseT = 0;
  g.f[0].x = x1; g.f[1].x = x2;
  return g;
}
// Run n frames; a and b give each player's input for frame i.
function run(g, n, a = () => NOIN, b = () => NOIN) {
  const ev = [];
  for (let i = 0; i < n; i++) ev.push(...tick(g, [a(i), b(i)]));
  return ev;
}
const at = (script) => (i) => I(script[i] || {}); // { frame: input }
const hold = (o) => () => I(o);
const kinds = (ev, type) => ev.filter((e) => e.type === type);

test('a jab lands on a standing opponent: damage, hitstun and hit-freeze', () => {
  const g = ready();
  const ev = run(g, 30, at({ 0: { l: true } }));
  const hits = kinds(ev, 'hit');
  assert.equal(hits.length, 1);
  assert.equal(hits[0].dmg, 30);
  assert.equal(g.f[1].hp, 950 - 30);
});

test('guarding: back blocks mid and high, down-back blocks low and mid, and a low beats a standing guard', () => {
  // player 2 is on the right, so holding right (+x) is back
  let g = ready();
  let ev = run(g, 30, at({ 0: { l: true } }), hold({ x: 1 }));
  assert.equal(kinds(ev, 'block').length, 1, 'standing guard blocks a mid jab');
  g = ready();
  ev = run(g, 30, at({ 0: { l: true, y: -1 }, 1: { y: -1 }, 2: { y: -1 } }), hold({ x: 1 }));
  assert.equal(kinds(ev, 'hit').length, 1, 'a crouching jab is low: standing guard misses it');
  g = ready();
  ev = run(g, 30, at({ 0: { l: true, y: -1 }, 1: { y: -1 }, 2: { y: -1 } }), hold({ x: 1, y: -1 }));
  assert.equal(kinds(ev, 'block').length, 1, 'crouching guard blocks the low');
  // Mang Tanod's Batuta Bagsak is an overhead: crouching guard can't stop it
  g = ready('tanod', 'dalisay', -0.5, 0.6);
  ev = run(g, 60, at({ 0: { x: -1, s: true } }), hold({ x: 1, y: -1 }));
  assert.ok(kinds(ev, 'special').some((e) => e.id === 'QCB'));
  assert.equal(kinds(ev, 'hit').length, 1, 'the overhead hits a crouching guard');
  g = ready('tanod', 'dalisay', -0.5, 0.6);
  ev = run(g, 60, at({ 0: { x: -1, s: true } }), hold({ x: 1 }));
  assert.equal(kinds(ev, 'block').length, 1, 'standing guard blocks the overhead');
});

test('chains: light into light into heavy, then cancel into a special', () => {
  const g = ready();
  const ev = run(g, 120, at({ 0: { l: true }, 8: { l: true }, 16: { h: true }, 26: { s: true } }));
  assert.equal(kinds(ev, 'swing').length, 3);
  assert.ok(kinds(ev, 'special').length === 1, 'the special cancelled out of the heavy');
  assert.ok(g.f[0].stats.maxCombo >= 5, `combo was ${g.f[0].stats.maxCombo}`);
  // combo scaling: later hits do less than their listed damage
  const hits = kinds(ev, 'hit');
  assert.ok(hits.at(-1).dmg < 32, 'the last Sinawali hit was scaled down');
});

test('motions and shortcuts pick the special', () => {
  const which = (script) => { const g = ready('lakan', 'dalisay', -3, 3); return kinds(run(g, 40, at(script)), 'special').map((e) => e.id); };
  assert.deepEqual(which({ 0: { y: -1 }, 1: { x: 1, y: -1 }, 2: { x: 1, s: true } }), ['QCF']);
  assert.deepEqual(which({ 0: { x: 1 }, 1: { y: -1 }, 2: { x: 1, y: -1, s: true } }), ['DP']);
  assert.deepEqual(which({ 0: { y: -1 }, 1: { x: -1, y: -1 }, 2: { x: -1, s: true } }), ['QCB']);
  // walking forward first doesn't turn a fireball motion into an uppercut
  assert.deepEqual(which({ 0: { x: 1 }, 1: { x: 1 }, 2: { y: -1 }, 3: { x: 1, y: -1 }, 4: { x: 1, s: true } }), ['QCF']);
  // shortcuts: special alone, down + special, back + special
  assert.deepEqual(which({ 0: { s: true } }), ['QCF']);
  assert.deepEqual(which({ 0: { y: -1, s: true } }), ['DP']);
  assert.deepEqual(which({ 0: { x: -1, s: true } }), ['QCB']);
});

test('one projectile of your own at a time, and projectiles cancel each other', () => {
  let g = ready('lakan', 'dalisay', -3, 3);
  let ev = run(g, 40, at({ 0: { x: -1, s: true }, 36: { x: -1, s: true } }));
  assert.equal(kinds(ev, 'proj').length, 1);
  g = ready('lakan', 'tanod', -4, 4);
  ev = run(g, 90, at({ 0: { x: -1, s: true } }), at({ 0: { s: true } }));
  assert.equal(kinds(ev, 'proj').length, 2);
  assert.equal(kinds(ev, 'clash').length, 1);
  assert.equal(kinds(ev, 'hit').length, 0);
});

test('throws land unless broken in time; command grabs cannot be broken', () => {
  let g = ready();
  let ev = run(g, 60, at({ 0: { l: true, h: true } }));
  assert.equal(kinds(ev, 'grab').length, 1);
  assert.equal(kinds(ev, 'throw').length, 1);
  assert.equal(g.f[1].hp, 950 - 110);
  g = ready();
  ev = run(g, 60, at({ 0: { l: true, h: true } }), at({ 5: { l: true, h: true } }));
  assert.equal(kinds(ev, 'tech').length, 1);
  assert.equal(kinds(ev, 'throw').length, 0);
  assert.equal(g.f[1].hp, 950);
  // the Kapre's Buhat, from farther than a normal throw reaches
  g = ready('kapre', 'lakan', -0.6, 0.6);
  ev = run(g, 90, at({ 0: { x: -1, s: true } }), at({ 10: { l: true, h: true } }));
  assert.equal(kinds(ev, 'tech').length, 0);
  assert.equal(kinds(ev, 'throw').length, 1);
  assert.equal(g.f[1].hp, 1000 - 150);
});

test('a sweep knocks down, and nobody can hit you while you are down', () => {
  const g = ready();
  const ev = run(g, 60, at({ 0: { h: true, y: -1 }, 1: { y: -1 }, 2: { y: -1 } }));
  assert.equal(kinds(ev, 'down').length, 1);
  assert.equal(g.f[1].state, 'down');
  const more = run(g, 20, at({ 0: { l: true, y: -1 } }));
  assert.equal(kinds(more, 'hit').length, 0, 'no hitting someone on the ground');
});

test('the juggle limit: a fighter juggled enough times falls through further hits', () => {
  const make = (juggle) => {
    const g = ready('lakan', 'dalisay', -0.45, 0.2);
    Object.assign(g.f[1], { state: 'hitAir', y: 1.0, vy: 0.02, juggle, combo: 2 });
    return kinds(run(g, 20, at({ 0: { y: -1, x: 1, s: true } })), 'hit').length;
  };
  assert.equal(make(1), 1);
  assert.equal(make(JUGGLE), 0);
});

test('a counter hit: caught in the startup of your own attack costs more', () => {
  const g = ready();
  // player 2 starts a heavy (8 frames of startup); player 1's jab comes out in 4
  const ev = run(g, 30, at({ 2: { l: true } }), at({ 0: { h: true } }));
  const hit = kinds(ev, 'hit').find((e) => e.side === 0);
  assert.ok(hit && hit.counter);
  assert.equal(hit.dmg, 36);
});

test('chip damage cannot finish anyone, except with a super', () => {
  let g = ready('lakan', 'dalisay', -0.5, 0.4);
  g.f[1].hp = 1;
  run(g, 90, at({ 0: { s: true } }), hold({ x: 1 }));
  assert.equal(g.f[1].hp, 1);
  assert.equal(g.phase, 'fight');
  g = ready('lakan', 'dalisay', -0.5, 0.4);
  g.f[1].hp = 5; g.f[0].meter = METER.max;
  const ev = run(g, 120, at({ 0: { s: true, h: true } }), hold({ x: 1 }));
  assert.equal(kinds(ev, 'super').length, 1);
  assert.equal(kinds(ev, 'ko').length, 1);
});

test('the super needs a full meter and empties it', () => {
  let g = ready('lakan', 'dalisay', -3, 3);
  g.f[0].meter = 60;
  let ev = run(g, 20, at({ 0: { s: true, h: true } }));
  assert.equal(kinds(ev, 'super').length, 0);
  assert.equal(kinds(ev, 'special').length, 1);
  g = ready('lakan', 'dalisay', -3, 3);
  g.f[0].meter = METER.max;
  ev = run(g, 20, at({ 0: { s: true, h: true } }));
  assert.equal(kinds(ev, 'super').length, 1);
  assert.equal(g.f[0].meter, 0);
});

test('bodies do not pass through each other, and the walls hold', () => {
  const need = PHYS.half * (byId('lakan').build + byId('kapre').build); // bodies are as wide as their build
  let g = ready('lakan', 'kapre', -1, 1);
  run(g, 120, hold({ x: 1 }), hold({ x: -1 }));
  assert.ok(g.f[1].x - g.f[0].x >= need - 1e-6);
  g = ready('lakan', 'kapre', 3.5, PHYS.wall);
  run(g, 200, hold({ x: 1 }));
  assert.equal(g.f[1].x, PHYS.wall);
  assert.ok(Math.abs(g.f[0].x - (PHYS.wall - need)) < 1e-6);
});

test('rounds: a KO wins the round, two win the match, and meter carries over', () => {
  const g = createMatch({ p1: 'lakan', p2: 'dalisay' });
  let ev = run(g, ROUND.intro + 1);
  assert.equal(kinds(ev, 'fight').length, 1);
  for (let r = 0; r < 2; r++) {
    g.f[0].x = -0.45; g.f[1].x = 0.45; g.f[1].hp = 10; g.f[0].meter = 40;
    ev = run(g, 20, at({ 0: { l: true } }));
    assert.equal(kinds(ev, 'ko').length, 1);
    ev = run(g, ROUND.ko + ROUND.intro + 5);
    assert.equal(kinds(ev, 'roundEnd').length, 1);
    if (r === 0) { assert.equal(g.round, 2); assert.deepEqual(g.wins, [1, 0]); assert.ok(g.f[0].meter >= 40); assert.equal(g.f[1].hp, 950); }
  }
  assert.equal(g.phase, 'matchOver');
  assert.equal(g.winner, 0);
});

test('time up: more health (by share) wins; equal is a draw', () => {
  let g = ready('lakan', 'dalisay', -3, 3);
  g.timer = 3; g.f[0].hp = 500; g.f[1].hp = 500; // 50% against 53%
  let ev = run(g, 5);
  assert.equal(kinds(ev, 'timeup')[0].winner, 1);
  g = ready('lakan', 'lakan', -3, 3);
  g.timer = 3;
  ev = run(g, 5);
  assert.equal(kinds(ev, 'timeup')[0].winner, null);
});

test('replays are exact, and a copied match plays on the same', () => {
  const inputs = [];
  let s = 7;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 1500; i++) inputs.push([0, 1].map(() => I({ x: Math.floor(r() * 3) - 1, y: r() < 0.15 ? -1 : r() < 0.05 ? 1 : 0, l: r() < 0.08, h: r() < 0.05, s: r() < 0.03 })));
  const play = (g, from, to) => { for (let i = from; i < to; i++) tick(g, inputs[i]); return g; };
  const a = play(createMatch({ p1: 'balut', p2: 'tanod' }), 0, 1500);
  const b = play(createMatch({ p1: 'balut', p2: 'tanod' }), 0, 1500);
  assert.equal(hashState(a), hashState(b));
  const half = play(createMatch({ p1: 'balut', p2: 'tanod' }), 0, 700);
  const copy = structuredClone(half);
  assert.equal(hashState(play(half, 700, 1500)), hashState(play(copy, 700, 1500)));
});

test('a knockout drops the loser to the floor, low and quick, not up into the air', () => {
  const g = ready();
  g.f[1].hp = 10;
  let top = 0, floorAt = -1;
  for (let i = 0; i < 90; i++) {
    tick(g, [i === 0 ? I({ h: true }) : NOIN, NOIN]);
    if (g.f[1].state === 'ko') { top = Math.max(top, g.f[1].y); if (floorAt < 0 && g.f[1].y === 0 && i > 2) floorAt = i; }
  }
  assert.equal(g.f[1].state, 'ko');
  assert.ok(top < 0.25, `rose to ${top.toFixed(2)} m`);
  assert.ok(floorAt > 0 && floorAt < 40, `on the floor by frame ${floorAt}`);
});
