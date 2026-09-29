// The 3D side of Bakbakan sa Kanto, in three.js: a 2.5D camera on four Filipino streets, and fighters
// built from blocks on a jointed rig, posed frame by frame from the fight state. It reads the match
// (fight.mjs) and its events and never changes them. No model or image files: canvas textures only.
import * as THREE from './vendor/three.module.min.js';
import { hurtbox, hitbox, pbox, PHYS } from './fight.mjs';
import { STAGES } from './roster.mjs';

const TAU = Math.PI * 2;
const lerp = (a, b, k) => a + (b - a) * k;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const ease = (t) => t * t * (3 - 2 * t);
let rs = 1;
const rnd = () => { rs = (rs * 16807) % 2147483647; return rs / 2147483647; };
const pick = (a) => a[Math.floor(rnd() * a.length)];
const shade = (hex, k) => { const n = parseInt(hex.slice(1), 16), f = (v) => clamp(Math.round(v * k), 0, 255); return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`; };
const R = (x, c, X, Y, W = 1, H = 1) => { x.fillStyle = c; x.fillRect(Math.round(X), Math.round(Y), Math.round(W), Math.round(H)); };

function canvasTex(w, h, draw, { repeat = null, pixel = true } = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d'); x.imageSmoothingEnabled = false;
  draw(x, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  if (pixel) { t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestMipmapLinearFilter; }
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); }
  return t;
}
const MATS = new Map();
const flat = (color, o = {}) => { const key = color + JSON.stringify(o); if (!MATS.has(key)) MATS.set(key, new THREE.MeshStandardMaterial({ color, roughness: 0.85, flatShading: true, ...o })); return MATS.get(key); };
function mesh(geo, material, { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, cast = true, receive = false } = {}) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z); m.rotation.set(rx, ry, rz);
  m.castShadow = cast; m.receiveShadow = receive;
  return m;
}
const box = (w, h, d, m, o) => mesh(new THREE.BoxGeometry(w, h, d), m, o);
function signTex(lines, bg, fg, w = 120, h = 32) {
  return canvasTex(w, h, (x) => {
    R(x, bg, 0, 0, w, h); R(x, shade(bg, 0.7), 0, h - 2, w, 2);
    x.fillStyle = fg; x.textAlign = 'center'; x.textBaseline = 'middle';
    lines.forEach(([text, size, weight = 800], k) => { x.font = `${weight} ${size}px "Baloo 2", system-ui, sans-serif`; x.fillText(text, w / 2, h * (lines.length === 1 ? 0.54 : 0.32 + k * 0.42), w - 6); });
  });
}
// Merge every static mesh that shares a material into one, so a stage costs a few dozen draws.
// Anything under an object marked userData.dynamic keeps moving on its own and is left alone.
function mergeStatic(root) {
  root.updateMatrixWorld(true);
  const buckets = new Map();
  const walk = (o) => {
    if (o.userData.dynamic) return;
    if (o.isMesh && !Array.isArray(o.material)) {
      const key = `${o.material.uuid}:${o.castShadow}:${o.receiveShadow}`;
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(o);
    }
    for (const c of o.children) walk(c);
  };
  walk(root);
  for (const list of buckets.values()) {
    if (list.length < 2) continue;
    const parts = list.map((m) => (m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone()).applyMatrix4(m.matrixWorld));
    const n = parts.reduce((a, gg) => a + gg.attributes.position.count, 0);
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2);
    let at = 0;
    for (const gg of parts) {
      pos.set(gg.attributes.position.array, at * 3); nor.set(gg.attributes.normal.array, at * 3);
      if (gg.attributes.uv) uv.set(gg.attributes.uv.array, at * 2);
      at += gg.attributes.position.count; gg.dispose();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    const merged = new THREE.Mesh(geo, list[0].material);
    merged.castShadow = list[0].castShadow; merged.receiveShadow = list[0].receiveShadow;
    for (const m of list) m.parent.remove(m);
    root.add(merged);
  }
}
const signMesh = (tex, w, h, o) => mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 }), { cast: false, ...o });

// ---------- poses ----------
// A pose: hip drop (hy) and shift (hx), lean forward, torso twist (negative brings the lead shoulder
// forward), head nod; each arm [shoulder swing forward, elbow bend, raise outward]; each leg [hip swing
// forward, knee bend]; and the whole body's tilt back, spin and lift. The lead side is the far side.
const P = (o) => ({ hy: -0.06, hx: 0, lean: 0.1, twist: -0.35, head: 0, aL: [0.9, 1.9, 0.1], aR: [0.5, 2.3, 0.15], lL: [0.35, 0.25], lR: [-0.35, 0.3], tilt: 0, spin: 0, lift: 0, ...o });
const STANCE = P({});
const CROUCH = P({ hy: -0.42, lean: 0.3, aL: [1.1, 1.8, 0.1], aR: [0.75, 2.1, 0.15], lL: [1.35, 2.1], lR: [0.55, 2.3] });
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
  down: P({ hy: -0.02, lean: -0.1, head: 0.2, twist: 0, aL: [2.8, 0.2, 0.4], aR: [2.6, 0.4, 0.5], lL: [0.2, 0.3], lR: [0.4, 0.8], tilt: 1.52, lift: 0.14 }),
  ko: P({ hy: -0.02, lean: -0.1, head: 0.5, twist: 0, aL: [3.0, 0.1, 0.7], aR: [3.0, 0.1, 0.8], lL: [0.1, 0.1], lR: [0.3, 0.3], tilt: 1.55, lift: 0.14 }),
  thrown: P({ lean: -0.6, head: -0.5, aL: [1.8, 0.6, 0.6], aR: [2.2, 0.6, 0.6], lL: [0.9, 0.9], lR: [0.3, 0.6], tilt: 0.5, lift: 0.45 }),
  win: P({ hy: -0.02, lean: -0.1, twist: -0.1, head: -0.2, aL: [0.2, 0.4, 0.2], aR: [3.0, 0.2, 0.25] }),
  intro: P({ lean: 0, twist: -0.2, aL: [0.2, 0.4, 0.15], aR: [1.3, 0.3, 0.2] }),
};
// Moves: the wind-up, the hit, and (by default) back to the stance. `wave` makes a multi-hit move
// alternate arms or legs while it's active; `spin` turns the whole body through the move.
const M = (windup, active, extra = {}) => ({ windup: P(windup), active: P(active), ...extra });
const JAB = M({ aL: [1.1, 1.9, 0.1] }, { lean: 0.18, twist: -0.6, aL: [1.57, 0.05, 0.05] });
const STRAIGHT = M({ twist: 0, aR: [0.6, 2.1, 0.15] }, { lean: 0.28, twist: -0.9, aR: [1.6, 0.05, 0.05], lR: [-0.5, 0.15] });
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

// ---------- the fighters ----------
function faceTex(c) {
  return canvasTex(24, 24, (x) => {
    const eye = c.id === 'kapre' ? '#ff9f43' : '#1b1320';
    // the far eye sits near the edge: the face is seen from the side, three-quarters
    for (const X of [6, 15]) { R(x, c.id === 'kapre' ? '#2a1a0a' : '#ffffff', X, 9, 4, 4); R(x, eye, X + 1, 10, 2, 3); }
    R(x, shade(c.colors.hair, 1), 5, 6 - (c.id === 'kapre' ? 1 : 0), 6, 2); R(x, shade(c.colors.hair, 1), 14, 6, 6, 2); // brows, set hard
    R(x, '#6a2a2a', 10, 17, 6, 1); if (c.id !== 'tanod') R(x, '#6a2a2a', 9, 16);
    if (c.id === 'tanod') { R(x, '#1b1320', 8, 15, 10, 2); } // a mustache
    if (c.id === 'kapre') { for (let k = 0; k < 18; k++) R(x, '#1a1a12', 4 + (k % 9) * 2, 18 + Math.floor(k / 9) * 2, 2, 3); } // the beard
  });
}
function fighterModel(c, scene) {
  const k = c.build, col = c.colors;
  const skin = flat(col.skin), top = flat(col.top), bottom = flat(col.bottom), accent = flat(col.accent), hair = flat(col.hair);
  const LEG = 0.9 * k, THIGH = 0.45 * k, SHIN = 0.42 * k, UP = 0.3 * k, FORE = 0.28 * k;
  const root = new THREE.Group(), flip = new THREE.Group(), body = new THREE.Group(), hips = new THREE.Group();
  root.add(flip); flip.add(body); body.add(hips);
  hips.position.y = LEG;
  const armsBare = c.id === 'balut' || c.id === 'kapre', shorts = c.id === 'balut' || c.id === 'kapre';
  // the torso, from the hips up
  const torso = new THREE.Group(); hips.add(torso);
  const belly = c.id === 'tanod' ? 1.18 : 1;
  torso.add(box(0.26 * k * belly, 0.36 * k, 0.38 * k, top, { y: 0.34 * k }));
  torso.add(box(0.24 * k * belly, 0.2 * k, 0.34 * k, c.id === 'kapre' ? bottom : top, { y: 0.1 * k }));
  torso.add(box(0.27 * k * belly, 0.06 * k, 0.36 * k, c.id === 'lakan' ? accent : flat(shade(col.bottom, 0.8)), { y: 0.02 * k })); // the belt, or Lakan's red sash
  if (c.id === 'tanod') { torso.add(box(0.28 * k * belly, 0.05 * k, 0.39 * k, accent, { y: 0.44 * k })); torso.add(box(0.28 * k * belly, 0.05 * k, 0.39 * k, accent, { y: 0.3 * k })); } // reflector stripes
  if (c.id === 'balut') torso.add(box(0.1 * k, 0.05 * k, 0.4 * k, flat('#f4f1e6'), { y: 0.5 * k, rx: 0.3 })); // a towel over the shoulder
  if (c.id === 'lakan') torso.add(box(0.265 * k, 0.3 * k, 0.06 * k, flat('#e8e0c8'), { y: 0.35 * k })); // the camisa's front
  const neck = box(0.1 * k, 0.08 * k, 0.1 * k, skin, { y: 0.54 * k }); torso.add(neck);
  const head = new THREE.Group(); head.position.y = 0.58 * k; torso.add(head);
  const HS = c.id === 'kapre' ? 0.3 * k : 0.25 * k;
  head.add(box(HS * 0.9, HS, HS * 0.85, skin, { y: HS / 2 }));
  const face = mesh(new THREE.PlaneGeometry(HS * 0.85, HS * 0.85), new THREE.MeshStandardMaterial({ map: faceTex(c), transparent: true, alphaTest: 0.4, roughness: 0.8 }), { x: HS * 0.451, y: HS / 2, ry: Math.PI / 2, cast: false });
  head.add(face);
  head.add(box(HS * 0.95, HS * 0.28, HS * 0.9, hair, { y: HS * 0.93, x: -0.01 })); // hair on top
  head.add(box(HS * 0.3, HS * 0.75, HS * 0.9, hair, { x: -HS * 0.34, y: HS * 0.6 })); // and at the back
  if (c.id === 'lakan' || c.id === 'dalisay') head.add(box(HS * 0.96, HS * 0.12, HS * 0.9, accent, { y: HS * 0.74 })); // a headband
  if (c.id === 'dalisay') head.add(box(HS * 0.5, HS * 0.2, HS * 0.2, hair, { x: -HS * 0.62, y: HS * 0.7, rz: -0.6 })); // her ponytail
  if (c.id === 'tanod') { head.add(box(HS * 1.0, HS * 0.25, HS * 0.95, flat('#2f3f6a'), { y: HS * 1.02 })); head.add(box(HS * 0.4, HS * 0.05, HS * 0.8, flat('#2f3f6a'), { x: HS * 0.62, y: HS * 0.9 })); } // his cap
  if (c.id === 'balut') head.add(box(HS * 1.0, HS * 0.1, HS * 0.95, flat('#e8384f'), { y: HS * 1.02 }));
  if (c.id === 'kapre') { head.add(box(HS * 0.4, HS * 1.3, HS * 1.0, hair, { x: -HS * 0.3, y: HS * 0.2 })); head.add(box(HS * 0.35, HS * 0.45, HS * 0.6, hair, { x: HS * 0.35, y: -HS * 0.05 })); } // long hair and a beard
  let cigar = null;
  if (c.id === 'kapre') { cigar = box(HS * 0.5, HS * 0.1, HS * 0.1, flat('#7a4a2a'), { x: HS * 0.62, y: HS * 0.3 }); head.add(cigar); cigar.add(box(0.03, 0.03, 0.03, flat('#ff6a2a', { emissive: '#ff4a0a', emissiveIntensity: 2 }), { x: HS * 0.26 })); }
  // arms
  const arm = (side) => {
    const sh = new THREE.Group(); sh.position.set(0, 0.48 * k, side * 0.23 * k * belly); torso.add(sh);
    sh.add(box(0.11 * k, UP, 0.11 * k, armsBare ? skin : top, { y: -UP / 2 }));
    if (!armsBare) sh.add(box(0.13 * k, 0.1 * k, 0.13 * k, top, { y: -0.03 * k }));
    const el = new THREE.Group(); el.position.y = -UP; sh.add(el);
    el.add(box(0.095 * k, FORE, 0.095 * k, c.id === 'lakan' || c.id === 'tanod' ? top : skin, { y: -FORE / 2 }));
    const hand = new THREE.Group(); hand.position.y = -FORE - 0.04 * k; el.add(hand);
    hand.add(box(0.1 * k, 0.1 * k, 0.1 * k, skin));
    return { sh, el, hand };
  };
  const aL = arm(-1), aR = arm(1);
  // legs
  const leg = (side) => {
    const hp = new THREE.Group(); hp.position.set(0, 0, side * 0.1 * k); hips.add(hp);
    hp.add(box(0.15 * k, THIGH, 0.15 * k, bottom, { y: -THIGH / 2 }));
    const kn = new THREE.Group(); kn.position.y = -THIGH; hp.add(kn);
    kn.add(box(0.125 * k, SHIN, 0.125 * k, shorts ? skin : bottom, { y: -SHIN / 2 }));
    const ft = new THREE.Group(); ft.position.y = -SHIN; kn.add(ft);
    ft.add(box(0.25 * k, 0.07 * k, 0.12 * k, c.id === 'lakan' || c.id === 'kapre' ? skin : c.id === 'balut' ? flat('#2f6fd6') : flat('#2a2a2a'), { x: 0.05 * k, y: -0.03 * k }));
    return { hp, kn, ft };
  };
  const lL = leg(-1), lR = leg(1);
  // props: sticks, a batuta and a flashlight, a basket of balut
  const props = [];
  // held at one end, carrying on past the fist in line with the forearm
  const stick = (hand, len, color) => { const g = new THREE.Group(); g.add(box(0.035 * k, len, 0.035 * k, flat(color), { y: -len * 0.38 })); g.rotation.z = 0.6; hand.add(g); props.push(g); return g; };
  if (c.id === 'lakan') { stick(aL.hand, 0.7, '#c89a4a'); stick(aR.hand, 0.7, '#c89a4a'); }
  if (c.id === 'tanod') { stick(aR.hand, 0.6, '#1b1b1b'); const fl = new THREE.Group(); fl.add(mesh(new THREE.CylinderGeometry(0.035, 0.045, 0.2, 8), flat('#d8d8d8', { metalness: 0.6, roughness: 0.3 }), { y: -0.08 })); fl.add(mesh(new THREE.CylinderGeometry(0.048, 0.048, 0.02, 8), flat('#fff4c2', { emissive: '#fff4c2', emissiveIntensity: 1.5 }), { y: -0.19 })); aL.hand.add(fl); props.push(fl); }
  if (c.id === 'balut') { const bk = new THREE.Group(); bk.add(mesh(new THREE.CylinderGeometry(0.16, 0.12, 0.16, 10, 1, true), flat('#b8864a', { side: THREE.DoubleSide }), { y: -0.12 })); for (let e = 0; e < 5; e++) bk.add(mesh(new THREE.SphereGeometry(0.045, 6, 5), flat('#f2e6d0'), { x: Math.cos(e * 1.3) * 0.07, y: -0.06, z: Math.sin(e * 1.3) * 0.07 })); bk.add(mesh(new THREE.TorusGeometry(0.12, 0.012, 4, 12, Math.PI), flat('#8a5a2b'), { y: 0.0 })); aL.hand.add(bk); props.push(bk); }
  root.traverse((o) => { if (o.isMesh) { o.castShadow = !o.material.transparent; } });
  scene.add(root);
  return { root, flip, body, hips, torso, head, aL, aR, lL, lR, props, cigar, LEG, k, pose: structuredClone(STANCE), from: structuredClone(STANCE), key: '', blend: 1, blendTime: 0.1, lastMf: -1, c };
}

function applyPose(m, p) {
  const k = m.k;
  m.hips.position.set(p.hx * k, m.LEG + p.hy * k, 0);
  m.torso.rotation.set(0, p.twist, -p.lean);
  m.head.rotation.set(0, -p.twist * 0.8, -p.head);
  for (const [a, s, side] of [[m.aL, p.aL, -1], [m.aR, p.aR, 1]]) { a.sh.rotation.set(-side * s[2], 0, s[0]); a.el.rotation.set(0, 0, s[1]); }
  for (const [l, s] of [[m.lL, p.lL], [m.lR, p.lR]]) { l.hp.rotation.set(0, 0, s[0]); l.kn.rotation.set(0, 0, -s[1]); l.ft.rotation.set(0, 0, s[1] - s[0]); }
  m.body.rotation.set(0, p.spin, p.tilt);
  // lying down pivots at the feet: slide the body back under where the fighter really is
  m.body.position.set((p.tilt / 1.55) * 0.8 * k, p.lift * k, 0);
}
function mix(a, b, t) {
  const o = {};
  for (const key of Object.keys(a)) o[key] = Array.isArray(a[key]) ? a[key].map((v, i) => lerp(v, b[key][i], t)) : lerp(a[key], b[key], t);
  return o;
}

// The pose a fighter should be in this frame, from the fight state alone.
function targetPose(f, g, t, sub = 0) {
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
      if (A.wave === 'legs') { const w = Math.sin(into * (m.hits || 3) * Math.PI); p.lL = [p.lL[0] + w * 0.5, p.lL[1], 0]; p.lR = [p.lR[0] - w * 0.5, p.lR[1] + Math.max(0, w)]; }
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
      } else { const b = Math.sin(t * 3 + f.side) * 0.015; p.hy = -0.06 + b; p.aL = [0.9, 1.9 + b * 3, 0.1]; }
      return p;
    }
  }
}

// ---------- the stages ----------
function buildStage(id, scene) {
  const group = new THREE.Group(); scene.add(group);
  const add = (...o) => group.add(...o);
  const st = STAGES.find((s) => s.id === id) || STAGES[0];
  rs = id.length * 7919;
  const ground = (base, draw) => {
    const tex = canvasTex(256, 64, (x, w, h) => { R(x, base, 0, 0, w, h); for (let k = 0; k < w * h * 0.2; k++) R(x, shade(base, 0.93 + rnd() * 0.12), rnd() * w, rnd() * h); if (draw) draw(x, w, h); });
    add(mesh(new THREE.PlaneGeometry(32, 8), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 }), { rx: -Math.PI / 2, z: -1, cast: false, receive: true }));
    add(mesh(new THREE.PlaneGeometry(200, 100), flat(shade(base, 0.9)), { rx: -Math.PI / 2, y: -0.02, z: -40, cast: false, receive: true }));
  };
  const wallRow = (z, colors, hMin = 3, hMax = 8) => {
    let x = -22;
    while (x < 22) {
      const w = 3 + Math.floor(rnd() * 4), h = hMin + rnd() * (hMax - hMin), c = pick(colors);
      const tex = canvasTex(Math.round(w * 12), Math.round(h * 12), (t, W, H) => {
        R(t, c, 0, 0, W, H);
        for (let k = 0; k < W * H * 0.1; k++) R(t, shade(c, 0.94 + rnd() * 0.1), rnd() * W, rnd() * H);
        for (let r = 0; r < Math.floor(H / 22); r++) for (let q = 0; q < Math.floor(W / 16); q++) { const wx = 4 + q * 16, wy = 6 + r * 22; R(t, '#f2eee4', wx - 1, wy - 1, 11, 11); R(t, rnd() < 0.3 ? '#ffe9a0' : '#34404c', wx, wy, 9, 9); for (let b = wx + 1; b < wx + 9; b += 2) R(t, '#1e1e1e', b, wy, 1, 9); }
        for (let k = 0; k < W; k++) R(t, 'rgba(60,50,40,0.15)', k, H - 2 - Math.floor(rnd() * 3), 1, 4);
      });
      add(box(w, h, 2, flat(c), { x: x + w / 2, y: h / 2, z: z - 1, receive: true }));
      add(mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 }), { x: x + w / 2, y: h / 2, z: z + 0.01, cast: false, receive: true }));
      x += w;
    }
  };
  const bunting = (z, y, colors = ['#e8384f', '#ffd23f', '#2f6fd6', '#3fae5a', '#ffffff']) => {
    const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-0.15, 0, 0), new THREE.Vector3(0.15, 0, 0), new THREE.Vector3(0, -0.34, 0)]); geo.computeVertexNormals();
    for (let k = 0; k < 44; k++) { const x = -11 + k * 0.5, sag = Math.sin(((k % 22) / 22) * Math.PI) * 0.5; add(mesh(geo, flat(colors[k % colors.length], { side: THREE.DoubleSide }), { x, y: y - sag, z, cast: false })); }
  };
  const light = { hemi: ['#e4f1ff', '#bfae94', 1.8], sun: ['#fff1dc', 2.4, [-4, 9, 6]], fog: ['#dce9f2', 18, 60], sky: st.sky, exposure: 1, fill: ['#ffffff', 0] };
  const glows = [];
  if (id === 'terminal') {
    Object.assign(light, { hemi: ['#ffe2c0', '#b8906a', 1.7], sun: ['#ffc890', 2.6, [-6, 5, 5]], fog: ['#f4c79a', 16, 55] });
    ground('#6a6a6e', (x, w, h) => { for (let k = 0; k < w; k += 24) R(x, '#e8c84a', k, 40, 12, 2); R(x, '#d8d8d8', 0, 10, w, 1); for (let k = 0; k < 40; k++) R(x, 'rgba(30,30,30,0.3)', rnd() * w, rnd() * h, 3, 2); });
    wallRow(-9, ['#f4a58c', '#ffe07a', '#9fdcb8', '#8fc8f0', '#f6f1e6'], 4, 10);
    // the terminal shed: posts and a long corrugated roof
    for (let x = -10; x <= 10; x += 4) add(box(0.18, 4.2, 0.18, flat('#8a8274'), { x, y: 2.1, z: -3.4 }));
    const sheet = canvasTex(32, 32, (x, w, h) => { for (let k = 0; k < w; k++) R(x, k % 2 ? '#d6d8dc' : '#9ea2aa', k, 0, 1, h); for (let k = 0; k < 20; k++) R(x, 'rgba(170,80,40,0.5)', rnd() * w, rnd() * h, 3, 2); }, { repeat: [10, 1] });
    add(box(22, 0.08, 3.4, new THREE.MeshStandardMaterial({ map: sheet, metalness: 0.3, roughness: 0.6 }), { y: 4.3, z: -4.6, rx: 0.12 }));
    add(signMesh(signTex([['CUBAO · QUIAPO · DIVISORIA', 14]], '#2e7d4a', '#ffffff', 200, 22), 5, 0.55, { y: 3.3, z: -3.3 }));
    // jeepneys waiting in line
    const jtex = (c) => canvasTex(96, 24, (x, w, h) => { R(x, c, 0, 0, w, h); ['#e8384f', '#2f6fd6', '#ffd23f'].forEach((cc, k) => R(x, cc, 0, 14 + k * 3, w, 2)); for (let k = 0; k < 7; k++) R(x, '#23242c', 6 + k * 12, 3, 9, 8); });
    for (const [x, c] of [[-6.5, '#e8e8ea'], [0.5, '#f4f1e6'], [7.5, '#ffe9a0']]) {
      const j = new THREE.Group();
      j.add(box(4.6, 1.5, 1.9, new THREE.MeshStandardMaterial({ map: jtex(c), roughness: 0.5, metalness: 0.3 }), { y: 1.25 }));
      j.add(box(1.3, 0.9, 1.8, flat('#c9ccd4', { metalness: 0.6, roughness: 0.3 }), { x: 2.9, y: 0.95 }));
      j.add(box(4.8, 0.12, 2.1, flat('#e8384f'), { y: 2.05 }));
      for (const [wx, wz] of [[1.7, 0.95], [1.7, -0.95], [-1.5, 0.95], [-1.5, -0.95]]) j.add(mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.3, 12), flat('#1b1b1b'), { x: wx, y: 0.42, z: wz, rx: Math.PI / 2 }));
      j.position.set(x, 0, -5.6);
      add(j);
    }
    add(signMesh(signTex([['BAWAL MANIGARILYO', 12]], '#f4f1e6', '#c0182e', 100, 20), 1.4, 0.28, { x: -8, y: 2.6, z: -3.3 }));
    bunting(-2.2, 4.6);
  } else if (id === 'court') {
    Object.assign(light, { hemi: ['#8fa0d0', '#3a3040', 1.1], sun: ['#fff4e0', 2.4, [0, 12, 4]], fog: ['#1a1f3a', 14, 45], exposure: 1.05, fill: ['#fff4e0', 6] });
    ground('#b8864a', (x, w, h) => { for (let k = 0; k < w; k += 8) R(x, shade('#b8864a', 0.9), k, 0, 1, h); R(x, '#f4f1e6', 0, 22, w, 1); R(x, '#f4f1e6', 127, 0, 1, h); for (let a = 0; a < TAU; a += 0.05) R(x, '#f4f1e6', 128 + Math.cos(a) * 20, 38 + Math.sin(a) * 10); });
    // bleachers with the barangay watching, a tarp, and the floodlights
    for (let r = 0; r < 4; r++) add(box(22, 0.4, 0.8, flat(r % 2 ? '#8a8a8a' : '#a0a0a0'), { y: 0.2 + r * 0.45, z: -4.2 - r * 0.8, receive: true }));
    // the barangay watching: sixty people in two instanced meshes, bodies and heads
    const crowdC = ['#e8384f', '#ffd23f', '#2f6fd6', '#3fae5a', '#f4f1e6', '#ff8ae2', '#ff9f43'], skinC = ['#c98a5a', '#b87a4a', '#d9a06b'];
    const N = 60, bodies = new THREE.InstancedMesh(new THREE.BoxGeometry(0.36, 0.5, 0.3), flat('#ffffff'), N), heads = new THREE.InstancedMesh(new THREE.BoxGeometry(0.22, 0.24, 0.22), flat('#ffffff'), N);
    const seats = [];
    for (let n = 0; n < N; n++) {
      const r = n % 4;
      seats.push({ x: -10 + ((n * 37) % 200) / 10 + (rnd() - 0.5) * 0.4, y: 0.4 + r * 0.45, z: -4.2 - r * 0.8, phase: rnd() * TAU });
      bodies.setColorAt(n, new THREE.Color(pick(crowdC))); heads.setColorAt(n, new THREE.Color(pick(skinC)));
    }
    bodies.castShadow = heads.castShadow = true; bodies.userData.dynamic = heads.userData.dynamic = true;
    add(bodies, heads);
    glows.push({ crowd: { bodies, heads, seats } });
    add(signMesh(signTex([['LIGA NG BARANGAY MALINIS', 13], ['ang basketbol ay para sa lahat · 2026', 8, 700]], '#2f5fae', '#ffffff', 200, 36), 7, 1.26, { y: 5.4, z: -7.6 }));
    add(box(24, 0.3, 0.3, flat('#3a3a3a'), { y: 7.2, z: -2 }));
    for (const x of [-8, 8]) { add(mesh(new THREE.CylinderGeometry(0.1, 0.1, 3.6, 8), flat('#3a4a5a'), { x, y: 1.8, z: -2.6 })); add(box(0.08, 1.0, 1.4, flat('#f4f1e6'), { x: x - Math.sign(x) * 0.1, y: 3.5, z: -2.6 })); add(mesh(new THREE.TorusGeometry(0.23, 0.025, 6, 16), flat('#ff6b3d'), { x: x - Math.sign(x) * 0.45, y: 3.1, z: -2.6, rx: Math.PI / 2 })); }
    for (let x = -9; x <= 9; x += 6) { const b = mesh(new THREE.BoxGeometry(0.8, 0.2, 0.5), flat('#fff4c2', { emissive: '#fff4c2', emissiveIntensity: 2 }), { x, y: 7.0, z: -2, cast: false }); add(b); }
    wallRow(-9.5, ['#3a4a6a', '#4a3a5a', '#2a3a4a'], 5, 9);
  } else if (id === 'palengke') {
    Object.assign(light, { hemi: ['#e8f4ff', '#a8b0a0', 2.0], sun: ['#fffaf0', 2.3, [3, 10, 6]], fog: ['#e8f0f4', 16, 55] });
    ground('#8a8a84', (x, w, h) => { for (let k = 0; k < 30; k++) R(x, 'rgba(60,80,90,0.25)', rnd() * w, rnd() * h, 8 + rnd() * 10, 3); for (let k = 0; k < 40; k++) R(x, pick(['#3fae5a', '#e8384f', '#ffd23f']), rnd() * w, rnd() * h, 2, 1); });
    wallRow(-10, ['#f6f1e6', '#ffe07a', '#f4a58c', '#c8b8f0'], 4, 8);
    // stalls: tables of fruit and fish under striped awnings, crates, a hanging scale
    const fruit = ['#ffd23f', '#ff9f43', '#e8384f', '#3fae5a', '#8a3a8a', '#f2e6d0'];
    for (let s = 0; s < 6; s++) {
      const x = -10 + s * 4, c = pick(['#e8384f', '#2f6fd6', '#3fae5a', '#ff9f43']);
      const stripes = canvasTex(16, 8, (t, W, H) => { for (let k = 0; k < W; k += 4) { R(t, c, k, 0, 2, H); R(t, '#f6f1e6', k + 2, 0, 2, H); } });
      add(box(3.4, 0.05, 1.8, new THREE.MeshStandardMaterial({ map: stripes, roughness: 0.8 }), { x, y: 2.5, z: -3.6, rx: 0.25 }));
      for (const px of [-1.6, 1.6]) add(box(0.08, 2.5, 0.08, flat('#6b4a2a'), { x: x + px, y: 1.25, z: -2.9 }));
      add(box(3.0, 0.8, 1.2, flat('#8a5a2b'), { x, y: 0.4, z: -3.6, receive: true }));
      for (let n = 0; n < 26; n++) add(mesh(new THREE.IcosahedronGeometry(0.08 + rnd() * 0.05, 0), flat(pick(fruit)), { x: x - 1.3 + rnd() * 2.6, y: 0.85 + rnd() * 0.1, z: -3.6 + (rnd() - 0.5) * 1 }));
      add(signMesh(signTex([[pick(['₱50/KILO', 'SARIWA!', 'BAGSAK-PRESYO', 'SUKI, DITO!']), 12]], '#f4f1e6', '#c0182e', 72, 20), 1.1, 0.3, { x, y: 1.2, z: -2.95 }));
    }
    for (let k = 0; k < 6; k++) add(box(0.6, 0.4, 0.4, flat('#b8864a'), { x: -9 + k * 3.5 + rnd(), y: 0.2 + (k % 2) * 0.4, z: -2.4 }));
    bunting(-2.6, 3.3, ['#ffffff', '#2f6fd6', '#e8384f', '#ffd23f']);
  } else {
    // the balete: moonlight, mist, roots and fireflies, and the tree the Kapre calls home
    Object.assign(light, { hemi: ['#8ab0e0', '#34502e', 1.5], sun: ['#c8dcff', 2.6, [4, 10, 5]], fog: ['#1e3438', 12, 38], exposure: 1.35, fill: ['#b8ff9a', 14] });
    ground('#3a3424', (x, w, h) => { for (let k = 0; k < 200; k++) R(x, pick(['#2a4a1a', '#4a3a1a', '#5a4a2a']), rnd() * w, rnd() * h, 2, 1); });
    const bark = flat('#4a3a2a'), bark2 = flat('#3a2e22');
    add(mesh(new THREE.CylinderGeometry(1.8, 2.6, 12, 9), bark, { y: 6, z: -7 }));
    for (let k = 0; k < 16; k++) { const a = (k / 16) * Math.PI + Math.PI, r = 2 + rnd() * 3.5; add(mesh(new THREE.CylinderGeometry(0.08 + rnd() * 0.1, 0.2 + rnd() * 0.15, 6 + rnd() * 4, 5), k % 2 ? bark : bark2, { x: Math.cos(a) * r * 1.4, y: 3, z: -7 + Math.sin(a) * r * 0.6, rz: (rnd() - 0.5) * 0.3, rx: (rnd() - 0.5) * 0.2 })); } // aerial roots
    for (let k = 0; k < 10; k++) add(mesh(new THREE.IcosahedronGeometry(2.4 + rnd() * 1.6, 0), flat(pick(['#1f3a1f', '#2a4a24', '#183018'])), { x: (rnd() - 0.5) * 18, y: 11 + rnd() * 3, z: -8 + (rnd() - 0.5) * 4 }));
    for (let k = 0; k < 14; k++) add(mesh(new THREE.IcosahedronGeometry(1 + rnd() * 1.5, 0), flat(pick(['#1f3a1f', '#2a4a24'])), { x: -14 + k * 2.2, y: 0.6, z: -9 - rnd() * 3 }));
    add(mesh(new THREE.SphereGeometry(1.4, 16, 12), new THREE.MeshBasicMaterial({ color: '#f4f0d0', fog: false }), { x: 9, y: 13, z: -30, cast: false })); // the moon
    for (let k = 0; k < 40; k++) { const fl = mesh(new THREE.SphereGeometry(0.03, 4, 3), new THREE.MeshBasicMaterial({ color: '#d8ff7a' }), { x: (rnd() - 0.5) * 16, y: 0.4 + rnd() * 3, z: -1 - rnd() * 5, cast: false }); fl.userData.phase = rnd() * TAU; fl.userData.dynamic = true; glows.push({ fly: fl }); add(fl); }
    add(signMesh(signTex([['TABI-TABI PO', 12]], '#6a5a3a', '#f4f1e6', 72, 20), 1.1, 0.3, { x: -5, y: 1.1, z: -2.5, rz: 0.08 }));
    add(box(0.08, 1.0, 0.08, flat('#6b4a2a'), { x: -5, y: 0.5, z: -2.55 }));
  }
  mergeStatic(group);
  return { group, light, glows };
}

export function createView(canvas, { low = false } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !low, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, low ? 1.25 : 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog('#dce9f2', 18, 60);
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 200);
  scene.add(camera);
  const hemi = new THREE.HemisphereLight('#e4f1ff', '#bfae94', 1.8);
  const sun = new THREE.DirectionalLight('#fff1dc', 2.4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(low ? 1024 : 2048, low ? 1024 : 2048);
  Object.assign(sun.shadow.camera, { left: -9, right: 9, top: 9, bottom: -9, near: 1, far: 40 });
  sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.02;
  const fill = new THREE.PointLight('#ffffff', 0, 12, 1.4);
  scene.add(hemi, sun, sun.target, fill);
  const skyU = { top: { value: new THREE.Color() }, low: { value: new THREE.Color() } };
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(150, 24, 12), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false, uniforms: skyU,
    vertexShader: 'varying vec3 v; void main(){ v = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform vec3 top; uniform vec3 low; varying vec3 v; void main(){ gl_FragColor = vec4(mix(low, top, smoothstep(-0.05, 0.5, v.y)), 1.0); }',
  })));

  let stage = null, stageId = null;
  function setStage(id) {
    if (id === stageId) return;
    if (stage) { scene.remove(stage.group); stage.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material && !Array.isArray(o.material) && o.material.map) o.material.map.dispose(); }); }
    stage = buildStage(id, scene); stageId = id;
    const L = stage.light;
    hemi.color.set(L.hemi[0]); hemi.groundColor.set(L.hemi[1]); hemi.intensity = L.hemi[2];
    sun.color.set(L.sun[0]); sun.intensity = L.sun[1]; sun.position.set(...L.sun[2]);
    scene.fog.color.set(L.fog[0]); scene.fog.near = L.fog[1]; scene.fog.far = L.fog[2];
    skyU.top.value.set(L.sky[0]); skyU.low.value.set(L.sky[1]);
    renderer.toneMappingExposure = L.exposure;
    fill.color.set(L.fill[0]); fill.intensity = L.fill[1];
  }

  // ---------- fighters, projectiles and effects ----------
  let models = [null, null];
  function ensureModels(g) {
    for (let i = 0; i < 2; i++) {
      if (models[i] && models[i].c.id === g.f[i].id) continue;
      if (models[i]) scene.remove(models[i].root);
      models[i] = fighterModel(g.f[i].c, scene);
    }
  }
  const projMeshes = new Map();
  function projMesh(p) {
    const gr = new THREE.Group();
    if (p.kind === 'baston') gr.add(box(0.7, 0.04, 0.04, flat('#c89a4a')));
    else if (p.kind === 'silaw') { gr.add(mesh(new THREE.ConeGeometry(0.34, 0.9, 12, 1, true), new THREE.MeshBasicMaterial({ color: '#fff4a0', transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false }), { rz: Math.PI / 2, cast: false })); gr.add(mesh(new THREE.SphereGeometry(0.16, 10, 8), new THREE.MeshBasicMaterial({ color: '#ffffff' }), { x: -0.4, cast: false })); }
    else if (p.kind === 'balut') { const e = mesh(new THREE.SphereGeometry(0.1, 10, 8), flat('#f2e6d0')); e.scale.set(1, 1.3, 1); gr.add(e); }
    else if (p.kind === 'ulan') { for (let k = 0; k < 9; k++) { const e = mesh(new THREE.SphereGeometry(0.09, 8, 6), flat('#f2e6d0'), { x: (rnd() - 0.5) * 0.6, y: 0.3 + rnd() * 1.4, z: (rnd() - 0.5) * 0.3 }); e.scale.set(1, 1.3, 1); gr.add(e); } }
    else if (p.kind === 'usok') { for (let k = 0; k < 7; k++) gr.add(mesh(new THREE.IcosahedronGeometry(0.25 + rnd() * 0.2, 1), new THREE.MeshStandardMaterial({ color: '#b8b8b0', transparent: true, opacity: 0.7, roughness: 1, depthWrite: false }), { x: (rnd() - 0.5) * 0.6, y: 0.6 + rnd() * 1.0, z: (rnd() - 0.5) * 0.4, cast: false })); }
    scene.add(gr);
    return gr;
  }
  const dummy = new THREE.Object3D();
  // sparks: stars that pop and fade
  const starTex = canvasTex(16, 16, (x) => { const pts = [[8, 0], [10, 6], [16, 8], [10, 10], [8, 16], [6, 10], [0, 8], [6, 6]]; x.fillStyle = '#ffffff'; x.beginPath(); pts.forEach(([a, b], i) => (i ? x.lineTo(a, b) : x.moveTo(a, b))); x.fill(); });
  const sparks = [];
  function spark(x, y, color, size, life = 0.22, z = 0.3) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: starTex, color, transparent: true, depthWrite: false, depthTest: false }));
    s.position.set(x, y, z); s.renderOrder = 5; s.material.rotation = rnd() * TAU; scene.add(s);
    sparks.push({ s, t: 0, life, size });
  }
  const MAXP = 300, pGeo = new THREE.BufferGeometry(), pPos = new Float32Array(MAXP * 3), pCol = new Float32Array(MAXP * 3);
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3)); pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3));
  const points = new THREE.Points(pGeo, new THREE.PointsMaterial({ size: 0.07, vertexColors: true, transparent: true, depthWrite: false }));
  points.frustumCulled = false; scene.add(points);
  const parts = [];
  const emit = (x, y, z, color, n, speed = 2, up = 2, life = 0.5, grav = 8) => { for (let k = 0; k < n && parts.length < MAXP; k++) { const a = Math.random() * TAU; parts.push({ x, y, z, vx: Math.cos(a) * speed * Math.random(), vy: up * (Math.random() - 0.2), vz: Math.sin(a) * speed * 0.3 * Math.random(), life, max: life, c: new THREE.Color(color), g: grav }); } };
  // the super: a dark screen and a burst behind whoever called it
  const dim = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0, depthTest: false, depthWrite: false }));
  dim.position.z = -0.5; dim.renderOrder = 4; camera.add(dim);
  const burst = mesh(new THREE.RingGeometry(0.2, 2.4, 24, 1), new THREE.MeshBasicMaterial({ color: '#ffd23f', transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }), { z: -0.4, cast: false });
  burst.renderOrder = 4; scene.add(burst);
  // boxes, for training
  const boxLines = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ vertexColors: true, depthTest: false }));
  boxLines.renderOrder = 9; boxLines.frustumCulled = false; scene.add(boxLines);

  const cam = { x: 0, y: 1.5, z: 7, shake: 0, flash: 0, flashSide: 0, slow: 0 };
  function resize() {
    const r = canvas.getBoundingClientRect();
    renderer.setSize(Math.max(1, r.width), Math.max(1, r.height), false);
    camera.aspect = Math.max(0.3, r.width / Math.max(1, r.height));
    camera.updateProjectionMatrix();
  }

  function event(e, g) {
    switch (e.type) {
      case 'hit': {
        const big = e.super ? 0.9 : e.heavy ? 0.7 : 0.45;
        spark(e.x, e.y, e.counter ? '#ff5c5c' : e.super ? '#ffd23f' : '#fff4c2', big);
        spark(e.x, e.y, '#ffffff', big * 0.5, 0.12);
        emit(e.x, e.y, 0.2, e.heavy ? '#ff9f43' : '#ffd23f', e.heavy ? 18 : 10, 3.5, 3, 0.35);
        cam.shake = Math.max(cam.shake, e.super ? 0.12 : e.heavy ? 0.08 : 0.03);
        break;
      }
      case 'block': spark(e.x, e.y, '#8fd0ff', e.heavy ? 0.5 : 0.35, 0.16); emit(e.x, e.y, 0.2, '#cfe8ff', 8, 2.5, 2, 0.25); break;
      case 'throw': cam.shake = 0.1; emit(e.x, 0.1, 0.2, '#d8c8a8', 14, 2, 1.5, 0.5); break;
      case 'tech': spark(e.x, 1.2, '#ffffff', 0.6, 0.2); break;
      case 'clash': spark(e.x, e.y + 1, '#ffffff', 0.7, 0.25); emit(e.x, e.y + 1, 0.2, '#ffd23f', 14, 3, 2, 0.4); break;
      case 'down': emit(e.x, 0.05, 0.2, stageId === 'balete' ? '#5a4a2a' : '#d8d0c0', 16, 2.2, 1.2, 0.5); cam.shake = Math.max(cam.shake, 0.05); break;
      case 'land': { const f = g.f[e.side]; emit(f.x, 0.05, 0.2, '#d8d0c0', 6, 1.2, 0.6, 0.35); break; }
      case 'splat': emit(e.x, 0.05, 0.2, '#f2e6d0', 12, 1.8, 1.8, 0.45); break;
      case 'pop': emit(e.x, e.y, 0.2, '#ffffff', 8, 2, 2, 0.3); break;
      case 'super': cam.flash = 1; cam.flashSide = e.side; break;
      case 'ko': cam.shake = 0.15; cam.slow = 1; break;
      default: break;
    }
  }

  function frame(g, dt, o = {}) {
    const t = performance.now() / 1000;
    ensureModels(g);
    if (!stage) setStage(g.stage);
    // fighters
    for (let i = 0; i < 2; i++) {
      const f = g.f[i], m = models[i];
      // between the last tick and this one, unless something jumped (a new round, a throw)
      const pv = o.prev && o.prev.f[i], a = o.alpha ?? 1;
      const near = pv && Math.abs(pv.x - f.x) < 0.8 && Math.abs(pv.y - f.y) < 0.8;
      let x = near ? lerp(pv.x, f.x, a) : f.x, y = near ? lerp(pv.y, f.y, a) : f.y;
      if (f.state === 'thrown') { const a = g.f[1 - i]; const held = a.move ? clamp((a.mf - a.grabAt) / 8, 0, 1) : 0; x = lerp(f.x, a.x - a.face * 0.1, held * 0.3); y = held * 0.6; }
      // the one taking the hit shakes during hit-freeze
      if (g.freeze > 0 && (f.state === 'hit' || f.state === 'block' || f.state === 'hitAir') && !o.reduced) x += Math.sin(t * 90) * 0.025;
      m.root.position.set(x, y, 0);
      m.flip.scale.x = f.face; m.flip.rotation.y = -0.32 * f.face;
      // a new state or a new move crossfades from wherever the body was: quick for attacks and hits,
      // softer for falling, getting up and the rest
      const key = f.state === 'move' ? `m${f.mid}` : `${f.state}${f.crouch ? 'c' : ''}`;
      const restarted = f.state === 'move' && f.mf < m.lastMf;
      if (key !== m.key || restarted) {
        m.from = m.pose; m.key = key; m.blend = 0;
        m.blendTime = f.state === 'move' || f.state === 'hit' || f.state === 'block' ? 0.05 : ['hitAir', 'down', 'ko', 'rise', 'thrown'].includes(f.state) ? 0.12 : 0.09;
      }
      m.lastMf = f.state === 'move' ? f.mf : -1;
      // the body is drawn where it was a fraction of a tick ago, and so are the limbs
      const target = targetPose(f, g, t, g.freeze > 0 ? 0 : a - 1);
      m.blend = Math.min(1, m.blend + dt / m.blendTime);
      const soft = !['move', 'hit', 'block', 'thrown'].includes(f.state); // walking and idling ease into each other
      m.pose = m.blend < 1 ? mix(m.from, target, ease(m.blend)) : soft ? mix(m.pose, target, Math.min(1, dt * 18)) : target;
      applyPose(m, m.pose);
      // Lakan's thrown stick leaves his hand while it's in the air
      if (m.c.id === 'lakan') m.props[1].visible = !g.projs.some((p) => p.side === i && p.kind === 'baston');
      if (m.cigar && Math.random() < dt * 3) { const wp = new THREE.Vector3(); m.cigar.getWorldPosition(wp); emit(wp.x, wp.y + 0.05, wp.z, '#c8c8c0', 1, 0.2, 0.6, 1.2, -0.3); }
    }
    // projectiles
    const alive = new Set(g.projs);
    for (const [p, gr] of projMeshes) if (!alive.has(p)) { scene.remove(gr); projMeshes.delete(p); }
    for (const p of g.projs) {
      let gr = projMeshes.get(p);
      if (!gr) { gr = projMesh(p); projMeshes.set(p, gr); }
      const pp = o.prev && o.prev.p.get(p), a = pp ? o.alpha ?? 1 : 1;
      const px = pp ? lerp(pp.x, p.x, a) : p.x, py = pp ? lerp(pp.y, p.y, a) : p.y;
      gr.position.set(px, p.def.arc ? py : p.kind === 'baston' ? 0.95 : p.kind === 'silaw' ? 0.95 : 0, 0.05);
      gr.scale.x = Math.sign(p.vx) || 1;
      if (p.kind === 'baston') gr.rotation.z = -p.t * 0.5 * Math.sign(p.vx);
      if (p.kind === 'balut') gr.rotation.z = p.t * 0.2;
      if (p.kind === 'usok') gr.children.forEach((c, k) => { c.position.y += Math.sin(t * 2 + k) * 0.002; c.scale.setScalar(1 + p.t * 0.004); });
      if (p.kind === 'ulan') gr.children.forEach((c, k) => { c.position.y = 0.3 + ((k * 0.37 + p.t * 0.05) % 1.5); });
    }
    // sparks and bits
    for (let k = sparks.length - 1; k >= 0; k--) {
      const s = sparks[k]; s.t += dt;
      const f = s.t / s.life;
      if (f >= 1) { scene.remove(s.s); s.s.material.dispose(); sparks.splice(k, 1); continue; }
      s.s.scale.setScalar(s.size * (0.4 + ease(Math.min(1, f * 2)) * 0.8)); s.s.material.opacity = 1 - f * f;
    }
    let n = 0;
    for (let k = parts.length - 1; k >= 0; k--) { const p = parts[k]; p.life -= dt; if (p.life <= 0) { parts.splice(k, 1); continue; } p.vy -= p.g * dt; p.x += p.vx * dt; p.y = Math.max(0.02, p.y + p.vy * dt); p.z += p.vz * dt; }
    for (const p of parts) { pPos[n * 3] = p.x; pPos[n * 3 + 1] = p.y; pPos[n * 3 + 2] = p.z; const a = clamp((p.life / p.max) * 1.5, 0, 1); pCol[n * 3] = p.c.r * a; pCol[n * 3 + 1] = p.c.g * a; pCol[n * 3 + 2] = p.c.b * a; n++; }
    pGeo.setDrawRange(0, n); pGeo.attributes.position.needsUpdate = true; pGeo.attributes.color.needsUpdate = true;
    // the stage breathes: the crowd bobs, fireflies drift
    for (const gl of stage.glows) {
      if (gl.crowd) {
        // bobbing in their seats, and on their feet for a knockout
        const { bodies, heads, seats } = gl.crowd, cheer = g.phase === 'ko' ? 1 : 0;
        seats.forEach((st, n) => {
          const y = st.y + Math.abs(Math.sin(t * (4 + cheer * 6) + st.phase)) * (0.03 + cheer * 0.12);
          dummy.position.set(st.x, y + 0.25, st.z); dummy.updateMatrix(); bodies.setMatrixAt(n, dummy.matrix);
          dummy.position.set(st.x, y + 0.62, st.z); dummy.updateMatrix(); heads.setMatrixAt(n, dummy.matrix);
        });
        bodies.instanceMatrix.needsUpdate = true; heads.instanceMatrix.needsUpdate = true;
      }
      if (gl.fly) { gl.fly.position.x += Math.sin(t * 0.7 + gl.fly.userData.phase) * 0.004; gl.fly.position.y += Math.cos(t * 0.9 + gl.fly.userData.phase) * 0.003; gl.fly.material.color.setScalar(0.5 + 0.5 * Math.sin(t * 3 + gl.fly.userData.phase)); }
    }
    // training: the boxes
    if (o.boxes) {
      const v = [], c = [];
      const put = (b, col) => { if (!b) return; const [x0, x1, y0, y1] = b; const pts = [[x0, y0], [x1, y0], [x1, y0], [x1, y1], [x1, y1], [x0, y1], [x0, y1], [x0, y0]]; for (const [px, py] of pts) { v.push(px, py, 0.5); c.push(...col); } };
      for (const f of g.f) { put(hurtbox(f), [0.3, 0.6, 1]); put(hitbox(f), [1, 0.2, 0.2]); }
      for (const p of g.projs) put(pbox(p), [1, 0.6, 0.1]);
      boxLines.geometry.setAttribute('position', new THREE.Float32BufferAttribute(v, 3)); boxLines.geometry.setAttribute('color', new THREE.Float32BufferAttribute(c, 3));
      boxLines.visible = true;
    } else boxLines.visible = false;

    // the camera: between the fighters, pulling back as they part; closer on a super or a KO
    const [a, b] = g.f, mid = (a.x + b.x) / 2, gap = Math.abs(a.x - b.x);
    const portrait = camera.aspect < 1;
    const tall = Math.max(a.c.build, b.c.build) - 1; // make room for the Kapre
    let tx = clamp(mid, -PHYS.wall + 2, PHYS.wall - 2), ty = 1.0 + tall * 0.7 + Math.max(a.y, b.y) * 0.35, tz = (portrait ? 8.6 : 4.4) + gap * (portrait ? 0.9 : 0.42) + tall * 1.6;
    if (o.showcase) { tx = 0; ty = 1.0 + tall * 0.7; tz = (portrait ? 7.4 : 5.2) + tall * 1.6; }
    if (cam.flash > 0) { const f = g.f[cam.flashSide]; tx = lerp(tx, f.x, 0.6); ty = 1.2; tz = 4.4; }
    if (g.phase === 'ko' && cam.slow > 0) { const l = g.f.find((f) => f.state === 'ko') || a; tx = lerp(tx, l.x, 0.4); tz *= 0.85; }
    const k = Math.min(1, dt * (cam.flash > 0 ? 10 : 4));
    cam.x = lerp(cam.x, tx, k); cam.y = lerp(cam.y, ty, k); cam.z = lerp(cam.z, tz, k);
    const shake = o.reduced ? 0 : cam.shake;
    camera.position.set(cam.x + (Math.random() - 0.5) * shake, cam.y + 0.45 + (Math.random() - 0.5) * shake, cam.z);
    camera.lookAt(cam.x, cam.y - 0.05, 0);
    cam.shake = Math.max(0, cam.shake - dt * 0.6);
    // the super flash
    cam.flash = g.freeze > 0 && cam.flash > 0 ? cam.flash : Math.max(0, cam.flash - dt * 3);
    dim.material.opacity = cam.flash * 0.55;
    burst.material.opacity = cam.flash * 0.8;
    if (cam.flash > 0) { const f = g.f[cam.flashSide]; burst.position.set(f.x, 1.1, -0.4); burst.rotation.z = t * 3; burst.scale.setScalar(0.8 + (1 - cam.flash) * 0.6); }
    if (g.phase !== 'ko') cam.slow = 0;
    fill.position.set(cam.x, 2.6, 2.2);
    sun.target.position.set(cam.x, 0, 0);
    sun.position.set(cam.x + stage.light.sun[2][0], stage.light.sun[2][1], stage.light.sun[2][2]);
    renderer.render(scene, camera);
  }
  resize();
  return { frame, event, resize, setStage, renderer, get stage() { return stageId; }, cam };
}
