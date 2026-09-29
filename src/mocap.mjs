// Real fighters: rigged, motion-captured characters (Mixamo, converted by .scratch/tools/convert) driven
// by the fight state. Every state and move maps to a clip, and attacks are time-warped so the fist or
// foot lands exactly on the move's active frames. If the files aren't there, the game keeps its own
// procedural fighters (fighters3d.mjs).
import * as THREE from './vendor/three.module.min.js';
import { GLTFLoader, cloneSkinned } from './vendor/three-mocap.min.js';
import { rattan, weave } from './tex.mjs';

const TAU = Math.PI * 2;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const canon = (n) => n.replace(/^mixamorig\d*[:_]?/i, '');
const UPPER = /^(Spine|Spine1|Spine2|Neck|Head|HeadTop_End|Left(Shoulder|Arm|ForeArm|Hand).*|Right(Shoulder|Arm|ForeArm|Hand).*)$/;

// Which clip plays each part: the first name that matches, else a stand-in from the list after it.
const SLOTS = {
  idle: [[/fighting idle/i, /bouncing fight idle/i, /boxing idle/i, /^idle$/i], []],
  walkF: [[/^walking$/i, /walk forward/i, /^walk$/i, /fight.*walk/i], ['idle']],
  walkB: [[/walking backwards?/i, /walk back/i], []],
  crouch: [[/crouching idle/i, /crouch/i], ['idle']],
  jump: [[/^jump/i], ['idle']],
  block: [[/center block/i, /body block/i, /block/i], ['idle']],
  crouchBlock: [[/crouching block/i], ['crouch']],
  jab: [[/^jab/i, /lead jab/i], ['cross', 'punches', 'idle']],
  cross: [[/cross punch/i, /^punch$/i], ['jab', 'punches', 'idle']],
  uppercut: [[/uppercut/i], ['cross', 'jab']],
  punches: [[/^punching/i, /punch combo/i], ['jab', 'cross']],
  frontKick: [[/mma kick/i, /front kick/i], ['roundhouse', 'cross']],
  roundhouse: [[/roundhouse/i], ['frontKick', 'cross']],
  spinKick: [[/hurricane/i, /spin.*kick/i], ['roundhouse', 'frontKick']],
  flyKick: [[/flying kick/i], ['frontKick', 'roundhouse']],
  sweep: [[/sweep/i], ['frontKick', 'roundhouse']],
  meleeH: [[/melee attack horizontal/i, /melee.*horizontal/i, /sword.*slash/i], ['cross', 'jab']],
  meleeD: [[/melee attack downward/i, /melee.*down/i], ['meleeH', 'cross']],
  toss: [[/^throw/i], ['cross', 'jab']],
  hitHead: [[/head hit/i], ['hitBody', 'idle']],
  hitBody: [[/stomach hit/i, /hit reaction/i, /body hit/i], ['hitHead', 'idle']],
  fall: [[/falling back death/i, /knocked down/i, /flying back death/i], ['ko']],
  getUp: [[/getting up/i, /stand up/i], ['idle']],
  ko: [[/knocked out/i, /death/i], ['fall']],
  win: [[/victory/i, /cheer/i], ['taunt', 'idle']],
  taunt: [[/taunt/i], ['win', 'idle']],
};
// The roster's move animations, as clips: `over` plays the strike on the upper body only, above a
// base (a crouch or a jump); `eff` is what lands the blow; `whole` spreads a combo over the move.
const MOVES = {
  jab: { slot: 'jab' }, stickJab: { slot: 'jab' }, straight: { slot: 'cross' }, stickSwing: { slot: 'meleeH' }, basketSwing: { slot: 'meleeH' },
  lowJab: { slot: 'jab', over: 'crouch' }, sweep: { slot: 'sweep', eff: 'foot' },
  airJab: { slot: 'jab', over: 'jump' }, airKick: { slot: 'flyKick', eff: 'foot' },
  throw: { slot: 'toss' }, grab: { slot: 'toss' },
  flurry: { slot: 'punches', whole: true }, flurryKick: { slot: 'spinKick', eff: 'foot', whole: true },
  rising: { slot: 'uppercut' }, risingKick: { slot: 'frontKick', eff: 'foot' },
  toss: { slot: 'toss' }, lob: { slot: 'toss' },
  lowKickHigh: { slot: 'frontKick', eff: 'foot' }, roundhouse: { slot: 'roundhouse', eff: 'foot' }, flyKick: { slot: 'flyKick', eff: 'foot' }, spinKick: { slot: 'spinKick', eff: 'foot' },
  shine: { slot: 'jab', hold: true }, whistle: { slot: 'taunt' }, overhead: { slot: 'meleeD' }, spinUp: { slot: 'spinKick', eff: 'foot' },
  slide: { slot: 'sweep', eff: 'foot' }, hammer: { slot: 'meleeD' }, smoke: { slot: 'taunt' }, stomp: { slot: 'meleeD' },
};

// Where Falling Back Death is knocked off its feet, and where it hits the floor (fractions).
const FALL = { hit: 0.2, floor: 0.44 };

// How tall each real fighter stands (m): the Kapre towers.
const HEIGHT = { lakan: 1.74, dalisay: 1.64, tanod: 1.78, balut: 1.7, kapre: 2.45 };

export async function loadMocap(base = 'assets/fighters/', onProgress = null) {
  const res = await fetch(base + 'clips.json');
  if (!res.ok) throw new Error('no mocap');
  const meta = await res.json();
  const loader = new GLTFLoader(), templates = {};
  // each file's bytes so far, for a loading bar
  const got = {}, tot = {}, report = () => { if (!onProgress) return; const t = Object.values(tot).reduce((a, b) => a + b, 0); if (t) onProgress(Object.values(got).reduce((a, b) => a + b, 0) / t); };
  await Promise.all(Object.keys(meta.chars).map(async (id) => { templates[id] = (await loader.loadAsync(base + id + '.glb', (e) => { got[id] = e.loaded; if (e.total) tot[id] = e.total; report(); })).scene; }));
  // resolve each slot to a clip name
  const names = Object.keys(meta.clips), slots = {};
  for (const [slot, [pats]] of Object.entries(SLOTS)) { const n = pats.map((p) => names.find((x) => p.test(x))).find(Boolean); if (n) slots[slot] = n; }
  const resolve = (slot, seen = new Set()) => { if (slots[slot]) return slots[slot]; seen.add(slot); for (const alt of SLOTS[slot][1]) if (!seen.has(alt)) { const r = resolve(alt, seen); if (r) return r; } return slots.idle || names[0]; };
  for (const slot of Object.keys(SLOTS)) slots[slot] = resolve(slot);
  return { meta, templates, slots };
}
export const hasMocap = (lib, id) => !!(lib && lib.templates[id]);

// Build one character's clips, bound to its own bones; hip movement scaled to its own hip height.
function bindClips(lib, bones, hipRest) {
  const out = {}, upper = {}, lower = {};
  for (const [name, c] of Object.entries(lib.meta.clips)) {
    const tracks = [], up = [], low = [];
    for (const [bone, kind, times, values] of c.tr) {
      const b = bones[bone];
      if (!b) continue;
      let t;
      if (kind === 'q') t = new THREE.QuaternionKeyframeTrack(`${b.name}.quaternion`, times, values);
      else { const k = hipRest / c.hip; t = new THREE.VectorKeyframeTrack(`${b.name}.position`, times, values.map((v) => v * k)); }
      tracks.push(t);
      (UPPER.test(bone) ? up : low).push(t);
    }
    out[name] = new THREE.AnimationClip(name, c.d, tracks);
    upper[name] = new THREE.AnimationClip(name + ':upper', c.d, up);
    lower[name] = new THREE.AnimationClip(name + ':lower', c.d, low);
  }
  return { out, upper, lower };
}

export function mocapFighter(lib, c, scene) {
  const meta = lib.meta.chars[c.id], model = cloneSkinned(lib.templates[c.id]);
  const root = new THREE.Group(), turn = new THREE.Group();
  root.add(turn); turn.add(model);
  model.scale.multiplyScalar((HEIGHT[c.id] || 1.76 * c.build) / meta.height);
  const bones = {};
  model.traverse((o) => { if (o.isBone) bones[canon(o.name)] = o; if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; } });
  const hipRest = bones.Hips.position.y;
  const { out, upper, lower } = bindClips(lib, bones, hipRest);
  const mixer = new THREE.AnimationMixer(model), actions = new Map();
  // part: 'full', or the 'lower' and 'upper' halves used when a strike plays over a crouch or a jump
  const action = (name, part = 'full') => {
    const key = part + ':' + name;
    if (!actions.has(key)) { const a = mixer.clipAction(part === 'upper' ? upper[name] : part === 'lower' ? lower[name] : out[name]); a.play(); a.paused = true; a.setEffectiveWeight(0); a.enabled = true; a.userData = { part }; actions.set(key, a); }
    return actions.get(key);
  };
  // props in their hands. A Mixamo hand bone runs along the fingers (+Y), with X across the fist (the
  // right hand's +X is its thumb side, the left hand's -X) and +Z toward the palm. A mount undoes the
  // bone's scale, so props are placed in metres.
  const props = [];
  const ws = new THREE.Vector3();
  const mount = (bone, obj) => { bone.updateWorldMatrix(true, false); bone.getWorldScale(ws); const g = new THREE.Group(); g.scale.setScalar(1 / ws.x); g.add(obj); bone.add(g); props.push(g); return g; };
  const rt = rattan(), stickM = new THREE.MeshStandardMaterial({ map: rt.map, normalMap: rt.normalMap, roughness: 0.6 });
  // a stick through the fist, most of it out past the thumb
  const stick = (len, mat, thumb, r = 0.014) => { const g = new THREE.Group(), m = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.05, len, 12), mat); m.castShadow = true; m.rotation.z = -Math.PI / 2; m.position.x = thumb * len * 0.32; g.add(m); g.position.set(0, 0.075, 0.025); g.rotation.y = thumb * 0.15; return g; };
  if (c.id === 'lakan') { mount(bones.RightHand, stick(0.72, stickM, 1)); mount(bones.LeftHand, stick(0.72, stickM, -1)); }
  if (c.id === 'tanod') mount(bones.RightHand, stick(0.6, new THREE.MeshStandardMaterial({ color: '#141416', roughness: 0.45 }), 1, 0.018));
  if (c.id === 'balut') {
    // the basket hangs from its handle in his fist
    const w = weave(), bk = new THREE.Group(), wm = new THREE.MeshStandardMaterial({ map: w.map, normalMap: w.normalMap, roughness: 0.85, side: THREE.DoubleSide });
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.12, 0.17, 18, 1, true), wm); b.position.y = -0.2; bk.add(b);
    const bottom = new THREE.Mesh(new THREE.CircleGeometry(0.12, 18), wm); bottom.rotation.x = -Math.PI / 2; bottom.position.y = -0.285; bk.add(bottom);
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.008, 6, 16, Math.PI), wm); handle.position.y = -0.115; bk.add(handle);
    const egg = new THREE.MeshPhysicalMaterial({ color: '#efe2c8', roughness: 0.45 }); for (let e = 0; e < 7; e++) { const sEgg = new THREE.Mesh(new THREE.SphereGeometry(0.038, 12, 9), egg); sEgg.position.set(Math.cos(e * 0.9) * 0.08, -0.15, Math.sin(e * 0.9) * 0.08); sEgg.scale.y = 1.3; bk.add(sEgg); }
    bk.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    bk.position.set(0, 0.07, 0.03);
    mount(bones.LeftHand, bk).userData.hang = true;
  }
  scene.add(root);
  return { mocap: true, root, turn, model, mixer, bones, action, layers: [], props, c, yaw: null, kick: { lean: 0, lv: 0, head: 0, hv: 0 }, stateKey: '', stateT: 0, loopT: 0 };
}

// A shove to the spine and head from a hit, sprung back over the next few frames.
export function mocapImpulse(m, { lean = 0, head = 0 }) { m.kick.lv += lean; m.kick.hv += head; }

const lerpAngle = (a, b, k) => a + ((((b - a + Math.PI) % TAU) + TAU) % TAU - Math.PI) * k;

// This frame's clips (with their times) for a fighter.
function plan(m, f, g, lib, sub) {
  const S = lib.slots, clip = (slot) => lib.meta.clips[S[slot]], D = (slot) => clip(slot).d;
  const loop = (slot, speed = 1) => ({ slot, t: (m.loopT * speed) % D(slot) });
  const at = (slot, frac) => ({ slot, t: clamp(frac, 0, 1) * D(slot) });
  const st = m.stateT; // seconds in this state
  if (f.state === 'move' && f.move) {
    const mv = f.move, spec = MOVES[mv.anim] || MOVES.jab, cl = clip(spec.slot), d = cl.d;
    const mf = clamp(f.mf + sub, 0, mv.startup + mv.active + mv.recovery);
    let hit = (spec.eff === 'foot' ? cl.hit.foot : cl.hit.hand) || d * 0.4;
    if (hit < 0.05 || hit > d * 0.9) hit = d * 0.4;
    let t;
    if (spec.whole) t = clamp(hit * 0.4 + (d - hit * 0.4) * (mf / (mv.startup + mv.active + mv.recovery)), 0, d);
    else {
      const t0 = Math.max(0, hit - 0.45), t1 = Math.min(d, hit + 0.12), t2 = Math.min(d, t1 + 0.55);
      if (mf <= mv.startup) t = t0 + (hit - t0) * (mf / Math.max(1, mv.startup));
      else if (mf <= mv.startup + mv.active || spec.hold) t = hit + (t1 - hit) * clamp((mf - mv.startup) / mv.active, 0, 1);
      else t = t1 + (t2 - t1) * ((mf - mv.startup - mv.active) / Math.max(1, mv.recovery));
    }
    const strike = { slot: spec.slot, t };
    if (spec.over === 'crouch') return { base: loop('crouch'), upper: strike };
    if (spec.over === 'jump' || (mv.air && f.y > 0.05 && spec.slot !== 'flyKick')) return { base: at('jump', 0.5), upper: strike };
    return { base: strike };
  }
  const JUMP = { up: 0.35, down: 0.72 };
  // knocked into the air: the fall follows the flight, thrown back going up and flat on the way down,
  // so it lands on its back however long the flight (or the knockout's slow motion) lasts
  const fly = () => ({ base: at('fall', FALL.hit + (FALL.floor - FALL.hit) * clamp(0.5 - f.vy / 0.2, 0, 1)) });
  switch (f.state) {
    case 'crouch': return { base: loop('crouch') };
    case 'block': return { base: f.crouch ? at('crouchBlock', 0.4) : at('block', 0.35) };
    case 'prejump': return { base: at('jump', JUMP.up * clamp(st / 0.05, 0.6, 1)) };
    case 'air': { const p = clamp(0.5 - f.vy / 0.27, 0, 1); return { base: at('jump', JUMP.up + (JUMP.down - JUMP.up) * p) }; }
    case 'land': return { base: at('jump', JUMP.down + clamp(st / 0.05, 0, 1) * 0.15) };
    case 'hit': return { base: at(f.crouch ? 'hitBody' : 'hitHead', clamp(st * 1.6 / D(f.crouch ? 'hitBody' : 'hitHead'), 0, 0.75)) };
    case 'hitAir': return fly();
    case 'thrown': return { base: at('fall', clamp(st * 1.3 / D('fall'), 0, 0.6)) };
    case 'down': return st < 0.25 ? { base: at('fall', FALL.floor + st * 0.8) } : { base: at('getUp', 0.2 + (st - 0.25) * 0.6) };
    case 'rise': return { base: at('getUp', 0.47 + clamp(st / 0.27, 0, 1) * 0.53) };
    case 'ko': if (f.y > 0 || f.vy > 0) { m.landed = st; return fly(); } return { base: at('fall', Math.min(1, FALL.floor + (st - (m.landed || 0)) * 0.3)) };
    case 'win': return { base: at('win', Math.min(1, st / D('win'))) };
    default: {
      if (g.phase === 'intro' && g.phaseT > 30) return { base: at('taunt', Math.min(1, st / D('taunt'))) };
      if (Math.abs(f.vx) > 0.005) { const fwd = Math.sign(f.vx) === f.face; return { base: loop(fwd || S.walkB === S.idle ? 'walkF' : 'walkB', 1.35 * f.c.speed * (fwd ? 1 : 0.9)) }; }
      return { base: loop('idle') };
    }
  }
}

// Pose a mocap fighter for this frame: crossfade to what the state wants, place and turn it, shove it.
export function driveMocap(m, f, g, lib, dt, sub, reduced) {
  const key = f.state === 'move' ? `m${f.mid}` : `${f.state}${f.crouch ? 'c' : ''}`;
  if (key !== m.stateKey) { m.stateKey = key; m.stateT = 0; m.landed = 0; } else if (g.freeze <= 0) m.stateT += dt;
  if (g.freeze <= 0) m.loopT += dt;
  const want = plan(m, f, g, lib, g.freeze > 0 ? 0 : sub);
  // a knockout falls rather than floats: the clip carries the drop, the flight only a little hop
  if (f.state === 'ko' && (f.y > 0 || f.vy > 0)) m.root.position.y *= 0.3;
  // layers: a full-body clip and maybe an upper-body one on top; each fades in, the old ones out
  const wanted = want.upper
    ? [[m.action(lib.slots[want.base.slot], 'lower'), want.base.t], [m.action(lib.slots[want.upper.slot], 'upper'), want.upper.t]]
    : [[m.action(lib.slots[want.base.slot]), want.base.t]];
  const fade = f.state === 'move' || f.state === 'hit' || f.state === 'block' ? 0.07 : 0.14;
  for (const [a, t] of wanted) { let l = m.layers.find((x) => x.a === a); if (!l) { l = { a, w: m.layers.length ? 0 : 1 }; m.layers.push(l); } l.t = t; l.on = true; }
  for (const l of m.layers) {
    if (!wanted.some(([a]) => a === l.a)) l.on = false;
    l.w = clamp(l.w + (l.on ? 1 : -1) * dt / fade, 0, 1);
  }
  m.layers = m.layers.filter((l) => l.on || l.w > 0);
  // weights must cover every bone exactly once, or the rest blends toward the bind pose
  const sum = (part) => m.layers.reduce((a, l) => a + (l.a.userData.part === part ? l.w : 0), 0);
  const F = sum('full'), Lo = sum('lower'), U = sum('upper'), s = F + Lo > 0 ? 1 / (F + Lo) : 1, su = U > 0 ? Math.max(0, 1 - F * s) / U : 0;
  for (const l of m.layers) { const w = l.a.userData.part === 'upper' ? l.w * su : l.w * s; l.a.time = l.t; l.a.setEffectiveWeight(w); }
  m.mixer.update(0);
  // face the other fighter, turning round quickly rather than snapping
  const yaw = f.face > 0 ? Math.PI / 2 - 0.3 : -(Math.PI / 2 - 0.3);
  m.yaw = m.yaw === null ? yaw : lerpAngle(m.yaw, yaw, Math.min(1, dt * 14));
  m.turn.rotation.y = m.yaw;
  // hits: the spine bends back and the head snaps, then springs home
  const K = m.kick, w = 18, z = 0.5;
  K.lv += (-w * w * K.lean - 2 * z * w * K.lv) * dt; K.lean += K.lv * dt;
  K.hv += (-w * w * K.head - 2 * z * w * K.hv) * dt; K.head += K.hv * dt;
  if (!reduced && (Math.abs(K.lean) > 1e-4 || Math.abs(K.head) > 1e-4)) {
    m.model.updateMatrixWorld(true);
    const bend = (bone, ang) => { if (!bone) return; const pq = new THREE.Quaternion(); bone.parent.getWorldQuaternion(pq); const wq = new THREE.Quaternion(); bone.getWorldQuaternion(wq); const r = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), ang * f.face); bone.quaternion.copy(pq.invert().multiply(r.multiply(wq))); };
    bend(m.bones.Spine1, K.lean * 0.6); bend(m.bones.Spine2, K.lean * 0.4); bend(m.bones.Head, K.head);
  }
  // a basket hangs from the fist whatever the wrist does, and swings when the hand moves
  for (const pr of m.props) {
    if (!pr.userData.hang) continue;
    m.model.updateMatrixWorld(true);
    const wp = pr.getWorldPosition(new THREE.Vector3()), u = pr.userData;
    const vx = u.px === undefined ? 0 : (wp.x - u.px) / Math.max(dt, 1e-3), ax = u.pv === undefined ? 0 : (vx - u.pv) / Math.max(dt, 1e-3);
    u.px = wp.x; u.pv = vx; u.th = u.th || 0; u.om = u.om || 0;
    u.om += (-40 * u.th - 4 * u.om - clamp(ax, -40, 40) * 5) * dt; u.th = clamp(u.th + u.om * dt, -0.9, 0.9);
    const pq = new THREE.Quaternion(); pr.parent.getWorldQuaternion(pq);
    const want = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, u.th, 'YXZ'));
    pr.quaternion.copy(pq.invert().multiply(want));
  }
}
