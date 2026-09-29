// The fighters in 3D: realistic proportions on a jointed rig (hips, spine, neck, shoulders, elbows,
// wrists, hips, knees, ankles), smooth turned limbs, sculpted heads with painted faces, cloth and skin
// materials, and their props. Posed every frame from the fight state; no model files.
//
// The rig faces +x. Limbs hang along -y, and swinging one forward is +z rotation (a knee bends with
// -z). The lead arm and leg are on the far side (-z).
import * as THREE from './vendor/three.module.min.js';
import { fabric, skinDetail, hairDetail, headTex, rattan, weave, canvas, toTex, lerp, clamp } from './tex.mjs';

const TAU = Math.PI * 2;
const ease = (t) => t * t * (3 - 2 * t);

// ---------- poses ----------
// A pose: hip drop (hy) and shift (hx), lean forward, torso twist (negative brings the lead shoulder
// forward), head nod; each arm [shoulder swing forward, elbow bend, raise outward]; each leg [hip swing
// forward, knee bend]; and the whole body's tilt back, spin and lift.
const P = (o) => ({ hy: -0.06, hx: 0, lean: 0.1, twist: -0.35, head: 0, aL: [0.9, 1.9, 0.12], aR: [0.5, 2.3, 0.17], lL: [0.35, 0.25], lR: [-0.35, 0.3], tilt: 0, spin: 0, lift: 0, ...o });
export const STANCE = P({});
const CROUCH = P({ hy: -0.42, lean: 0.3, aL: [1.1, 1.8, 0.12], aR: [0.75, 2.1, 0.17], lL: [1.35, 2.1], lR: [0.55, 2.3] });
const POSES = {
  stance: STANCE, crouch: CROUCH,
  block: P({ hy: -0.1, lean: -0.08, twist: -0.15, aL: [1.35, 2.35, 0.25], aR: [1.15, 2.45, 0.3], head: 0.15 }),
  blockLow: P({ ...CROUCH, aL: [1.45, 2.3, 0.25], aR: [1.3, 2.4, 0.3], lean: 0.2, head: 0.15 }),
  prejump: P({ hy: -0.2, lean: 0.2, lL: [0.8, 1.2], lR: [0.2, 1.1] }),
  air: P({ hy: 0.02, lean: 0.05, lL: [1.25, 2.0], lR: [0.8, 1.8], aL: [1.0, 1.6, 0.2], aR: [0.8, 1.7, 0.2] }),
  land: P({ hy: -0.22, lean: 0.25, lL: [0.8, 1.3], lR: [0.2, 1.2] }),
  hit: P({ lean: -0.35, head: -0.35, twist: 0.1, aL: [0.3, 0.7, 0.3], aR: [-0.1, 0.6, 0.35], lL: [0.2, 0.2], lR: [-0.45, 0.4] }),
  hitLow: P({ ...CROUCH, lean: -0.15, head: -0.3, aL: [0.4, 0.8, 0.3], aR: [0.1, 0.7, 0.3] }),
  hitAir: P({ lean: -0.5, head: -0.4, aL: [2.2, 0.4, 0.5], aR: [2.6, 0.3, 0.6], lL: [0.9, 0.7], lR: [0.4, 0.3], tilt: 0.9 }),
  down: P({ hy: -0.02, lean: -0.1, head: 0.2, twist: 0, aL: [2.8, 0.2, 0.4], aR: [2.6, 0.4, 0.5], lL: [0.2, 0.3], lR: [0.4, 0.8], tilt: 1.52, lift: 0.12 }),
  ko: P({ hy: -0.02, lean: -0.1, head: 0.5, twist: 0, aL: [3.0, 0.1, 0.7], aR: [3.0, 0.1, 0.8], lL: [0.1, 0.1], lR: [0.3, 0.3], tilt: 1.55, lift: 0.12 }),
  thrown: P({ lean: -0.6, head: -0.5, aL: [1.8, 0.6, 0.6], aR: [2.2, 0.6, 0.6], lL: [0.9, 0.9], lR: [0.3, 0.6], tilt: 0.5, lift: 0.45 }),
  win: P({ hy: -0.02, lean: -0.1, twist: -0.1, head: -0.2, aL: [0.2, 0.4, 0.2], aR: [3.0, 0.2, 0.25] }),
  intro: P({ lean: 0, twist: -0.2, aL: [0.2, 0.4, 0.15], aR: [1.3, 0.3, 0.2] }),
};
// Moves: the wind-up, the hit, and (by default) back to the stance. `wave` makes a multi-hit move
// alternate arms or legs while it's active; `spin` turns the whole body through the move.
const M = (windup, active, extra = {}) => ({ windup: P(windup), active: P(active), ...extra });
const JAB = M({ aL: [1.1, 1.9, 0.12] }, { lean: 0.18, twist: -0.6, aL: [1.57, 0.05, 0.05] });
const STRAIGHT = M({ twist: 0, aR: [0.6, 2.1, 0.17] }, { lean: 0.28, twist: -0.9, aR: [1.6, 0.05, 0.05], lR: [-0.5, 0.15] });
const SWING = M({ twist: 0.2, aR: [2.8, 1.3, 0.2], lean: -0.1 }, { twist: -0.7, lean: 0.35, aR: [0.9, 0.15, 0.1], lL: [0.55, 0.35] });
const ANIMS = {
  jab: JAB, stickJab: JAB, straight: STRAIGHT, stickSwing: SWING, basketSwing: M({ twist: 0.4, aR: [1.2, 0.5, 0.9] }, { twist: -1.0, lean: 0.2, aR: [1.5, 0.2, 0.3] }),
  lowJab: M({ ...CROUCH }, { ...CROUCH, lean: 0.45, aL: [1.25, 0.05, 0.05] }),
  sweep: M({ ...CROUCH, hy: -0.5 }, { ...CROUCH, hy: -0.58, lean: 0.55, twist: -0.8, aL: [0.4, 0.5, 0.6], aR: [0.3, 0.4, 0.6], lL: [1.2, 2.3], lR: [1.55, 0.05] }),
  airJab: M({ ...POSES.air }, { ...POSES.air, lean: 0.3, aL: [1.1, 0.1, 0.05] }),
  airKick: M({ ...POSES.air }, { ...POSES.air, lean: -0.2, lL: [1.25, 0.05], lR: [0.5, 1.9] }),
  throw: M({ lean: 0.3, aL: [1.5, 0.3, 0.1], aR: [1.4, 0.4, 0.1] }, { lean: -0.35, twist: 0.4, aL: [2.6, 0.6, 0.2], aR: [2.8, 0.5, 0.2], lL: [0.6, 0.4] }),
  grab: M({ lean: 0.4, aL: [1.5, 0.2, 0.3], aR: [1.5, 0.2, 0.3] }, { lean: -0.4, aL: [2.9, 0.4, 0.2], aR: [2.9, 0.4, 0.2], hy: -0.12 }),
  flurry: M({ twist: 0, aL: [1.2, 1.2, 0.2], aR: [1.2, 1.2, 0.2] }, { lean: 0.25, twist: -0.3, aL: [1.5, 0.4, 0.1], aR: [1.5, 0.4, 0.1] }, { wave: 'arms' }),
  flurryKick: M({ lean: -0.1 }, { lean: -0.25, twist: -0.3, lL: [1.5, 0.2], lR: [1.1, 0.4] }, { wave: 'legs' }),
  rising: M({ ...CROUCH, aR: [0.6, 2.2, 0.1] }, { hy: 0.1, lift: 0.35, lean: -0.25, twist: -0.8, aR: [2.95, 0.3, 0.05], aL: [0.5, 1.4, 0.2], lL: [0.7, 0.9], lR: [-0.1, 1.5] }),
  risingKick: M({ ...CROUCH }, { lift: 0.4, lean: -0.45, aL: [2.2, 0.4, 0.4], aR: [1.0, 0.8, 0.4], lL: [2.7, 0.15], lR: [0.2, 1.0] }),
  toss: M({ twist: 0.3, aR: [2.8, 1.6, 0.1], lean: -0.1 }, { twist: -0.8, lean: 0.3, aR: [1.3, 0.2, 0.1] }),
  lowKickHigh: M({ lL: [0.9, 1.6] }, { lean: -0.2, lL: [1.45, 0.15], lR: [-0.2, 0.2] }),
  roundhouse: M({ twist: 0.2, lR: [0.6, 1.8] }, { lean: -0.35, twist: -1.2, lR: [1.7, 0.1], lL: [0.1, 0.2] }),
  flyKick: M({ ...POSES.prejump }, { lift: 0.3, lean: -0.25, lL: [1.55, 0.05], lR: [-0.5, 1.9], aL: [0.4, 1.2, 0.4], aR: [-0.4, 1.0, 0.4] }),
  spinKick: M({ twist: 0.3, lR: [0.4, 1.4] }, { lean: -0.3, lR: [1.6, 0.1], aL: [0.6, 0.4, 1.0], aR: [0.4, 0.4, 1.0] }, { spin: TAU }),
  shine: M({ aL: [1.0, 1.6, 0.1] }, { lean: 0.1, twist: -0.8, aL: [1.57, 0.05, 0.02] }),
  whistle: M({ hy: -0.15, aR: [1.4, 2.6, 0.2] }, { lift: 0.15, lean: -0.4, head: -0.4, aL: [1.4, 0.2, 1.2], aR: [1.7, 2.6, 0.3] }),
  overhead: M({ lift: 0.2, lean: -0.2, aR: [3.1, 1.4, 0.1], aL: [2.4, 1.0, 0.2] }, { lean: 0.5, twist: -0.6, aR: [0.55, 0.1, 0.1], aL: [0.6, 0.6, 0.2], lL: [0.7, 0.5] }),
  lob: M({ twist: 0.3, aR: [2.9, 1.8, 0.1] }, { twist: -0.6, lean: 0.2, aR: [2.1, 0.2, 0.1] }),
  spinUp: M({ ...CROUCH }, { lift: 0.25, lean: 0, aL: [1.57, 0.2, 1.4], aR: [1.57, 0.2, 1.4] }, { spin: TAU * 1.5 }),
  slide: M({ ...CROUCH }, { hy: -0.62, lean: -0.95, aL: [-0.4, 0.4, 0.5], aR: [-0.6, 0.3, 0.5], lL: [1.55, 0.05], lR: [1.0, 1.6] }),
  hammer: M({ lean: -0.25, aL: [3.0, 0.5, 0.1], aR: [3.0, 0.5, 0.1] }, { lean: 0.55, hy: -0.12, aL: [0.8, 0.1, 0.1], aR: [0.8, 0.1, 0.1] }),
  smoke: M({ aR: [1.2, 2.4, 0.1], head: 0.1 }, { lean: 0.25, head: 0.3, aR: [0.9, 2.0, 0.1] }),
  stomp: M({ lL: [1.5, 1.7], lean: -0.1, hy: 0.05 }, { hy: -0.15, lean: 0.25, lL: [0.3, 0.2] }),
};

export function mix(a, b, t) {
  const o = {};
  for (const key of Object.keys(a)) o[key] = Array.isArray(a[key]) ? a[key].map((v, i) => lerp(v, b[key][i], t)) : lerp(a[key], b[key], t);
  return o;
}

// The pose a fighter should be in, from the fight state alone; sub shifts a move by part of a frame.
export function targetPose(f, g, t, sub = 0) {
  const m = f.move;
  if (f.state === 'move' && m) {
    f = { ...f, mf: clamp(f.mf + sub, 0, m.startup + m.active + m.recovery) };
    const A = ANIMS[m.anim] || JAB, base = m.crouch ? CROUCH : m.air ? POSES.air : STANCE;
    let p;
    if (f.mf <= m.startup) p = mix(base, A.windup, ease(f.mf / Math.max(1, m.startup)));
    else if (f.mf <= m.startup + m.active) {
      p = { ...A.active };
      const into = (f.mf - m.startup) / m.active;
      if (A.wave === 'arms') { const w = Math.sin(into * (m.hits || 3) * Math.PI); p.aL = [p.aL[0] + w * 0.7, p.aL[1] + Math.max(0, -w), p.aL[2]]; p.aR = [p.aR[0] - w * 0.7, p.aR[1] + Math.max(0, w), p.aR[2]]; }
      if (A.wave === 'legs') { const w = Math.sin(into * (m.hits || 3) * Math.PI); p.lL = [p.lL[0] + w * 0.5, p.lL[1]]; p.lR = [p.lR[0] - w * 0.5, p.lR[1] + Math.max(0, w)]; }
      if (m.throw && f.grab) p = mix(A.windup, A.active, clamp((f.mf - f.grabAt) / 8, 0, 1));
      else if (m.throw) p = { ...A.windup };
    } else {
      const r = (f.mf - m.startup - m.active) / Math.max(1, m.recovery);
      p = mix(A.active, f.crouch ? CROUCH : base, ease(clamp(r * 1.4, 0, 1)));
    }
    if (A.spin) p.spin = A.spin * clamp((f.mf - m.startup * 0.6) / (m.startup * 0.4 + m.active), 0, 1);
    return p;
  }
  switch (f.state) {
    case 'crouch': return CROUCH;
    case 'block': return f.crouch ? POSES.blockLow : POSES.block;
    case 'prejump': return POSES.prejump;
    case 'air': return POSES.air;
    case 'land': return POSES.land;
    case 'hit': return f.crouch ? POSES.hitLow : POSES.hit;
    case 'hitAir': return { ...POSES.hitAir, tilt: clamp(0.5 + (0.1 - f.vy) * 6, 0.5, 1.4) };
    case 'down': return POSES.down;
    case 'rise': return mix(POSES.down, CROUCH, ease(clamp((f.t + sub) / 16, 0, 1)));
    case 'ko': return f.y > 0.05 ? { ...POSES.hitAir, tilt: clamp(0.6 + (0.1 - f.vy) * 7, 0.6, 1.5) } : POSES.ko;
    case 'thrown': return { ...POSES.thrown, tilt: 0.5 + Math.sin(t * 20) * 0.1 };
    case 'win': return POSES.win;
    default: {
      if (g.phase === 'intro' && g.phaseT > 40) return POSES.intro;
      // idle breathing and walking
      const p = { ...STANCE }, walking = Math.abs(f.vx) > 0.005;
      if (walking) {
        const w = Math.sin(t * 11 * f.c.speed), dirn = Math.sign(f.vx * f.face);
        p.lL = [0.35 + w * 0.45 * dirn, 0.3 + Math.max(0, w) * 0.5]; p.lR = [-0.35 - w * 0.45 * dirn, 0.3 + Math.max(0, -w) * 0.5]; p.hy = -0.07 - Math.abs(w) * 0.02;
      } else { const b = Math.sin(t * 3 + f.side) * 0.015; p.hy = -0.06 + b; p.aL = [0.9, 1.9 + b * 3, 0.12]; }
      return p;
    }
  }
}

export function applyPose(m, p) {
  const k = m.k;
  m.hips.position.set(p.hx * k, m.LEG + p.hy * k, 0);
  m.torso.rotation.set(0, p.twist, -p.lean);
  m.head.rotation.set(0, -p.twist * 0.8, -p.head);
  for (const [a, s, side] of [[m.aL, p.aL, -1], [m.aR, p.aR, 1]]) { a.sh.rotation.set(-side * s[2], 0, s[0]); a.el.rotation.set(0, 0, s[1]); }
  for (const [l, s] of [[m.lL, p.lL], [m.lR, p.lR]]) { l.hp.rotation.set(0, 0, s[0]); l.kn.rotation.set(0, 0, -s[1]); l.ft.rotation.set(0, 0, s[1] - s[0]); }
  m.body.rotation.set(0, p.spin, p.tilt);
  // lying down pivots at the feet: slide the body back under where the fighter really is
  m.body.position.set((p.tilt / 1.55) * 0.85 * k, p.lift * k, 0);
  // breathing
  m.chest.scale.set(1 + m.breath * 0.02, 1, 1 + m.breath * 0.012);
}

// ---------- building the bodies ----------
let DETAIL = null;
function details(low) {
  if (!DETAIL) DETAIL = { fabric: fabric(5, { size: low ? 128 : 256 }), knit: fabric(9, { size: low ? 128 : 256, weave: 0.35, repeat: [4, 4] }), skin: skinDetail(4, low ? 128 : 256), hair: hairDetail(6, low ? 128 : 256), rattan: rattan(), weave: weave() };
  return DETAIL;
}
function mesh(geo, material, { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1 } = {}) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.scale.set(sx, sy, sz);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}
// A turned shape: radius and height pairs from the bottom up, spun around y.
const lathe = (pts, segs) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(Math.max(0.0008, r), y)), segs);
const ball = (r, segs) => new THREE.SphereGeometry(r, segs, Math.max(8, segs * 0.75 | 0));

// ---------- a sculpted head ----------
// A sphere pushed into a head: a fuller skull, a brow, eye sockets, cheekbones, a nose, lips, and a
// jaw that narrows to a chin. The face texture is laid out for the sphere, so the paint stays put.
const bump = (d2, s) => Math.exp(-d2 / (s * s));
const sstep = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
function skull(v) { if (v.x < 0 && v.y > -0.3) v.x *= 1 + 0.07 * sstep(-0.3, 0.2, v.y); return v; }
function sculptHead(HR, { brow = 0.035, jaw = 1, nose = 1, square = 1, full = 1 } = {}, segs = 48) {
  const g = new THREE.SphereGeometry(1, segs, segs * 0.75 | 0), p = g.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    skull(v);
    const front = sstep(0.45, 0.8, v.x);
    if (v.y < 0) { const t = -v.y; v.z *= 1 - 0.22 * t * t * (2 - jaw) + 0.07 * square * bump((v.y + 0.5) ** 2, 0.16) * sstep(0.7, 0, v.x); v.x *= 1 - 0.1 * t * t; v.y -= 0.05 * t * t * t; if (v.x > 0) v.x += 0.05 * t * front; } // the jaw, its angle, and the chin
    v.z *= 1 + 0.05 * (full - 1) * bump((v.y + 0.25) ** 2, 0.3); // fuller cheeks
    v.z *= 1 + 0.05 * bump(v.y * v.y, 0.25) * front; // cheekbones
    v.x += brow * bump((v.y - 0.24) ** 2 + (v.z * 0.7) ** 2, 0.2) * front; // the brow
    for (const s of [-1, 1]) v.x -= 0.03 * bump((v.y - 0.12) ** 2 + (v.z - s * 0.36) ** 2, 0.12) * front; // eye sockets
    const ridge = bump(v.z * v.z * (v.y < -0.18 ? 0.6 : 1.4), 0.1) * sstep(0.14, -0.05, v.y) * (1 - sstep(-0.22, -0.34, v.y));
    v.x += 0.2 * nose * ridge * sstep(0.7, 0.9, v.x); // the nose
    v.z *= 1 + 0.12 * bump((v.y + 0.3) ** 2, 0.06) * bump(v.z * v.z, 0.18) * front; // the wings of the nose
    v.x += 0.04 * bump((v.y + 0.53) ** 2 * 3 + v.z * v.z, 0.22) * front; // lips
    p.setXYZ(i, v.x * HR, v.y * HR * 1.12, v.z * HR * 0.82);
  }
  g.computeVertexNormals();
  return g;
}
// Hair (or a cap) over the skull, thinning to nothing at its edge so the hairline is soft; lumpy with
// clumps unless it's a cap.
function capGeo(HR, { reach = 0.55, tilt = 0.62, thick = 0.045, lumpy = 1, segs = 40 } = {}) {
  const g = new THREE.SphereGeometry(1, segs, segs * 0.5 | 0, 0, TAU, 0, Math.PI * reach), p = g.attributes.position, v = new THREE.Vector3(), rim = Math.PI * reach;
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const th = Math.acos(clamp(v.y, -1, 1)), t = sstep(rim, rim - 0.35, th), phi = Math.atan2(v.z, v.x);
    const clumps = lumpy * (Math.sin(phi * 9 + th * 5) * 0.5 + Math.sin(phi * 17 - th * 11) * 0.3) * 0.012;
    v.multiplyScalar(1 + (thick + clumps) * t + 0.004);
    v.applyAxisAngle(new THREE.Vector3(0, 0, 1), tilt);
    skull(v);
    p.setXYZ(i, v.x * HR, v.y * HR * 1.12, v.z * HR * 0.82);
  }
  g.computeVertexNormals();
  return g;
}

// Merge a group's own meshes that share a material (they move together anyway): fewer draws.
function mergeChildren(group) {
  const byMat = new Map();
  for (const c of group.children) if (c.isMesh && !c.userData.keep) { if (!byMat.has(c.material)) byMat.set(c.material, []); byMat.get(c.material).push(c); }
  for (const [material, list] of byMat) {
    if (list.length < 2) continue;
    const parts = list.map((m) => { m.updateMatrix(); return (m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone()).applyMatrix4(m.matrix); });
    const n = parts.reduce((a, gg) => a + gg.attributes.position.count, 0);
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2);
    let at = 0;
    for (const gg of parts) { pos.set(gg.attributes.position.array, at * 3); nor.set(gg.attributes.normal.array, at * 3); if (gg.attributes.uv) uv.set(gg.attributes.uv.array, at * 2); at += gg.attributes.position.count; gg.dispose(); }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    const merged = new THREE.Mesh(geo, material); merged.castShadow = true; merged.receiveShadow = true;
    for (const m of list) group.remove(m);
    group.add(merged);
  }
  for (const c of group.children) if (!c.isMesh) mergeChildren(c);
}

// What each fighter wears.
const OUTFIT = {
  lakan: { sleeve: 'long', hem: 'untucked', pants: 'loose', feet: 'bare', shirt: 'camisa', girth: 1 },
  dalisay: { sleeve: 'short', hem: 'tucked', pants: 'fitted', feet: 'shoes', shirt: 'top', girth: 0.92 },
  tanod: { sleeve: 'short', hem: 'untucked', pants: 'fitted', feet: 'shoes', shirt: 'polo', belly: 1.2, girth: 1.08 },
  balut: { sleeve: 'none', hem: 'tucked', pants: 'shorts', feet: 'slippers', shirt: 'sando', girth: 0.97 },
  kapre: { sleeve: 'none', hem: 'bare', pants: 'bahag', feet: 'bare', shirt: 'bare', girth: 1.32 },
};

// Tanod's polo: the fabric with "TANOD" across the back and a patch on the chest.
function tanodShirt(color, low) {
  const S = low ? 256 : 512, cv = canvas(S, S), x = cv.getContext('2d');
  x.fillStyle = color; x.fillRect(0, 0, S, S);
  x.globalAlpha = 0.18; x.drawImage(details(low).fabric.canvas, 0, 0, S, S); x.globalAlpha = 1;
  x.fillStyle = '#f4f1e6'; x.textAlign = 'center'; x.font = `800 ${S * 0.07}px "Baloo 2", system-ui`;
  x.fillText('TANOD', S * 0.75, S * 0.34); x.font = `700 ${S * 0.03}px "Baloo 2", system-ui`; x.fillText('BRGY. MALINIS', S * 0.75, S * 0.39);
  x.fillStyle = '#ffd23f'; x.fillRect(S * 0.2, S * 0.3, S * 0.05, S * 0.05); // the chest patch
  return toTex(cv);
}

export function fighterModel(c, scene, { low = false } = {}) {
  const k = c.build, col = c.colors, o = OUTFIT[c.id] || OUTFIT.lakan, D = details(low), segs = low ? 12 : 20, G = o.girth || 1;
  // materials
  const hairy = c.id === 'kapre';
  const skin = hairy ? new THREE.MeshStandardMaterial({ color: col.skin, map: D.skin.map, normalMap: D.hair.normalMap, normalScale: new THREE.Vector2(0.9, 0.9), roughness: 0.78 })
    : low ? new THREE.MeshStandardMaterial({ color: col.skin, roughness: 0.6, map: D.skin.map })
    : new THREE.MeshPhysicalMaterial({ color: col.skin, roughness: 0.52, map: D.skin.map, normalMap: D.skin.normalMap, normalScale: new THREE.Vector2(0.35, 0.35), sheen: 0.6, sheenRoughness: 0.45, sheenColor: new THREE.Color('#ff9a7a') });
  const cloth = (color, knit = false, map = null) => new THREE.MeshStandardMaterial({ color: map ? '#ffffff' : color, map: map || (knit ? D.knit.map : D.fabric.map), normalMap: knit ? D.knit.normalMap : D.fabric.normalMap, normalScale: new THREE.Vector2(0.6, 0.6), roughness: 0.92 });
  const top = o.shirt === 'polo' ? cloth(col.top, false, tanodShirt(col.top, low)) : cloth(o.shirt === 'camisa' ? '#efe8d8' : col.top, o.shirt !== 'camisa');
  const bottom = cloth(col.bottom), accent = cloth(col.accent, true);
  const hair = new THREE.MeshStandardMaterial({ color: col.hair, map: D.hair.map, normalMap: D.hair.normalMap, roughness: 0.42, metalness: 0.05 });
  const face = new THREE.MeshPhysicalMaterial({ map: headTex(c, { size: low ? 256 : 512 }), roughness: 0.5, ...(low ? {} : { sheen: 0.5, sheenRoughness: 0.45, sheenColor: new THREE.Color('#ff9a7a') }) });
  const shoe = new THREE.MeshStandardMaterial({ color: o.feet === 'slippers' ? '#2f6fd6' : '#1c1c1e', roughness: 0.55 });
  // proportions, about seven and a half heads tall
  const LEG = 0.93 * k, THIGH = 0.45 * k, SHIN = 0.43 * k, UP = 0.29 * k, FORE = 0.26 * k, bel = o.belly || 1;
  const root = new THREE.Group(), flip = new THREE.Group(), body = new THREE.Group(), hips = new THREE.Group();
  root.add(flip); flip.add(body); body.add(hips);
  hips.position.y = LEG;
  const add = (g, geo, mat, t) => { const m = mesh(geo, mat, t); g.add(m); return m; };

  // the pelvis (in whatever they wear below) and the torso
  const torso = new THREE.Group(); hips.add(torso);
  const pelvisMat = o.pants === 'bahag' ? skin : bottom;
  add(hips, lathe([[0.001, -0.11], [0.12, -0.11], [0.16, -0.06], [0.172, 0], [0.166, 0.07], [0.15, 0.1]].map(([r, y]) => [r * k * bel * G, y * k]), segs), pelvisMat, { sx: 0.64 });
  const chest = new THREE.Group(); torso.add(chest);
  const hemY = o.hem === 'untucked' ? -0.08 : -0.01;
  const torsoPts = [[0.001, hemY], [o.hem === 'untucked' ? 0.178 : 0.167, hemY], [0.162, 0.06], [0.15, 0.16], [0.156, 0.26], [0.178, 0.36], [0.187, 0.43], [0.176, 0.48], [0.13, 0.53], [0.07, 0.56], [0.05, 0.575]];
  add(chest, lathe(torsoPts.map(([r, y]) => [r * k * G * (y < 0.3 ? bel : 1), y * k]), segs), o.shirt === 'bare' ? skin : top, { sx: 0.64 });
  if (bel > 1) add(chest, ball(0.15 * k, segs), top, { x: 0.035 * k, y: 0.13 * k, sx: 0.78, sy: 0.85, sz: 1.05 }); // Mang Tanod's belly
  if (o.shirt === 'sando') { add(chest, ball(0.06 * k, segs), skin, { x: 0.02 * k, y: 0.5 * k, sx: 0.9, sz: 1.6 }); } // the sando's neckline
  if (o.shirt === 'camisa') for (let b = 0; b < 5; b++) add(chest, ball(0.008 * k, 8), new THREE.MeshStandardMaterial({ color: '#d8cdb0', roughness: 0.4 }), { x: 0.103 * k + (b < 2 ? 0.003 : 0), y: (0.12 + b * 0.08) * k });
  if (c.id === 'lakan') { add(hips, new THREE.TorusGeometry(0.165 * k, 0.022 * k, 8, segs), accent, { y: 0.06 * k, rx: Math.PI / 2, sx: 0.66 }); for (const dz of [0.03, 0.07]) add(hips, new THREE.BoxGeometry(0.01 * k, 0.26 * k, 0.045 * k), accent, { x: 0.1 * k, y: -0.07 * k, z: dz * k, rz: 0.08 }); } // the red sash and its tails
  if (c.id === 'tanod') add(chest, lathe([[0.19, 0.08], [0.2, 0.2], [0.2, 0.32], [0.198, 0.44], [0.17, 0.5]].map(([r, y]) => [r * k * (y < 0.3 ? bel : 1), y * k]), segs), new THREE.MeshStandardMaterial({ color: col.accent, map: D.fabric.map, roughness: 0.7 }), { sx: 0.66 }); // his vest
  if (c.id === 'balut') add(chest, new THREE.TorusGeometry(0.075 * k, 0.03 * k, 8, segs, Math.PI * 1.3), new THREE.MeshStandardMaterial({ color: '#f4f1e6', map: D.knit.map, roughness: 0.95 }), { y: 0.535 * k, rx: Math.PI / 2, rz: -1.9, sx: 0.9 }); // a towel round his neck
  if (c.id === 'kapre') { const fur = new THREE.MeshStandardMaterial({ color: '#2a1e14', map: D.hair.map, normalMap: D.hair.normalMap, roughness: 0.6 }); add(chest, ball(0.09 * k, segs), fur, { x: 0.075 * k, y: 0.36 * k, sx: 0.35, sy: 1.2, sz: 1.4 }); } // chest hair
  add(torso, new THREE.CylinderGeometry(0.047 * k, 0.055 * k, 0.1 * k, segs), skin, { y: 0.56 * k });

  // the head: a skull with the face painted on, a jaw, a nose, ears and hair
  const head = new THREE.Group(); head.position.y = 0.6 * k; torso.add(head);
  const HR = 0.1 * k * (c.id === 'kapre' ? 1.08 : 1), HC = 0.105 * k;
  const FACE = { lakan: { square: 1.3, brow: 0.04 }, dalisay: { brow: 0.02, jaw: 0.85, nose: 0.8, square: 0.5 }, tanod: { full: 2.2, jaw: 1.25, square: 1.1, nose: 1.15 }, balut: { square: 0.8, nose: 0.9 }, kapre: { brow: 0.07, jaw: 1.3, nose: 1.3, square: 1.6 } };
  add(head, sculptHead(HR, FACE[c.id] || {}, low ? 28 : 44), face, { y: HC });
  for (const s of [-1, 1]) add(head, ball(0.03 * k, 12), skin, { x: -0.01 * k, y: HC + 0.004 * k, z: s * HR * 0.8, sx: 0.5, sy: 1.05, sz: 0.34 }); // ears
  const cap = (mat, o2 = {}) => add(head, capGeo(HR, o2), mat, { y: HC });
  // a band round the head, fitted to the skull's curve at its height
  const ring = (dy, tube, tilt) => { const f = Math.sqrt(Math.max(0.05, 1 - (dy / (HR * 1.12)) ** 2)), rx = HR * f * 1.06, gg = new THREE.TorusGeometry(rx, tube, 8, segs + 8); gg.rotateX(Math.PI / 2); gg.scale(1, 1, 0.82 / 1); gg.rotateZ(tilt); return gg; };
  if (c.id !== 'tanod' && c.id !== 'kapre') cap(hair, { thick: c.id === 'dalisay' ? 0.05 : 0.035, reach: c.id === 'dalisay' ? 0.6 : 0.55 });
  if (c.id === 'tanod') cap(hair, { thick: 0.02, reach: 0.58, lumpy: 0.4 });
  if (c.id === 'kapre') cap(hair, { thick: 0.09, reach: 0.62, lumpy: 2 });
  if (c.id === 'lakan' || c.id === 'dalisay') {
    add(head, ring(0.045 * k, 0.011 * k, 0.15), accent, { y: HC + 0.045 * k }); // the headband
    for (const dy of [0, -0.02]) add(head, new THREE.BoxGeometry(0.005 * k, 0.16 * k, 0.03 * k), accent, { x: -HR * 1.05, y: HC - 0.02 * k + dy * k, z: 0.01 * k, rz: -0.35 - dy * 8 }); // its knot's tails
  }
  if (c.id === 'dalisay') { add(head, new THREE.TorusGeometry(0.022 * k, 0.009 * k, 6, 12), accent, { x: -HR * 1.02, y: HC + 0.03 * k, ry: Math.PI / 2 }); add(head, lathe([[0.001, -0.3], [0.018, -0.26], [0.034, -0.15], [0.036, -0.05], [0.022, 0]].map(([r, y]) => [r * k, y * k]), 12), hair, { x: -HR * 1.12, y: HC + 0.03 * k, rz: -0.25 }); } // her ponytail
  if (c.id === 'tanod') { const cm = new THREE.MeshStandardMaterial({ color: '#23304f', map: D.fabric.map, roughness: 0.8 }); add(head, new THREE.CylinderGeometry(HR * 1.02, HR * 1.07, 0.065 * k, segs + 8), cm, { y: HC + 0.078 * k, x: -0.004 * k, sz: 0.86 }); add(head, new THREE.CylinderGeometry(HR * 0.9, HR * 0.9, 0.008 * k, segs, 1, false, -Math.PI / 2, Math.PI), cm, { x: HR * 0.55, y: HC + 0.045 * k, rz: -0.12, sz: 0.9 }); add(head, ball(0.012 * k, 8), new THREE.MeshStandardMaterial({ color: '#ffd23f', metalness: 0.8, roughness: 0.3 }), { x: HR * 1.02, y: HC + 0.08 * k, sx: 0.4 }); } // the barangay cap, its brim and badge
  if (c.id === 'balut') { const cm = new THREE.MeshStandardMaterial({ color: '#c8242f', map: D.knit.map, roughness: 0.8 }); cap(cm, { thick: 0.07, reach: 0.5, tilt: 0.5, lumpy: 0 }); add(head, new THREE.CylinderGeometry(HR * 0.85, HR * 0.85, 0.008 * k, segs, 1, false, -Math.PI / 2, Math.PI), cm, { x: -HR * 0.7, y: HC + 0.035 * k, rz: 0.12, ry: Math.PI, sz: 0.9 }); } // a cap, worn backwards
  if (c.id === 'kapre') {
    add(head, lathe([[0.001, -0.75], [0.1, -0.7], [0.19, -0.45], [0.2, -0.2], [0.16, 0], [0.1, 0.1]].map(([r, y]) => [r * k, y * k]), segs), hair, { x: -HR * 0.55, y: HC + 0.02 * k, sx: 0.55, sz: 1.05 }); // the mane down his back
    add(head, new THREE.ConeGeometry(0.075 * k, 0.28 * k, segs), hair, { x: 0.035 * k, y: HC - 0.19 * k, rz: Math.PI + 0.25, sz: 1.3 }); // the beard
  }
  let cigar = null;
  if (c.id === 'kapre') { cigar = new THREE.Group(); cigar.position.set(HR * 0.92, HC - 0.06 * k, 0.02 * k); cigar.rotation.z = -0.15; head.add(cigar); add(cigar, new THREE.CylinderGeometry(0.012 * k, 0.012 * k, 0.12 * k, 10), new THREE.MeshStandardMaterial({ color: '#6a4228', roughness: 0.8 }), { x: 0.06 * k, rz: Math.PI / 2 }); add(cigar, ball(0.013 * k, 8), new THREE.MeshStandardMaterial({ color: '#ff6a2a', emissive: '#ff4a0a', emissiveIntensity: 3 }), { x: 0.12 * k }); cigar.userData.keep = true; }

  // arms: a shoulder, a turned upper arm and forearm, a fist; sleeves over them
  const sleeveMat = o.shirt === 'bare' || o.sleeve === 'none' ? skin : top;
  const arm = (side) => {
    const sh = new THREE.Group(); sh.position.set(0, 0.46 * k, side * 0.19 * k * G); torso.add(sh);
    const R = (pts) => pts.map(([r, y]) => [r * k * G, y * k]);
    add(sh, ball(0.052 * k * G, segs), sleeveMat, { x: -0.004 * k, y: -0.012 * k, z: -side * 0.01 * k, sx: 1.05, sz: 0.9 }); // the shoulder, tucked into the torso
    add(sh, lathe(R([[0.042, -UP / k], [0.046, -UP * 0.8 / k], [0.053, -UP * 0.5 / k], [0.054, -UP * 0.28 / k], [0.05, -0.04], [0.045, 0]]), segs), skin);
    if (o.sleeve !== 'none') add(sh, lathe(R([[0.058, (o.sleeve === 'long' ? -UP : -UP * 0.55) / k], [0.064, -UP * 0.4 / k], [0.064, -0.05], [0.054, 0.01]]), segs), top);
    const el = new THREE.Group(); el.position.y = -UP; sh.add(el);
    add(el, ball(0.044 * k * G, segs), o.sleeve === 'long' ? top : skin);
    add(el, lathe(R([[0.029, -FORE / k], [0.032, -FORE * 0.85 / k], [0.043, -FORE * 0.35 / k], [0.046, -FORE * 0.15 / k], [0.042, 0]]), segs), skin);
    if (o.sleeve === 'long') { add(el, lathe(R([[0.052, -FORE * 0.45 / k], [0.056, -FORE * 0.3 / k], [0.054, 0.01]]), segs), top); add(el, new THREE.TorusGeometry(0.05 * k * G, 0.012 * k, 8, segs), top, { y: -FORE * 0.45, rx: Math.PI / 2 }); } // rolled up to the forearm
    const hand = new THREE.Group(); hand.position.y = -FORE - 0.035 * k; el.add(hand);
    const hk = k * Math.sqrt(G);
    add(hand, ball(0.047 * hk, segs), skin, { y: -0.01 * hk, sx: 1.0, sy: 1.1, sz: 0.75 }); // the fist
    add(hand, new THREE.CapsuleGeometry(0.014 * hk, 0.03 * hk, 4, 8), skin, { x: 0.03 * hk, y: 0.005 * hk, z: -side * 0.012 * hk, rz: 0.9 }); // the thumb
    add(hand, new THREE.BoxGeometry(0.06 * hk, 0.016 * hk, 0.05 * hk), skin, { x: 0.018 * hk, y: -0.045 * hk, sz: 0.95 }); // knuckles
    return { sh, el, hand };
  };
  const aL = arm(-1), aR = arm(1);
  // legs: turned thighs and shins, knees, and whatever is on their feet
  const loose = o.pants === 'loose' ? 1.25 : 1;
  const leg = (side) => {
    const hp = new THREE.Group(); hp.position.set(0, 0, side * 0.095 * k * G); hips.add(hp);
    const thighMat = o.pants === 'bahag' ? skin : bottom;
    add(hp, lathe([[0.056, -THIGH / k], [0.062, -THIGH * 0.8 / k], [0.075, -THIGH * 0.45 / k], [0.085, -0.08], [0.08, 0.02]].map(([r, y]) => [r * k * G * (thighMat === bottom ? loose * (o.pants === 'shorts' ? 1.2 : 1.06) : 1), y * k]), segs), thighMat);
    if (o.pants === 'shorts') add(hp, lathe([[0.06, -THIGH / k], [0.062, -THIGH * 0.8 / k], [0.075, -THIGH * 0.45 / k], [0.08, -THIGH * 0.3 / k]].map(([r, y]) => [r * k * G, y * k]), segs), skin);
    const kn = new THREE.Group(); kn.position.y = -THIGH; hp.add(kn);
    const shinMat = o.pants === 'shorts' || o.pants === 'bahag' ? skin : bottom, sl = shinMat === bottom ? (o.pants === 'loose' ? 1.4 : 1.08) : 1;
    add(kn, ball(0.057 * k * G * (shinMat === bottom ? sl : 1), segs), shinMat);
    add(kn, lathe([[0.036, -SHIN / k], [0.04, -SHIN * 0.85 / k], [0.056, -SHIN * 0.35 / k], [0.06, -SHIN * 0.2 / k], [0.055, 0]].map(([r, y]) => [r * k * G * sl, y * k]), segs), shinMat);
    if (o.pants === 'loose') add(kn, new THREE.TorusGeometry(0.058 * k, 0.014 * k, 8, segs), bottom, { y: -SHIN * 0.72, rx: Math.PI / 2 }); // rolled cuffs
    const ft = new THREE.Group(); ft.position.y = -SHIN; kn.add(ft);
    add(ft, ball(0.037 * k, 12), skin, { y: -0.005 * k });
    if (o.feet === 'shoes') { add(ft, ball(0.07 * k, segs), shoe, { x: 0.045 * k, y: -0.035 * k, sx: 1.75, sy: 0.62, sz: 0.72 }); add(ft, new THREE.BoxGeometry(0.26 * k, 0.018 * k, 0.1 * k), new THREE.MeshStandardMaterial({ color: '#e8e2d6', roughness: 0.8 }), { x: 0.045 * k, y: -0.072 * k }); }
    else if (o.feet === 'slippers') { add(ft, ball(0.065 * k, segs), skin, { x: 0.045 * k, y: -0.035 * k, sx: 1.7, sy: 0.5, sz: 0.7 }); add(ft, new THREE.BoxGeometry(0.26 * k, 0.016 * k, 0.1 * k), shoe, { x: 0.045 * k, y: -0.07 * k }); }
    else add(ft, ball(0.066 * k, segs), skin, { x: 0.045 * k, y: -0.035 * k, sx: 1.75, sy: 0.55, sz: 0.72 });
    return { hp, kn, ft };
  };
  const lL = leg(-1), lR = leg(1);
  if (o.pants === 'bahag') {
    // the Kapre's bahag: a wide belt of bark cloth, a front and back flap, and vines wound round him
    const bm = new THREE.MeshStandardMaterial({ color: col.bottom, map: D.fabric.map, normalMap: D.fabric.normalMap, roughness: 0.95, side: THREE.DoubleSide });
    add(hips, lathe([[0.18, -0.07], [0.185, 0], [0.178, 0.08]].map(([r, y]) => [r * k * G, y * k]), segs), bm, { sx: 0.66 });
    for (const [x, h, w] of [[0.118, 0.42, 0.26], [-0.118, 0.36, 0.3]]) { const flap = new THREE.PlaneGeometry(w * k * G, h * k, 4, 6), fp = flap.attributes.position; for (let i = 0; i < fp.count; i++) fp.setZ(i, Math.sin(fp.getY(i) * 30) * 0.004 + Math.abs(fp.getX(i)) * 0.15); flap.computeVertexNormals(); add(hips, flap, bm, { x: x * k * G, y: (-0.05 - h / 2) * k, ry: Math.PI / 2 * Math.sign(x) }); }
    const vine = new THREE.MeshStandardMaterial({ color: '#2e4a1e', map: D.hair.map, normalMap: D.hair.normalMap, roughness: 0.8 });
    const wrap = (parent, r, y, tilt, sx = 0.66) => { const g = new THREE.TorusGeometry(r, 0.012 * k, 6, segs); g.rotateX(Math.PI / 2); g.rotateZ(tilt); add(parent, g, vine, { y, sx }); };
    wrap(chest, 0.2 * k * G, 0.3 * k, 0.5); wrap(chest, 0.19 * k * G, 0.22 * k, -0.45);
    for (let l = 0; l < 10; l++) add(chest, new THREE.SphereGeometry(0.03 * k, 8, 6), new THREE.MeshStandardMaterial({ color: l % 2 ? '#3f6a28' : '#2a5020', roughness: 0.7 }), { x: Math.cos(l * 0.63) * 0.12 * k, y: (0.3 + Math.sin(l * 1.3) * 0.08) * k, z: Math.sin(l * 0.63) * 0.2 * k, sx: 1.6, sy: 0.5 }); // leaves on the vines
  }

  // props: rattan sticks, a batuta and a flashlight, a basket of balut
  const props = [];
  const stickMat = new THREE.MeshStandardMaterial({ map: D.rattan.map, normalMap: D.rattan.normalMap, roughness: 0.6 });
  const stick = (hand, len, mat, r = 0.014) => { const g = new THREE.Group(); add(g, new THREE.CylinderGeometry(r * k, r * k * 1.05, len, 12), mat, { y: -len * 0.38 }); g.rotation.z = 0.6; hand.add(g); props.push(g); return g; };
  if (c.id === 'lakan') { stick(aL.hand, 0.72, stickMat); stick(aR.hand, 0.72, stickMat); }
  if (c.id === 'tanod') {
    stick(aR.hand, 0.6, new THREE.MeshStandardMaterial({ color: '#141416', roughness: 0.45 }), 0.018);
    const fl = new THREE.Group(), metal = new THREE.MeshStandardMaterial({ color: '#c8ccd2', metalness: 0.9, roughness: 0.28 });
    add(fl, new THREE.CylinderGeometry(0.02 * k, 0.024 * k, 0.19 * k, 14), metal, { y: -0.08 * k }); add(fl, new THREE.CylinderGeometry(0.03 * k, 0.024 * k, 0.04 * k, 14), metal, { y: -0.19 * k });
    add(fl, new THREE.CylinderGeometry(0.027 * k, 0.027 * k, 0.005 * k, 14), new THREE.MeshStandardMaterial({ color: '#fff8d0', emissive: '#fff4c2', emissiveIntensity: 2 }), { y: -0.212 * k });
    aL.hand.add(fl); props.push(fl);
  }
  if (c.id === 'balut') {
    const bk = new THREE.Group(), wm = new THREE.MeshStandardMaterial({ map: D.weave.map, normalMap: D.weave.normalMap, roughness: 0.85, side: THREE.DoubleSide });
    add(bk, new THREE.CylinderGeometry(0.16 * k, 0.12 * k, 0.17 * k, 18, 1, true), wm, { y: -0.14 * k });
    add(bk, new THREE.CircleGeometry(0.12 * k, 18), wm, { y: -0.225 * k, rx: -Math.PI / 2 });
    add(bk, new THREE.TorusGeometry(0.16 * k, 0.01 * k, 6, 20), wm, { y: -0.055 * k, rx: Math.PI / 2 });
    add(bk, new THREE.TorusGeometry(0.15 * k, 0.008 * k, 6, 16, Math.PI), wm, { y: -0.06 * k });
    const egg = new THREE.MeshPhysicalMaterial({ color: '#efe2c8', roughness: 0.45, clearcoat: 0.3 });
    for (let e = 0; e < 7; e++) add(bk, ball(0.038 * k, 12), egg, { x: Math.cos(e * 0.9) * 0.08 * k, y: -0.09 * k + (e % 2) * 0.01 * k, z: Math.sin(e * 0.9) * 0.08 * k, sy: 1.3 });
    aL.hand.add(bk); props.push(bk);
  }
  mergeChildren(root);
  scene.add(root);
  return { root, flip, body, hips, torso, chest, head, aL, aR, lL, lR, props, cigar, face, LEG, k, breath: 0, pose: structuredClone(STANCE), from: structuredClone(STANCE), key: '', blend: 1, blendTime: 0.1, lastMf: -1, c };
}
