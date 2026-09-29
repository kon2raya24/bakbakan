// The CPU fighters. Each one sees the match a few frames late, the way a person reacts, and then works
// the same stick and buttons a player has. It never reads the other side's buttons, only what it can
// see on screen: who is attacking, jumping, throwing a projectile or stuck in recovery.
import { rand } from './rng.mjs';
import { NOIN } from './fight.mjs';

export const LEVELS = {
  madali: { key: 'madali', name: 'Madali', react: 20, block: 0.3, antiAir: 0.2, punish: 0.3, combo: 0.3, confirm: 0.15, tech: 0.12, wake: 0.3, reversal: 0.05, aggr: 0.35, think: [18, 40], jump: 0.1 },
  katamtaman: { key: 'katamtaman', name: 'Katamtaman', react: 12, block: 0.6, antiAir: 0.5, punish: 0.6, combo: 0.65, confirm: 0.55, tech: 0.35, wake: 0.55, reversal: 0.15, aggr: 0.5, think: [8, 24], jump: 0.1 },
  mahirap: { key: 'mahirap', name: 'Mahirap', react: 7, block: 0.85, antiAir: 0.8, punish: 0.9, combo: 0.9, confirm: 0.9, tech: 0.6, wake: 0.8, reversal: 0.25, aggr: 0.6, think: [3, 12], jump: 0.08 },
};

// How each fighter likes to use its specials.
const STYLE = {
  lakan: { ender: 'QCF', zone: 'QCB', rush: 'QCF' },
  dalisay: { ender: 'QCF', zone: null, rush: 'QCF' },
  tanod: { ender: 'QCF', zone: 'QCF', rush: 'QCB' },
  balut: { ender: 'DP', zone: 'QCF', rush: 'QCB' },
  kapre: { ender: 'DP', zone: 'QCF', rush: null, grab: 'QCB' },
};

export function createAI(side, level = 'katamtaman', seed = 1) {
  return { side, lv: LEVELS[level] || LEVELS.katamtaman, rs: (Math.imul(seed, 2654435761) + side * 977) >>> 0, plan: [], wait: 40, seen: [], guardT: 0, guardLow: false, handled: new Set(), knocked: false };
}

// Steps of a plan: hold a direction (relative: +1 toward the other fighter) and buttons for n frames,
// or wait until a condition holds.
const press = (b, rel = 0, y = 0) => [{ rel, y, ...b, n: 1 }, { rel, y, n: 1 }];
const SHORT = { QCF: { rel: 1 }, DP: { rel: 1, y: -1 }, QCB: { rel: -1 } };
const special = (id) => (id ? press({ s: true }, SHORT[id].rel, SHORT[id].y || 0) : []);
const landed = () => ({ until: (me) => me.connected || me.state !== 'move', n: 30 });
const whiffStop = () => ({ stopIf: (me) => !me.connected });

// What the CPU can see of the other fighter this frame. Moves and jumps are numbered as they start,
// so each one is reacted to once.
function snap(g, o, me, prev) {
  const inc = g.projs.filter((p) => p.side === o.side && Math.sign(me.x - p.x) === Math.sign(p.vx));
  const near = inc.reduce((a, p) => (Math.abs(p.x - me.x) < Math.abs(a.x - me.x) ? p : a), inc[0] || null);
  const newMove = o.state === 'move' && (!prev || prev.state !== 'move' || prev.mid !== o.mid || o.mf < prev.mf);
  const newJump = o.state === 'prejump' && (!prev || prev.state !== 'prejump');
  return {
    state: o.state, mid: o.mid, mf: o.mf, move: o.move, x: o.x, y: o.y, vx: o.vx, t: o.t,
    moveNo: (prev ? prev.moveNo : 0) + (newMove ? 1 : 0), jumpNo: (prev ? prev.jumpNo : 0) + (newJump ? 1 : 0),
    proj: near ? { key: `p${near.side}:${g.frame - near.t}`, d: Math.abs(near.x - me.x) } : null,
  };
}

export function aiInput(ai, g) {
  const me = g.f[ai.side], o = g.f[1 - ai.side];
  ai.seen.push(snap(g, o, me, ai.seen[ai.seen.length - 1]));
  if (ai.seen.length > 40) ai.seen.shift();
  if (g.phase !== 'fight') { ai.plan = []; ai.guardT = 0; return NOIN; }
  const lv = ai.lv, R = () => rand(ai), dist = Math.abs(o.x - me.x), st = STYLE[me.id] || STYLE.lakan;
  const s = ai.seen[Math.max(0, ai.seen.length - 1 - lv.react)]; // what it has noticed by now
  const out = (rel = 0, y = 0, b = {}) => ({ x: rel * me.face, y, l: !!b.l, h: !!b.h, s: !!b.s });
  const once = (key) => { if (ai.handled.has(key)) return false; ai.handled.add(key); if (ai.handled.size > 64) ai.handled.delete(ai.handled.values().next().value); return true; };

  // grabbed: a chance to break it
  if (me.state === 'thrown') { ai.plan = []; return once(`t${g.frame - me.t}`) && R() < lv.tech ? out(0, 0, { l: true, h: true }) : NOIN; }
  if (['hit', 'hitAir', 'down', 'ko'].includes(me.state)) { ai.plan = []; ai.guardT = 0; if (me.state === 'down') ai.knocked = true; return NOIN; }
  // getting up: guard, or a reversal uppercut
  if (me.state === 'rise' && ai.knocked) {
    ai.knocked = false;
    const r = R();
    if (r < lv.reversal && dist < 1.8) ai.plan = [{ until: (m) => m.state === 'stand', n: 30 }, ...special('DP')];
    else if (r < lv.reversal + lv.wake) { ai.plan = [{ until: (m) => m.state === 'stand', n: 30 }]; ai.guardT = 24; ai.guardLow = R() < 0.6; }
  }
  // in blockstun: keep holding the guard
  if (me.state === 'block') { ai.guardT = Math.max(ai.guardT, me.stun + 3); }

  // noticing danger (once per thing seen)
  if (me.state === 'stand' || me.state === 'crouch' || me.state === 'block') {
    const m = s.move;
    if (s.state === 'move' && m && !m.throw && !m.proj && s.mf <= m.startup + m.active && dist < reach(m) + 0.5 && once(`m${s.moveNo}`)) {
      if (R() < lv.block) {
        ai.plan = [];
        ai.guardT = m.startup + m.active - s.mf + 10;
        // lows need crouching, overheads and jump-ins standing; a mid can go either way
        const right = R() < 0.5 + lv.block / 2;
        ai.guardLow = m.guard === 'low' ? right : m.guard === 'high' || m.air ? !right : R() < 0.6;
      }
    } else if (s.proj && s.proj.d < 3.2 && once(s.proj.key)) {
      const r = R();
      if (r < lv.block) { ai.plan = []; ai.guardT = 26; ai.guardLow = false; }
      else if (r < lv.block + 0.25 && dist < 4.5 && !ai.plan.length) ai.plan = [{ rel: 1, y: 1, n: 4 }, { until: (mm) => mm.state !== 'air' && mm.state !== 'prejump', n: 60 }];
    } else if ((s.state === 'air' || s.state === 'prejump' || (s.state === 'move' && m && m.air)) && dist < 3 && Math.sign(s.vx || 0) === Math.sign(me.x - s.x) && once(`j${s.jumpNo}`)) {
      // a jump-in: knock it down with the uppercut, or guard high
      if (R() < lv.antiAir) ai.plan = [{ until: (mm, oo) => Math.abs(oo.x - mm.x) < 1.25 || oo.y <= 0, n: 40 }, ...special('DP')];
      else if (R() < lv.block) { ai.plan = []; ai.guardT = 34; ai.guardLow = false; }
    } else if (s.state === 'move' && m && s.mf > m.startup + m.active && (m.recovery - (s.mf - m.startup - m.active)) > 12 && dist < 1.6 && once(`w${s.moveNo}`)) {
      // a whiffed or blocked big move: punish it
      if (R() < lv.punish) ai.plan = me.meter >= 100 && R() < 0.6 ? press({ s: true, h: true }) : [...press({ h: true }), landed(), whiffStop(), ...special(st.ender)];
    }
  }

  if (ai.guardT > 0) { ai.guardT--; return out(-1, ai.guardLow ? -1 : 0); }

  // carry on with the plan
  while (ai.plan.length) {
    const step = ai.plan[0];
    if (step.stopIf) { ai.plan.shift(); if (step.stopIf(me, o)) { ai.plan = []; break; } continue; }
    if (step.confirm) { ai.plan.shift(); if (!['hit', 'hitAir'].includes(o.state) && R() < lv.confirm) { ai.plan = []; break; } continue; }
    if (step.until) { if (step.until(me, o) || --step.n <= 0) { ai.plan.shift(); continue; } return NOIN; }
    if (--step.n <= 0) ai.plan.shift();
    return out(step.rel || 0, step.y || 0, step);
  }
  if (me.state === 'air' && !me.airAttack && dist < 1.5 && me.vy < 0.03) return out(0, 0, { h: true });
  if (me.state !== 'stand' && me.state !== 'crouch') return NOIN;

  // the other fighter is down: walk up and be ready when they rise
  if (o.state === 'down' || o.state === 'rise') {
    if (dist > 1.0) return out(1);
    if (o.state === 'rise' && o.t >= 12 && once(`r${g.frame - o.t}`)) ai.plan = R() < 0.35 ? press({ l: true, h: true }) : [...press({ l: true }), landed(), whiffStop(), ...press({ l: true }), landed(), whiffStop(), ...press({ h: true }), { confirm: true }, ...special(st.ender)];
    return NOIN;
  }

  if (--ai.wait > 0) return idle(ai, me, dist, out);
  ai.wait = lv.think[0] + Math.floor(R() * (lv.think[1] - lv.think[0]));
  ai.plan = choose(ai, me, o, dist, st, R);
  return NOIN;
}

const reach = (m) => (m.box ? m.box[1] + 0.3 : m.range || 1);

function idle(ai, me, dist, out) {
  // footsies: drift toward a comfortable distance
  const want = 1.6 + (1 - ai.lv.aggr) * 1.2;
  if (dist > want + 0.6) return out(1);
  if (dist < 0.9 && ai.lv.aggr < 0.5) return out(-1);
  return NOIN;
}

function choose(ai, me, o, dist, st, R) {
  const lv = ai.lv, full = me.meter >= 100, opts = [];
  const add = (w, plan) => { if (w > 0) opts.push([w, plan]); };
  const combo = () => [...press({ l: true }), landed(), whiffStop(), ...press({ l: true }), landed(), whiffStop(), ...press({ h: true }), landed(), whiffStop(), { confirm: true }, ...special(st.ender)];
  const lows = () => [...press({ l: true }, 0, -1), landed(), whiffStop(), ...press({ l: true }, 0, -1), landed(), whiffStop(), ...press({ h: true }, 0, -1)];
  const jumpIn = () => [{ rel: 1, y: 1, n: 4 }, { until: (m, oo) => (m.state === 'air' && Math.abs(oo.x - m.x) < 1.45 && m.vy < 0.02) || (m.state !== 'air' && m.state !== 'prejump'), n: 60 }, ...press({ h: true }), { until: (m) => m.state === 'stand' || m.state === 'land', n: 60 }, landed(), ...press({ l: true }), landed(), whiffStop(), ...press({ h: true }), landed(), whiffStop(), ...special(st.ender)];
  if (dist < 1.15) {
    add(lv.combo, combo());
    add(0.3, press({ l: true, h: true }));
    add(0.25, lows());
    add(full ? 0.45 : 0, press({ s: true, h: true }));
    add(st.grab && dist < 1.3 ? 0.35 : 0, special(st.grab));
    add(0.25 * (1 - lv.aggr), [{ rel: -1, n: 18 }]);
    add(0.35 * (1 - lv.aggr), [{ rel: -1, y: -1, n: 20 }]);
  } else if (dist < 2.3) {
    add(lv.aggr, [{ rel: 1, n: 10 + Math.floor(R() * 20) }]);
    add(dist < 1.5 ? 0.3 : 0.1, press({ h: true }));
    add(dist < 1.45 ? 0.2 : 0, press({ h: true }, 0, -1));
    add(st.rush ? 0.18 : 0, special(st.rush));
    add(lv.jump, jumpIn());
    add(st.zone ? 0.15 : 0, special(st.zone));
    add(0.3 * (1 - lv.aggr), [{ rel: -1, n: 16 }]);
  } else {
    add(st.zone ? 0.4 : 0, special(st.zone));
    add(0.5 + lv.aggr, [{ rel: 1, n: 20 + Math.floor(R() * 30) }]);
    add(lv.jump * 0.6, jumpIn());
    add(0.2, [{ n: 20 }]);
  }
  let r = R() * opts.reduce((a, [w]) => a + w, 0);
  for (const [w, plan] of opts) { if ((r -= w) <= 0) return plan; }
  return [];
}
