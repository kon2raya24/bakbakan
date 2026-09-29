// The rules of Bakbakan sa Kanto: a frame-exact 2D fighting engine at 60 frames a second. Positions
// are metres along the street (x) and up (y). The 3D view reads this state and its events and never
// changes it, so every rule is testable in Node.
//
// Frame order: presses are recorded; hit-freeze; facing; inputs (moves, specials, throws, jumps,
// walking, guarding); moves advance (lunges, projectiles); physics; pushboxes and walls; projectiles;
// hits and blocks (both fighters can hit on the same frame: a trade); throws; stun and knockdowns;
// KOs; the round clock.
import { byId } from './roster.mjs';

export const PHYS = { walkF: 0.05, walkB: 0.038, jumpVy: 0.135, jumpVx: 0.056, g: 0.0068, half: 0.3, wall: 5.4, gap: 5.0, prejump: 3, land: 3 };
export const HURT = { stand: [-0.3, 0.3, 0, 1.7], crouch: [-0.3, 0.3, 0, 1.05], air: [-0.28, 0.28, 0.2, 1.5] };
export const ROUND = { secs: 99, intro: 100, ko: 150, wins: 2, max: 5 };
export const KD = { down: 42, rise: 16, wake: 6 };
export const FREEZE = { light: 7, heavy: 10, super: 24, block: 5 };
export const METER = { max: 100, hit: 0.075, got: 0.05, block: 0.03, special: 2 };
export const BUF = 7; // frames a button press waits to be used
export const KARA = 3; // a normal can still turn into a special, a super or a throw in its first frames
export const TECH = 8; // frames to break a throw
export const JUGGLE = 3;
export const NOIN = Object.freeze({ x: 0, y: 0, l: false, h: false, s: false });

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const BUTTONS = ['l', 'h', 's'];

export function createMatch({ p1 = 'lakan', p2 = 'dalisay', stage = 'terminal', seed = 1 } = {}) {
  const g = { seed, stage, frame: 0, round: 1, wins: [0, 0], phase: 'intro', phaseT: ROUND.intro, timer: ROUND.secs * 60, freeze: 0, projs: [], winner: null, roundWinner: null, draw: false };
  g.f = [fighter(0, p1), fighter(1, p2)];
  return g;
}

function fighter(side, id, meter = 0) {
  const c = byId(id);
  return {
    side, id: c.id, c, x: side ? 1.5 : -1.5, y: 0, vx: 0, vy: 0, face: side ? -1 : 1, hp: c.hp, meter,
    state: 'stand', t: 1, move: null, mid: null, mf: 0, hitIdx: -1, connected: false, chains: 0, stun: 0, inv: 0,
    crouch: false, guard: false, airAttack: false, grab: false, grabAt: 0, push: 0, jumpX: 0, combo: 0, scale: 1, juggle: 0,
    dir: 5, holdX: 0, holdY: 0, buf: [], press: { l: 0, h: 0, s: 0 }, held: { l: false, h: false, s: false }, last: { l: -99, h: -99, s: -99 },
    stats: { hits: 0, blocks: 0, maxCombo: 0, specials: 0, supers: 0, throws: 0 },
  };
}

const other = (g, f) => g.f[1 - f.side];
const grounded = (f) => f.y <= 0 && f.vy <= 0;
const total = (m) => m.startup + m.active + m.recovery;
// The numpad direction a player holds, turned so that 6 is always toward the other fighter.
export const dirOf = (inp, face) => 5 + (inp.x || 0) * face + 3 * (inp.y || 0);

// Bigger fighters are bigger targets: boxes scale with the build.
export function hurtbox(f) {
  if (['down', 'rise', 'ko', 'thrown'].includes(f.state)) return null;
  const b = f.y > 0.05 ? HURT.air : f.crouch ? HURT.crouch : HURT.stand, k = f.c.build || 1;
  return [f.x + b[0] * k, f.x + b[1] * k, f.y + b[2] * k, f.y + b[3] * k];
}
const half = (f) => PHYS.half * (f.c.build || 1);
export function hitbox(f) {
  const m = f.move;
  if (f.state !== 'move' || !m || !m.box || f.mf <= m.startup || f.mf > m.startup + m.active) return null;
  const b = m.box;
  return f.face > 0 ? [f.x + b[0], f.x + b[1], f.y + b[2], f.y + b[3]] : [f.x - b[1], f.x - b[0], f.y + b[2], f.y + b[3]];
}
const overlap = (a, b) => !!(a && b && a[0] < b[1] && b[0] < a[1] && a[2] < b[3] && b[2] < a[3]);
export const pbox = (p) => [p.x + p.def.box[0], p.x + p.def.box[1], p.y + p.def.box[2], p.y + p.def.box[3]];

// Where in the direction history a motion was last finished (-1 if it wasn't, recently).
export function latest(buf, seq, within = 18) {
  let k = seq.length - 1, end = -1;
  for (let i = buf.length - 1; i >= Math.max(0, buf.length - within) && k >= 0; i--) {
    if (buf[i] === seq[k]) { if (k === seq.length - 1) end = i; k--; }
  }
  return k < 0 ? end : -1;
}

export function tick(g, inputs = [NOIN, NOIN]) {
  const ev = [];
  g.frame++;
  if (g.phase === 'intro') {
    if (g.phaseT === ROUND.intro) ev.push({ type: 'round', n: g.round, final: g.wins[0] === ROUND.wins - 1 && g.wins[1] === ROUND.wins - 1 });
    if (--g.phaseT <= 0) { g.phase = 'fight'; ev.push({ type: 'fight' }); }
    return ev;
  }
  if (g.phase === 'matchOver') return ev;
  const live = g.phase === 'fight';
  for (let i = 0; i < 2; i++) record(g, g.f[i], live ? inputs[i] || NOIN : NOIN);
  // the hit-freeze after a hit, a block or a super flash: the world stops, but presses are kept
  if (g.freeze > 0) { g.freeze--; return ev; }
  for (const f of g.f) { f.t++; if (f.inv > 0) f.inv--; for (const k of BUTTONS) if (f.press[k] > 0) f.press[k]--; }
  for (const f of g.f) faceUp(g, f);
  if (live) for (const f of g.f) act(g, f, ev);
  for (const f of g.f) advance(g, f, ev);
  for (const f of g.f) physics(f, ev);
  pushboxes(g);
  projectiles(g, ev);
  const [a, b] = g.f, hitA = strikes(g, a, b), hitB = strikes(g, b, a);
  if (hitA) resolve(g, a, b, hitA, ev);
  if (hitB) resolve(g, b, a, hitB, ev);
  throws(g, ev);
  for (const f of g.f) settle(f, ev);
  if (live) {
    checkKO(g, ev);
    if (g.phase === 'fight') {
      if (--g.timer <= 0) timeUp(g, ev);
      else if (g.timer % 60 === 0) ev.push({ type: 'second', left: g.timer / 60 });
    }
  } else {
    const w = g.roundWinner === null ? null : g.f[g.roundWinner];
    if (w && (w.state === 'stand' || w.state === 'crouch')) { w.state = 'win'; w.t = 0; w.vx = 0; ev.push({ type: 'pose', side: w.side }); }
    if (--g.phaseT <= 0) endRound(g, ev);
  }
  return ev;
}

// Remember the stick and the buttons, for buffering and motion inputs.
function record(g, f, inp) {
  f.dir = dirOf(inp, f.face);
  f.buf.push(f.dir);
  if (f.buf.length > 24) f.buf.shift();
  for (const k of BUTTONS) {
    if (inp[k] && !f.held[k]) { f.press[k] = BUF; f.last[k] = g.frame; }
    f.held[k] = !!inp[k];
  }
  f.holdY = inp.y || 0;
  f.holdX = (inp.x || 0) * f.face; // +1 toward the other fighter
}
const ago = (g, f, k) => g.frame - f.last[k];

function faceUp(g, f) {
  const o = other(g, f);
  if (grounded(f) && (f.state === 'stand' || f.state === 'crouch') && Math.abs(o.x - f.x) > 0.02) f.face = o.x > f.x ? 1 : -1;
}

function start(g, f, id, ev) {
  const m = f.c.moves[id];
  if (!m) return false;
  if (m.super && f.meter < METER.max) return false;
  // one projectile of your own on screen at a time
  if (m.proj && !m.super && g.projs.some((p) => p.side === f.side)) return false;
  if (m.super) { f.meter = 0; g.freeze = FREEZE.super; f.stats.supers++; ev.push({ type: 'super', side: f.side, name: m.name, id }); }
  else if (m.special) { f.meter = Math.min(METER.max, f.meter + METER.special); f.stats.specials++; ev.push({ type: 'special', side: f.side, name: m.name, id }); }
  else ev.push({ type: 'swing', side: f.side, id, heavy: id[0] === 'H' });
  f.state = 'move'; f.move = m; f.mid = id; f.mf = 0; f.hitIdx = -1; f.connected = false; f.crouch = !!m.crouch; f.guard = false; f.grab = false;
  if (!m.air) f.vx = 0;
  for (const k of BUTTONS) f.press[k] = 0;
  return true;
}

// Which special: the motion finished most recently wins (ties go to the uppercut). With no motion,
// the stick is a shortcut: toward or neutral for the forward special, down for the uppercut, back for
// the back special. Heavy with special, at full meter, is the super.
function special(g, f, ev) {
  if ((f.press.h || ago(g, f, 'h') <= KARA) && f.meter >= METER.max && start(g, f, 'SUPER', ev)) return true;
  const b = f.buf, dp = latest(b, [6, 2, 3]), qcf = latest(b, [2, 3, 6]), qcb = latest(b, [2, 1, 4]);
  const best = Math.max(dp, qcf, qcb);
  let id;
  if (best >= 0) id = dp === best ? 'DP' : qcf === best ? 'QCF' : 'QCB';
  else id = [1, 2, 3].includes(f.dir) ? 'DP' : [4, 7].includes(f.dir) ? 'QCB' : 'QCF';
  return start(g, f, id, ev);
}

const NORMALS = ['L5', 'H5', 'L2', 'H2'];
function act(g, f, ev) {
  const m = f.move, o = other(g, f), dx = Math.abs(o.x - f.x);
  // guarding through blockstun: you can still switch between standing and crouching guard
  if (f.state === 'block') { f.crouch = f.holdY < 0; return; }
  if (f.state === 'move') {
    if (NORMALS.includes(f.mid) && f.mf <= KARA && !f.connected) {
      // a second button a moment after the first: it was meant together
      if (f.press.s) { special(g, f, ev); return; }
      if (((f.press.l && ago(g, f, 'h') <= KARA) || (f.press.h && ago(g, f, 'l') <= KARA)) && dx <= f.c.moves.T.range && throwable(o)) { start(g, f, 'T', ev); return; }
    }
    // cancels: a ground normal that connected (hit or blocked) chains, or cancels into a special
    if (f.connected && !m.air && f.mf <= m.startup + m.active + 8) {
      if (f.press.s && !m.special) { special(g, f, ev); return; }
      if (f.press.s && (f.press.h || ago(g, f, 'h') <= KARA) && m.special && !m.super && f.meter >= METER.max) { start(g, f, 'SUPER', ev); return; }
      if (m.cancel === 'chain' && f.chains < 3 && (f.press.l || f.press.h)) {
        const low = f.holdY < 0;
        f.chains++;
        start(g, f, f.press.h ? (low ? 'H2' : 'H5') : low ? 'L2' : 'L5', ev);
      }
    }
    return;
  }
  // in the air: one attack per jump
  if (f.state === 'air') {
    if (!f.airAttack && (f.press.l || f.press.h)) {
      const vx = f.vx, vy = f.vy;
      f.airAttack = true;
      start(g, f, f.press.h ? 'HJ' : 'LJ', ev);
      f.vx = vx; f.vy = vy;
    }
    return;
  }
  if (f.state !== 'stand' && f.state !== 'crouch') return;
  f.chains = 0;
  if (f.press.s) { special(g, f, ev); return; }
  if (f.press.l && f.press.h && dx <= f.c.moves.T.range && throwable(o) && start(g, f, 'T', ev)) return;
  if (f.press.h) { start(g, f, f.holdY < 0 ? 'H2' : 'H5', ev); return; }
  if (f.press.l) { start(g, f, f.holdY < 0 ? 'L2' : 'L5', ev); return; }
  if (f.holdY > 0) { f.state = 'prejump'; f.t = 0; f.jumpX = f.holdX; f.crouch = false; f.guard = false; f.vx = 0; return; }
  f.crouch = f.holdY < 0;
  f.state = f.crouch ? 'crouch' : 'stand';
  f.guard = f.holdX < 0;
  // holding back while something is coming means guarding, not walking away
  const sp = f.c.speed;
  f.vx = f.crouch ? 0 : f.holdX > 0 ? PHYS.walkF * sp * f.face : f.holdX < 0 && !threatened(g, f) ? -PHYS.walkB * sp * f.face : 0;
}

// Is an attack or a projectile coming at this fighter right now?
export function threatened(g, f) {
  const o = other(g, f);
  if (o.state === 'move' && o.move && !o.move.throw && o.mf <= o.move.startup + o.move.active && Math.abs(o.x - f.x) < 2.2) return true;
  return g.projs.some((p) => p.side !== f.side && Math.abs(p.x - f.x) < 2.6 && Math.sign(f.x - p.x) === Math.sign(p.vx));
}
const throwable = (o) => grounded(o) && ['stand', 'crouch', 'move', 'land', 'prejump'].includes(o.state) && o.inv <= 0;

function advance(g, f, ev) {
  if (f.state === 'prejump') {
    if (++f.t >= PHYS.prejump) { f.state = 'air'; f.t = 0; f.vy = PHYS.jumpVy; f.vx = f.jumpX * PHYS.jumpVx * f.c.speed * f.face; f.airAttack = false; ev.push({ type: 'jump', side: f.side }); }
    return;
  }
  if (f.state !== 'move') return;
  const m = f.move;
  f.mf++;
  if (m.inv) f.inv = f.mf >= m.inv[0] && f.mf <= m.inv[1] ? 1 : 0;
  if (m.vx && grounded(f)) { let v = null; for (const [at, s] of m.vx) if (f.mf >= at) v = s; if (v !== null) f.vx = v * f.face; }
  if (m.proj && f.mf === m.proj.at) {
    const p = m.proj;
    g.projs.push({ side: f.side, x: f.x + 0.6 * f.face, y: p.vy ? 1.3 : 0, vx: p.vx * f.face, vy: p.vy || 0, gravity: p.gravity || 0, def: p, life: p.life, hits: p.hits || 1, cool: 0, kind: p.kind, t: 0 });
    ev.push({ type: 'proj', side: f.side, kind: p.kind });
  }
  if (f.mf >= total(m)) {
    f.move = null; f.mid = null; f.grab = false;
    if (m.air && !grounded(f)) { f.state = 'air'; return; }
    f.crouch = f.holdY < 0; f.state = f.crouch ? 'crouch' : 'stand'; f.vx = 0; f.t = 1;
  }
}

function physics(f, ev) {
  if (f.push) { f.x += f.push; f.push *= 0.72; if (Math.abs(f.push) < 0.002) f.push = 0; }
  f.x += f.vx;
  if (f.y > 0 || f.vy > 0) {
    f.y += f.vy; f.vy -= PHYS.g;
    if (f.y <= 0) {
      f.y = 0; f.vy = 0; f.vx = 0;
      if (f.state === 'hitAir') { f.state = 'down'; f.t = 0; ev.push({ type: 'down', side: f.side, x: f.x }); }
      else if (f.state === 'ko') ev.push({ type: 'down', side: f.side, x: f.x, ko: true });
      else if (f.state === 'air' || (f.state === 'move' && f.move && f.move.air)) { f.state = 'land'; f.t = 0; f.move = null; f.mid = null; ev.push({ type: 'land', side: f.side }); }
    }
  } else if (!['stand', 'crouch', 'move', 'thrown'].includes(f.state)) f.vx *= 0.8;
  f.x = clamp(f.x, -PHYS.wall, PHYS.wall);
}

function pushboxes(g) {
  const [a, b] = g.f;
  const need = half(a) + half(b), solid = (f) => !['down', 'rise', 'ko', 'thrown'].includes(f.state);
  if (solid(a) && solid(b) && Math.abs(b.x - a.x) < need && Math.abs(a.y - b.y) < 1.1) {
    const s = b.x - a.x >= 0 ? 1 : -1, over = (need - Math.abs(b.x - a.x)) / 2;
    a.x = clamp(a.x - over * s, -PHYS.wall, PHYS.wall); b.x = clamp(b.x + over * s, -PHYS.wall, PHYS.wall);
    if (Math.abs(b.x - a.x) < need - 1e-6) { if (Math.abs(a.x) >= PHYS.wall - 1e-6) b.x = a.x + need * s; else a.x = b.x - need * s; }
  }
  // the camera can only show so much of the street
  const gap = b.x - a.x;
  if (Math.abs(gap) > PHYS.gap) { const mid = (a.x + b.x) / 2, s = Math.sign(gap); a.x = mid - (PHYS.gap / 2) * s; b.x = mid + (PHYS.gap / 2) * s; }
}

function projectiles(g, ev) {
  for (const p of g.projs) {
    p.t++; p.x += p.vx; p.y += p.vy; p.vy -= p.gravity; p.life--;
    if (p.cool > 0) p.cool--;
    if (p.def.arc && p.y <= 0) { p.life = 0; ev.push({ type: 'splat', x: p.x, kind: p.kind }); }
    if (Math.abs(p.x) > PHYS.wall + 1.5) p.life = 0;
  }
  // two projectiles that meet cancel each other out, a hit at a time
  for (const p of g.projs) for (const q of g.projs) {
    if (p.side !== 0 || q.side !== 1 || p.life <= 0 || q.life <= 0 || !overlap(pbox(p), pbox(q))) continue;
    p.hits--; q.hits--;
    if (p.hits <= 0) p.life = 0;
    if (q.hits <= 0) q.life = 0;
    ev.push({ type: 'clash', x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 });
  }
  for (const p of g.projs) {
    if (p.life <= 0 || p.cool > 0 || g.phase !== 'fight') continue;
    const d = g.f[1 - p.side];
    if (d.inv > 0 || (d.state === 'hitAir' && d.juggle >= JUGGLE) || !overlap(pbox(p), hurtbox(d))) continue;
    resolve(g, g.f[p.side], d, { m: { guard: 'mid', push: 0.25, special: true, ...p.def }, x: p.x, y: p.y, dir: Math.sign(p.vx), proj: true, last: true }, ev);
    p.hits--; p.cool = 8;
    if (p.hits <= 0) { p.life = 0; ev.push({ type: 'pop', x: p.x, y: p.y, kind: p.kind }); }
  }
  g.projs = g.projs.filter((p) => p.life > 0);
}

// The attacker's hit this frame, if its active hitbox touches the defender.
function strikes(g, a, d) {
  if (g.phase !== 'fight') return null;
  const box = hitbox(a), hurt = hurtbox(d), m = a.move;
  if (!box || m.throw || d.inv > 0 || !overlap(box, hurt)) return null;
  const hits = m.hits || 1, idx = Math.min(hits - 1, Math.floor(((a.mf - m.startup - 1) * hits) / m.active));
  if (idx <= a.hitIdx) return null;
  if (d.state === 'hitAir' && d.juggle >= JUGGLE && !m.super) return null;
  a.hitIdx = idx;
  return { m, x: (Math.max(box[0], hurt[0]) + Math.min(box[1], hurt[1])) / 2, y: (Math.max(box[2], hurt[2]) + Math.min(box[3], hurt[3])) / 2, dir: Math.sign(d.x - a.x) || a.face, last: idx === hits - 1 };
}

function blocks(d, guard) {
  if (!grounded(d) || !d.guard || !['stand', 'crouch', 'block'].includes(d.state)) return false;
  if (guard === 'low') return d.crouch;
  if (guard === 'high') return !d.crouch;
  return true;
}

function resolve(g, a, d, h, ev) {
  const m = h.m, heavy = m.dmg >= 70 || !!m.super;
  if (!h.proj) a.connected = true;
  if (blocks(d, m.guard)) {
    // chip damage can only finish someone with a super
    d.hp = Math.max(m.super ? 0 : 1, d.hp - Math.round(m.dmg * (m.chip || 0)));
    d.state = 'block'; d.stun = m.bstun; d.vx = 0; d.move = null;
    shove(a, d, (m.push || 0.2) * 0.8, h.dir);
    g.freeze = Math.max(g.freeze, FREEZE.block);
    a.meter = Math.min(METER.max, a.meter + m.dmg * METER.block); d.meter = Math.min(METER.max, d.meter + m.dmg * METER.block);
    d.stats.blocks++;
    ev.push({ type: 'block', side: a.side, x: h.x, y: h.y, heavy, proj: !!h.proj });
    return;
  }
  // caught in the startup of your own attack: a counter hit
  const counter = d.state === 'move' && !!d.move && d.mf <= d.move.startup;
  const dmg = Math.max(1, Math.round(m.dmg * d.scale * (counter ? 1.2 : 1)));
  d.hp = Math.max(0, d.hp - dmg);
  d.combo++;
  if (d.combo >= 2) d.scale = Math.max(0.4, d.scale - 0.1);
  a.stats.hits++; a.stats.maxCombo = Math.max(a.stats.maxCombo, d.combo);
  a.meter = Math.min(METER.max, a.meter + dmg * METER.hit); d.meter = Math.min(METER.max, d.meter + dmg * METER.got);
  d.move = null; d.mid = null; d.guard = false; d.grab = false;
  const air = d.y > 0.05 || d.state === 'hitAir';
  if (m.launch || air || (m.kd && h.last)) {
    d.state = 'hitAir'; d.juggle++;
    d.vy = m.launch || (m.kd && h.last ? 0.075 : 0.055);
    d.vx = h.dir * (m.kd && h.last ? 0.035 : 0.018);
    d.y = Math.max(d.y, 0.02);
  } else { d.state = 'hit'; d.stun = m.stun + (counter ? 4 : 0); d.vx = 0; }
  shove(a, d, m.push || 0.2, h.dir);
  g.freeze = Math.max(g.freeze, heavy ? FREEZE.heavy : FREEZE.light);
  ev.push({ type: 'hit', side: a.side, dmg, combo: d.combo, x: h.x, y: h.y, heavy, counter, special: !!m.special, super: !!m.super, proj: !!h.proj });
}

// The one getting hit slides back; against the wall, the attacker slides back instead.
function shove(a, d, dist, dir) {
  if (Math.abs(d.x + dir * dist) > PHYS.wall) a.push = -dir * dist * 0.3;
  else d.push = dir * dist * 0.3;
}

// A throw grabs on an active frame in range, holds for a moment in which the other fighter can break
// it (light and heavy together), then lands. Command grabs (specials) can't be broken.
function throws(g, ev) {
  for (const a of g.f) {
    const m = a.move;
    if (a.state !== 'move' || !m || !m.throw) continue;
    const d = other(g, a);
    if (!a.grab) {
      if (a.mf > m.startup && a.mf <= m.startup + m.active && g.phase === 'fight' && Math.abs(d.x - a.x) <= m.range && throwable(d)) {
        a.grab = true; a.grabAt = a.mf;
        d.state = 'thrown'; d.t = 0; d.move = null; d.mid = null; d.vx = 0; d.guard = false;
        d.x = clamp(a.x + a.face * 0.62, -PHYS.wall, PHYS.wall);
        ev.push({ type: 'grab', side: a.side, name: m.name, special: !!m.special });
      }
      continue;
    }
    if (d.state !== 'thrown') { a.grab = false; continue; }
    const held = a.mf - a.grabAt;
    if (!m.special && ago(g, d, 'l') <= held + 4 && ago(g, d, 'h') <= held + 4) {
      const s = Math.sign(d.x - a.x) || a.face;
      a.grab = false; a.move = null; a.mid = null; a.state = 'stand'; a.t = 1; d.state = 'stand'; d.t = 1;
      d.push = s * 0.25; a.push = -s * 0.2;
      ev.push({ type: 'tech', x: (a.x + d.x) / 2, side: d.side });
      continue;
    }
    if (held >= TECH) {
      a.grab = false;
      const dmg = Math.round(m.dmg * d.scale);
      d.hp = Math.max(0, d.hp - dmg); d.combo++;
      a.meter = Math.min(METER.max, a.meter + dmg * METER.hit); d.meter = Math.min(METER.max, d.meter + dmg * METER.got);
      d.state = 'hitAir'; d.vy = 0.1; d.y = 0.3; d.vx = a.face * 0.035; d.juggle = JUGGLE;
      a.stats.throws++; a.stats.hits++;
      g.freeze = FREEZE.heavy;
      ev.push({ type: 'throw', side: a.side, dmg, name: m.name, x: d.x, y: 1, special: !!m.special });
    }
  }
}

function settle(f, ev) {
  if (f.state === 'hit' || f.state === 'block') { if (--f.stun <= 0) { f.state = f.crouch ? 'crouch' : 'stand'; f.t = 1; } }
  else if (f.state === 'land') { if (++f.t >= PHYS.land) { f.state = 'stand'; f.crouch = false; f.t = 1; } }
  else if (f.state === 'down') { f.inv = 1; if (++f.t >= KD.down) { f.state = 'rise'; f.t = 0; } }
  else if (f.state === 'rise') { f.inv = 1; if (++f.t >= KD.rise) { f.state = 'stand'; f.crouch = false; f.t = 1; f.inv = KD.wake; ev.push({ type: 'rise', side: f.side }); } }
  // free again: whatever combo was on you is over
  if (!['hit', 'hitAir', 'thrown', 'ko'].includes(f.state) && f.combo) { f.combo = 0; f.scale = 1; f.juggle = 0; }
}

function checkKO(g, ev) {
  const out = g.f.filter((f) => f.hp <= 0);
  if (!out.length) return;
  for (const d of out) {
    const a = other(g, d), dir = Math.sign(d.x - a.x) || -d.face;
    // knocked back and down, not up: a short, low stagger to the floor (in the air, they just fall)
    d.state = 'ko'; d.move = null; d.mid = null; d.vy = Math.min(Math.max(d.vy, 0.045), 0.06); d.y = Math.max(d.y, 0.02); d.vx = dir * 0.045;
  }
  g.phase = 'ko'; g.phaseT = ROUND.ko; g.projs = [];
  if (out.length === 2) { g.roundWinner = null; g.draw = true; } else g.roundWinner = 1 - out[0].side;
  const w = g.roundWinner === null ? null : g.f[g.roundWinner];
  ev.push({ type: 'ko', winner: g.roundWinner, perfect: !!w && w.hp >= w.c.hp, double: out.length === 2 });
}

function timeUp(g, ev) {
  const [a, b] = g.f, ra = a.hp / a.c.hp, rb = b.hp / b.c.hp;
  g.phase = 'timeup'; g.phaseT = ROUND.ko; g.projs = [];
  if (Math.abs(ra - rb) < 1e-9) { g.roundWinner = null; g.draw = true; } else g.roundWinner = ra > rb ? 0 : 1;
  ev.push({ type: 'timeup', winner: g.roundWinner });
}

function endRound(g, ev) {
  if (g.roundWinner !== null) g.wins[g.roundWinner]++;
  ev.push({ type: 'roundEnd', winner: g.roundWinner, wins: [...g.wins] });
  if (g.wins[0] >= ROUND.wins || g.wins[1] >= ROUND.wins || g.round >= ROUND.max) {
    g.phase = 'matchOver';
    g.winner = g.wins[0] > g.wins[1] ? 0 : g.wins[1] > g.wins[0] ? 1 : null;
    ev.push({ type: 'matchEnd', winner: g.winner });
    return;
  }
  g.round++;
  // super meter carries over between rounds
  g.f = g.f.map((f) => fighter(f.side, f.id, f.meter));
  g.projs = []; g.timer = ROUND.secs * 60; g.freeze = 0; g.phase = 'intro'; g.phaseT = ROUND.intro; g.roundWinner = null; g.draw = false;
}

// A stable fingerprint of everything that matters, for replay tests.
export function hashState(g) {
  return JSON.stringify([g.frame, g.phase, g.round, g.wins, g.timer, g.f.map((f) => [f.state, f.mid, f.mf, +f.x.toFixed(5), +f.y.toFixed(5), f.hp, +f.meter.toFixed(3), f.combo]), g.projs.map((p) => [+p.x.toFixed(4), p.life])]);
}
