// The 3D side of Bakbakan sa Kanto, in three.js: a 2.5D camera on four Filipino streets, realistic
// fighters posed frame by frame from the fight state, filmic light with sky reflections, and the
// hits, projectiles and supers. It reads the match (fight.mjs) and never changes it.
import * as THREE from './vendor/three.module.min.js';
import { hurtbox, hitbox, pbox, PHYS } from './fight.mjs';
import { fighterModel, applyPose, animate, impulse, targetPose, mix, STANCE } from './fighters3d.mjs';
import { buildStage } from './stages3d.mjs';
import { mocapFighter, driveMocap, mocapImpulse, hasMocap } from './mocap.mjs';
import { buildCrowd } from './crowd.mjs';
import { createPost } from './post.mjs';
import { dress } from './envpack.mjs';
import { canvas, toTex, rattan } from './tex.mjs';

const TAU = Math.PI * 2;
const lerp = (a, b, k) => a + (b - a) * k;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const ease = (t) => t * t * (3 - 2 * t);
const glowTex = (stops) => { const cv = canvas(128, 128), x = cv.getContext('2d'), g = x.createRadialGradient(64, 64, 0, 64, 64, 64); for (const [o, c] of stops) g.addColorStop(o, c); x.fillStyle = g; x.fillRect(0, 0, 128, 128); return toTex(cv); };

export function createView(canvasEl, { low = false, gfx = null } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas: canvasEl, antialias: !low, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, low ? 1.25 : 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog('#dce9f2', 20, 70);
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 300);
  scene.add(camera);
  const fixed = gfx !== null && gfx !== '', post = createPost(renderer, scene, camera, { level: fixed ? +gfx : low ? 1 : 2, auto: !fixed });
  // light: a key sun with soft shadows, a rim from behind to pull the fighters off the background,
  // the sky and ground bounce, and a fill that follows the fight on the dark stages
  const hemi = new THREE.HemisphereLight('#e4f1ff', '#8a7a64', 0.5);
  const sun = new THREE.DirectionalLight('#fff1dc', 3);
  sun.castShadow = true;
  sun.shadow.mapSize.set(low ? 1024 : 2048, low ? 1024 : 2048);
  Object.assign(sun.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8, near: 1, far: 40 });
  sun.shadow.bias = -0.0003; sun.shadow.normalBias = 0.025; sun.shadow.radius = 4;
  const rim = new THREE.DirectionalLight('#bcd8ff', 1.4);
  const fill = new THREE.PointLight('#ffffff', 0, 14, 1.4);
  scene.add(hemi, sun, sun.target, rim, rim.target, fill);
  // the visible sky
  const skyU = { top: { value: new THREE.Color() }, mid: { value: new THREE.Color() }, low: { value: new THREE.Color() } };
  const skyShader = { vertexShader: 'varying vec3 v; void main(){ v = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }', fragmentShader: 'uniform vec3 top; uniform vec3 mid; uniform vec3 low; varying vec3 v; void main(){ float h = v.y; vec3 c = h > 0.0 ? mix(mid, top, smoothstep(0.0, 0.55, h)) : mix(mid, low, smoothstep(0.0, -0.2, h)); gl_FragColor = vec4(c, 1.0); }' };
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(200, 32, 16), new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, fog: false, uniforms: skyU, ...skyShader })));
  // reflections: each stage's sky and its brightest lights, prefiltered for rough and shiny surfaces
  const pmrem = new THREE.PMREMGenerator(renderer);
  let envRT = null;
  function makeEnv(L) {
    const s = new THREE.Scene(), u = { top: { value: new THREE.Color(L.envSky[0]) }, mid: { value: new THREE.Color(L.envSky[1]) }, low: { value: new THREE.Color(L.envSky[2]) } };
    s.add(new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), new THREE.ShaderMaterial({ side: THREE.BackSide, uniforms: u, ...skyShader })));
    for (const c of L.cards || []) { const d = new THREE.Vector3(...c.dir).normalize().multiplyScalar(8), m = new THREE.Mesh(new THREE.SphereGeometry(c.size * 8, 16, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(c.color).multiplyScalar(c.power) })); m.position.copy(d); s.add(m); }
    if (envRT) envRT.dispose();
    envRT = pmrem.fromScene(s, 0.02);
    scene.environment = envRT.texture; scene.environmentIntensity = 1; scene.environmentRotation.set(0, 0, 0);
    s.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
  }

  let stage = null, stageId = null;
  function setStage(id) {
    if (id === stageId) return;
    if (stage) { scene.remove(stage.group); stage.group.traverse((o) => { if (o.geometry && !o.userData.shared) o.geometry.dispose(); }); }
    stage = buildStage(id, scene, { low }); stageId = id;
    seatCrowd(); post.setStage(id); dressStage();
    const L = stage.light;
    hemi.color.set(L.hemi[0]); hemi.groundColor.set(L.hemi[1]); hemi.intensity = L.hemi[2];
    sun.color.set(L.sun[0]); sun.intensity = L.sun[1];
    rim.color.set(L.rim[0]); rim.intensity = L.rim[1];
    scene.fog.color.set(L.fog[0]); scene.fog.near = L.fog[1]; scene.fog.far = L.fog[2];
    skyU.top.value.set(L.envSky[0]); skyU.mid.value.set(L.envSky[1]); skyU.low.value.set(L.envSky[2]);
    renderer.toneMappingExposure = L.exposure;
    fill.color.set(L.fill[0]); fill.intensity = L.fill[1];
    makeEnv(L);
  }

  // the real surroundings (scanned materials, props and sky), once they've loaded
  let env = null, dressing = 0;
  function dressStage() {
    if (!env || !stage) return;
    const token = ++dressing, st = stage;
    dress(env, stageId, st, { pmrem, current: () => token === dressing && stage === st, setEnvironment(tex, power, turn) { scene.environment = tex; scene.environmentIntensity = power; scene.environmentRotation.set(0, turn, 0); } }).catch(() => { /* the painted stage stays */ });
  }

  // the real crowd, once it has loaded, takes the painted one's seats
  let crowdLib = null;
  function seatCrowd() {
    const gl = stage && stage.glows.find((x) => x.crowd);
    if (!gl || !crowdLib || gl.crowd.real) return;
    let r = 7; const rand = () => ((r = (r * 16807) % 2147483647) / 2147483647);
    const seats = gl.crowd.seats.map((st) => { const row = Math.round((st.y - 0.42) / 0.45); return { x: st.x, y: st.y, z: st.z + 0.04, stand: rand() < (row === 3 ? 0.45 : 0.08) }; });
    const real = buildCrowd(crowdLib, seats, rand);
    real.group.traverse((o) => { o.userData.shared = true; });
    stage.group.add(real.group);
    gl.crowd.bodies.visible = gl.crowd.heads.visible = false;
    gl.crowd.real = real;
  }

  // ---------- fighters, projectiles and effects ----------
  // the real (motion-captured) fighters once they've loaded; the handmade ones until then, or for good
  let mocap = null;
  const models = [null, null];
  const want = (id) => (hasMocap(mocap, id) ? 'mocap' : 'hand');
  function ensureModels(g) {
    for (let i = 0; i < 2; i++) {
      const id = g.f[i].id;
      if (models[i] && models[i].c.id === id && (models[i].mocap ? 'mocap' : 'hand') === want(id)) continue;
      if (models[i]) scene.remove(models[i].root);
      models[i] = want(id) === 'mocap' ? mocapFighter(mocap, g.f[i].c, scene) : fighterModel(g.f[i].c, scene, { low });
    }
  }
  const shove = (m, heavy, kind) => {
    if (!m) return;
    if (m.mocap) mocapImpulse(m, kind === 'hit' ? { lean: heavy ? 4 : 2.5, head: heavy ? 8 : 5 } : kind === 'block' ? { lean: 1.2, head: 1 } : { lean: 3, head: 6 });
    else impulse(m, kind === 'hit' ? { lean: -(heavy ? 9 : 5), head: -(heavy ? 18 : 11), twist: (Math.random() - 0.5) * 8, roll: (Math.random() - 0.5) * 5 } : kind === 'block' ? { lean: -(heavy ? 3.5 : 2), head: -3 } : { head: -14, lean: -6 });
  };
  const projMeshes = new Map();
  const rat = rattan(), stickM = new THREE.MeshStandardMaterial({ map: rat.map, normalMap: rat.normalMap, roughness: 0.6 });
  const eggM = new THREE.MeshPhysicalMaterial({ color: '#efe2c8', roughness: 0.4, clearcoat: 0.4 });
  const beamTex = (() => { const cv = canvas(64, 256), x = cv.getContext('2d'), g = x.createLinearGradient(0, 0, 0, 256); g.addColorStop(0, 'rgba(255,250,210,0)'); g.addColorStop(0.2, 'rgba(255,248,200,0.5)'); g.addColorStop(1, 'rgba(255,255,240,0.95)'); x.fillStyle = g; x.fillRect(0, 0, 64, 256); return toTex(cv); })();
  const smokeTex = glowTex([[0, 'rgba(210,210,200,0.8)'], [0.5, 'rgba(180,180,170,0.4)'], [1, 'rgba(150,150,140,0)']]);
  const flare = glowTex([[0, 'rgba(255,255,255,1)'], [0.2, 'rgba(255,240,200,0.8)'], [0.6, 'rgba(255,190,90,0.25)'], [1, 'rgba(255,160,60,0)']]);
  function projMesh(p) {
    const gr = new THREE.Group();
    const add = (m) => { m.castShadow = true; gr.add(m); return m; };
    if (p.kind === 'baston') add(new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.015, 0.72, 12), stickM)).rotation.z = Math.PI / 2;
    else if (p.kind === 'silaw') {
      const cone = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.05, 1.1, 20, 1, true), new THREE.MeshBasicMaterial({ map: beamTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
      cone.rotation.z = Math.PI / 2; gr.add(cone);
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: flare, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); s.scale.setScalar(0.9); s.position.x = -0.5; gr.add(s);
    } else if (p.kind === 'balut') add(new THREE.Mesh(new THREE.SphereGeometry(0.06, 16, 12), eggM)).scale.set(1, 1.3, 1);
    else if (p.kind === 'ulan') { for (let k = 0; k < 10; k++) { const e = add(new THREE.Mesh(new THREE.SphereGeometry(0.055, 12, 10), eggM)); e.position.set((Math.random() - 0.5) * 0.6, 0.3 + Math.random() * 1.4, (Math.random() - 0.5) * 0.3); e.scale.set(1, 1.3, 1); } }
    else if (p.kind === 'usok') { for (let k = 0; k < 9; k++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex, transparent: true, depthWrite: false, color: '#c8c8bc', opacity: 0.8 })); s.position.set((Math.random() - 0.5) * 0.7, 0.4 + Math.random() * 1.3, (Math.random() - 0.5) * 0.3); s.scale.setScalar(0.6 + Math.random() * 0.4); s.material.rotation = Math.random() * TAU; gr.add(s); } }
    scene.add(gr);
    return gr;
  }
  // hit sparks: a bright flare and streaks
  const streakTex = (() => { const cv = canvas(128, 128), x = cv.getContext('2d'); x.translate(64, 64); for (let k = 0; k < 12; k++) { x.rotate(TAU / 12 + (k % 3) * 0.05); const g = x.createLinearGradient(0, 0, 60, 0); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,200,120,0)'); x.fillStyle = g; x.beginPath(); x.moveTo(0, -2.5); x.lineTo(k % 2 ? 60 : 42, 0); x.lineTo(0, 2.5); x.fill(); } return toTex(cv); })();
  const sparks = [];
  function spark(x, y, color, size, life = 0.2, tex = flare) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending }));
    s.position.set(x, y, 0.35); s.renderOrder = 5; s.material.rotation = Math.random() * TAU; scene.add(s);
    sparks.push({ s, t: 0, life, size });
  }
  const MAXP = 300, pGeo = new THREE.BufferGeometry(), pPos = new Float32Array(MAXP * 3), pCol = new Float32Array(MAXP * 3);
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3)); pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3));
  const points = new THREE.Points(pGeo, new THREE.PointsMaterial({ size: 0.05, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  points.frustumCulled = false; scene.add(points);
  const parts = [];
  // dust: soft puffs that billow out and fade, for knockdowns, landings and heavy steps
  const puffTex = glowTex([[0, 'rgba(255,255,255,0.55)'], [0.45, 'rgba(255,255,255,0.28)'], [1, 'rgba(255,255,255,0)']]), puffs = [];
  function dust(x, y, color, n, spread = 0.5, size = 0.5, life = 0.9) {
    for (let k = 0; k < n; k++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTex, color, transparent: true, depthWrite: false, opacity: 0.8 }));
      const a = (k / n) * Math.PI * 2 + Math.random() * 0.5;
      s.position.set(x + Math.cos(a) * 0.1, y + 0.08, 0.1 + Math.sin(a) * 0.1); s.material.rotation = Math.random() * TAU; scene.add(s);
      puffs.push({ s, t: 0, life: life * (0.8 + Math.random() * 0.4), vx: Math.cos(a) * spread * (0.6 + Math.random()), vz: Math.sin(a) * spread * 0.5, vy: 0.25 + Math.random() * 0.35, size: size * (0.7 + Math.random() * 0.6) });
    }
  }
  // strike trails: a fading ribbon behind the fastest fist, foot or stick tip
  const TRAIL = 14, trails = [0, 1].map(() => {
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(TRAIL * 2 * 3), 3)); geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(TRAIL * 2 * 3), 3));
    const idx = []; for (let i = 0; i < TRAIL - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } geo.setIndex(idx);
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    m.frustumCulled = false; m.renderOrder = 3; scene.add(m);
    return { m, pts: [], prev: new Map(), on: 0 };
  });
  const tv = new THREE.Vector3();
  function trail(i, m, f, dt) {
    const tr = trails[i];
    const striking = f.state === 'move' && f.move && f.mf >= f.move.startup - 2 && f.mf <= f.move.startup + f.move.active + 4 && !f.move.throw;
    tr.on = striking ? 1 : Math.max(0, tr.on - dt * 6);
    let best = null, bestV = 0;
    if (m.mocap) {
      const cands = [m.bones.RightHand, m.bones.LeftHand, m.bones.RightFoot, m.bones.LeftFoot].filter(Boolean);
      for (const b of cands) { b.getWorldPosition(tv); const p = tr.prev.get(b); const v = p ? tv.distanceTo(p) / Math.max(dt, 1e-3) : 0; if (!p) tr.prev.set(b, tv.clone()); else p.copy(tv); if (v > bestV) { bestV = v; best = b; } }
      if (best && m.props.length && (m.c.id === 'lakan' || m.c.id === 'tanod') && (best === m.bones.RightHand || best === m.bones.LeftHand)) { const pr = m.props[best === m.bones.RightHand ? 0 : Math.min(1, m.props.length - 1)]; if (pr) { pr.updateWorldMatrix(true, true); tv.set(0.55 * (best === m.bones.RightHand ? 1 : -1), 0.075, 0.025).applyMatrix4(pr.matrixWorld); best = { p: tv.clone() }; } } // a stick's trail runs from its tip
    }
    if (tr.on > 0 && best && bestV > 2.5) { const p = best.p ? best.p : best.getWorldPosition(new THREE.Vector3()); tr.pts.unshift(p.clone()); }
    else if (tr.pts.length) tr.pts.pop();
    if (tr.pts.length > TRAIL) tr.pts.length = TRAIL;
    const pos = tr.m.geometry.attributes.position, col = tr.m.geometry.attributes.color, n = tr.pts.length;
    const tint = f.move && f.move.super ? [1, 0.8, 0.3] : f.move && f.move.special ? [0.55, 0.8, 1] : [1, 0.95, 0.85];
    for (let k = 0; k < TRAIL; k++) {
      const p = tr.pts[Math.min(k, Math.max(0, n - 1))] || tv.set(0, -10, 0), q = tr.pts[Math.min(k + 1, n - 1)] || p;
      const dx = p.x - q.x, dy = p.y - q.y, len = Math.hypot(dx, dy) || 1, w = 0.07 * (1 - k / TRAIL);
      pos.setXYZ(k * 2, p.x - (dy / len) * w, p.y + (dx / len) * w, p.z); pos.setXYZ(k * 2 + 1, p.x + (dy / len) * w, p.y - (dx / len) * w, p.z);
      const a = (k < n ? (1 - k / TRAIL) ** 1.5 : 0) * tr.on * 0.8;
      col.setXYZ(k * 2, tint[0] * a, tint[1] * a, tint[2] * a); col.setXYZ(k * 2 + 1, tint[0] * a, tint[1] * a, tint[2] * a);
    }
    pos.needsUpdate = true; col.needsUpdate = true;
  }
  const emit = (x, y, z, color, n, speed = 2, up = 2, life = 0.5, grav = 8) => { for (let k = 0; k < n && parts.length < MAXP; k++) { const a = Math.random() * TAU; parts.push({ x, y, z, vx: Math.cos(a) * speed * Math.random(), vy: up * (Math.random() - 0.2), vz: Math.sin(a) * speed * 0.3 * Math.random(), life, max: life, c: new THREE.Color(color), g: grav }); } };
  // the super: a dark screen and a burst behind whoever called it
  const dim = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0, depthTest: false, depthWrite: false }));
  dim.position.z = -0.5; dim.renderOrder = 4; camera.add(dim);
  const burst = new THREE.Sprite(new THREE.SpriteMaterial({ map: streakTex, color: '#ffd23f', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
  burst.renderOrder = 4; scene.add(burst);
  const boxLines = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ vertexColors: true, depthTest: false }));
  boxLines.renderOrder = 9; boxLines.frustumCulled = false; scene.add(boxLines);
  const dummy = new THREE.Object3D();

  const cam = { x: 0, y: 1.5, z: 7, shake: 0, flash: 0, flashSide: 0, slow: 0, hype: 0, split: 0, impact: 0 };
  function resize() {
    const r = canvasEl.getBoundingClientRect();
    renderer.setSize(Math.max(1, r.width), Math.max(1, r.height), false);
    camera.aspect = Math.max(0.3, r.width / Math.max(1, r.height));
    camera.updateProjectionMatrix();
    post.resize();
  }

  function event(e, g) {
    switch (e.type) {
      case 'hit': {
        const big = e.super ? 1.3 : e.heavy ? 1.0 : 0.65, d = models[1 - e.side];
        // the one hit is shoved: head snapped back, body bent away, a little twist
        shove(d, e.heavy, 'hit');
        if (models[e.side] && !models[e.side].mocap) impulse(models[e.side], { lean: e.heavy ? 2.5 : 1.2 }); // and the one hitting leans into it
        spark(e.x, e.y, e.counter ? '#ff7a6a' : '#fff0c8', big);
        spark(e.x, e.y, e.counter ? '#ff5c5c' : '#ffc070', big * 1.1, 0.14, streakTex);
        emit(e.x, e.y, 0.2, e.heavy ? '#ffb060' : '#ffe0a0', e.heavy ? 18 : 10, 3.5, 3, 0.35);
        cam.shake = Math.max(cam.shake, e.super ? 0.1 : e.heavy ? 0.06 : 0.025);
        if (e.super) cam.hype = 1.6; // the crowd is on its feet
        if (e.heavy || e.super) { cam.split = e.super ? 1 : 0.6; cam.impact = e.super ? 1 : 0.55; }
        break;
      }
      case 'block': spark(e.x, e.y, '#9fd8ff', e.heavy ? 0.7 : 0.5, 0.15); emit(e.x, e.y, 0.2, '#cfe8ff', 8, 2.5, 2, 0.25); shove(models[1 - e.side], e.heavy, 'block'); break;
      case 'throw': shove(models[1 - e.side], true, 'throw'); cam.shake = 0.08; emit(e.x, 0.1, 0.2, '#d8c8a8', 14, 2, 1.5, 0.5, 6); break;
      case 'tech': spark(e.x, 1.2, '#ffffff', 0.8, 0.2, streakTex); break;
      case 'clash': spark(e.x, e.y + 1, '#ffffff', 1.1, 0.25, streakTex); emit(e.x, e.y + 1, 0.2, '#ffd23f', 14, 3, 2, 0.4); break;
      case 'down': emit(e.x, 0.05, 0.2, stageId === 'balete' ? '#6a5a3a' : '#bab2a4', 16, 2.2, 1.2, 0.5, 6); dust(e.x, 0, stageId === 'balete' ? '#8a7a5a' : stageId === 'court' ? '#c8b8a0' : '#b8b0a4', 10, 0.9, 0.9, 1.3); cam.shake = Math.max(cam.shake, 0.04); break;
      case 'land': { const f = g.f[e.side]; emit(f.x, 0.05, 0.2, '#bab2a4', 6, 1.2, 0.6, 0.35, 6); dust(f.x, 0, stageId === 'balete' ? '#8a7a5a' : '#c0b8ac', 5, 0.6, 0.5, 0.8); break; }
      case 'splat': emit(e.x, 0.05, 0.2, '#f2e6d0', 12, 1.8, 1.8, 0.45); break;
      case 'pop': emit(e.x, e.y, 0.2, '#ffffff', 8, 2, 2, 0.3); break;
      case 'super': cam.flash = 1; cam.flashSide = e.side; break;
      case 'ko': cam.shake = 0.12; cam.slow = 1; break;
      default: break;
    }
  }

  function frame(g, dt, o = {}) {
    const t = performance.now() / 1000;
    ensureModels(g);
    if (!stage) setStage(g.stage);
    for (let i = 0; i < 2; i++) {
      const f = g.f[i], m = models[i];
      // between the last tick and this one, unless something jumped (a new round, a throw)
      const pv = o.prev && o.prev.f[i], a = o.alpha ?? 1;
      const near = pv && Math.abs(pv.x - f.x) < 0.8 && Math.abs(pv.y - f.y) < 0.8;
      let x = near ? lerp(pv.x, f.x, a) : f.x, y = near ? lerp(pv.y, f.y, a) : f.y;
      if (f.state === 'thrown') { const at = g.f[1 - i]; const held = at.move ? clamp((at.mf - at.grabAt) / 8, 0, 1) : 0; x = lerp(f.x, at.x - at.face * 0.1, held * 0.3); y = held * 0.6; }
      if (g.freeze > 0 && (f.state === 'hit' || f.state === 'block' || f.state === 'hitAir') && !o.reduced) x += Math.sin(t * 90) * 0.02;
      m.root.position.set(x, y, 0);
      if (m.mocap) {
        driveMocap(m, f, g, mocap, dt, g.freeze > 0 ? 0 : a - 1, o.reduced);
        if (!o.reduced) trail(i, m, f, dt);
        if (m.c.id === 'lakan') m.props[0].visible = !g.projs.some((p) => p.side === i && p.kind === 'baston');
        if (m.cigar && Math.random() < dt * 3) { const wp = new THREE.Vector3(); m.cigar.getWorldPosition(wp); emit(wp.x + 0.12 * f.face, wp.y, wp.z, '#6a6a64', 1, 0.15, 0.5, 1.4, -0.3); }
        continue;
      }
      m.flip.scale.x = f.face; m.flip.rotation.y = -0.32 * f.face;
      // a new state or move crossfades from where the body was
      const key = f.state === 'move' ? `m${f.mid}` : `${f.state}${f.crouch ? 'c' : ''}`;
      const restarted = f.state === 'move' && f.mf < m.lastMf;
      if (key !== m.key || restarted) {
        m.from = m.pose; m.key = key; m.blend = 0;
        m.blendTime = f.state === 'move' || f.state === 'hit' || f.state === 'block' ? 0.05 : ['hitAir', 'down', 'ko', 'rise', 'thrown'].includes(f.state) ? 0.12 : 0.09;
      }
      m.lastMf = f.state === 'move' ? f.mf : -1;
      const target = targetPose(f, g, t, g.freeze > 0 ? 0 : a - 1);
      m.blend = Math.min(1, m.blend + dt / m.blendTime);
      m.pose = m.blend < 1 ? mix(m.from, target, ease(m.blend)) : target;
      m.breath = f.state === 'stand' || f.state === 'crouch' || f.state === 'win' ? Math.sin(t * 2.4 + i * 1.7) : 0;
      // eyes on the other fighter: looking up at a jumper, or at the Kapre
      const o2 = g.f[1 - i], look = clamp(Math.atan2((o2.y + 1.55 * o2.c.build) - (y + 1.55 * f.c.build), Math.max(0.6, Math.abs(o2.x - f.x))) * 0.7, -0.35, 0.45);
      const planted = f.y <= 0.001 && !['hitAir', 'ko', 'down', 'rise', 'thrown'].includes(f.state) && Math.abs(m.pose.tilt) < 0.2 && m.pose.lift < 0.05;
      animate(m, m.pose, dt, { attacking: f.state === 'move', ik: planted && (f.state === 'move' ? 'near' : 'all'), look: ['down', 'ko', 'rise'].includes(f.state) ? 0 : look, face: f.face });
      if (m.c.id === 'lakan') m.props[1].visible = !g.projs.some((p) => p.side === i && p.kind === 'baston');
      if (m.cigar && Math.random() < dt * 3) { const wp = new THREE.Vector3(); m.cigar.getWorldPosition(wp); emit(wp.x + 0.15 * f.face, wp.y + 0.05, wp.z, '#6a6a64', 1, 0.15, 0.5, 1.4, -0.3); }
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
      if (p.kind === 'usok') gr.children.forEach((c, k) => { c.position.y += Math.sin(t * 2 + k) * 0.002; c.scale.setScalar((0.6 + (k % 3) * 0.15) * (1 + p.t * 0.006)); c.material.rotation += dt * 0.3; });
      if (p.kind === 'ulan') gr.children.forEach((c, k) => { c.position.y = 0.3 + ((k * 0.37 + p.t * 0.05) % 1.5); });
    }
    for (let k = sparks.length - 1; k >= 0; k--) {
      const s = sparks[k]; s.t += dt;
      const f = s.t / s.life;
      if (f >= 1) { scene.remove(s.s); s.s.material.dispose(); sparks.splice(k, 1); continue; }
      s.s.scale.setScalar(s.size * (0.35 + ease(Math.min(1, f * 2.2)) * 0.9)); s.s.material.opacity = 1 - f * f;
    }
    for (let k = puffs.length - 1; k >= 0; k--) {
      const p = puffs[k]; p.t += dt; const f = p.t / p.life;
      if (f >= 1) { scene.remove(p.s); p.s.material.dispose(); puffs.splice(k, 1); continue; }
      p.s.position.x += p.vx * dt; p.s.position.y += p.vy * dt; p.s.position.z += p.vz * dt; p.vx *= 0.95; p.vy *= 0.97;
      p.s.scale.setScalar(p.size * (0.4 + Math.sqrt(f) * 1.2)); p.s.material.opacity = 0.7 * (1 - f) * Math.min(1, f * 8);
    }
    let n = 0;
    for (let k = parts.length - 1; k >= 0; k--) { const p = parts[k]; p.life -= dt; if (p.life <= 0) { parts.splice(k, 1); continue; } p.vy -= p.g * dt; p.x += p.vx * dt; p.y = Math.max(0.02, p.y + p.vy * dt); p.z += p.vz * dt; }
    for (const p of parts) { pPos[n * 3] = p.x; pPos[n * 3 + 1] = p.y; pPos[n * 3 + 2] = p.z; const al = clamp((p.life / p.max) * 1.5, 0, 1); pCol[n * 3] = p.c.r * al; pCol[n * 3 + 1] = p.c.g * al; pCol[n * 3 + 2] = p.c.b * al; n++; }
    pGeo.setDrawRange(0, n); pGeo.attributes.position.needsUpdate = true; pGeo.attributes.color.needsUpdate = true;
    // the stage breathes: the crowd, fireflies, candle flames
    for (const gl of stage.glows) {
      if (gl.crowd && gl.crowd.real) gl.crowd.real.update(t, g.phase === 'ko' || cam.hype > 0 ? 1 : 0);
      else if (gl.crowd) {
        const { bodies, heads, seats, bodyY, headY } = gl.crowd, cheer = g.phase === 'ko' || cam.hype > 0 ? 1 : 0;
        seats.forEach((st, k) => {
          const yy = st.y + Math.abs(Math.sin(t * (3 + cheer * 6) + st.phase)) * (0.02 + cheer * 0.12);
          dummy.position.set(st.x, yy + bodyY, st.z); dummy.rotation.set(0, 0, Math.sin(t + st.phase) * 0.05); dummy.updateMatrix(); bodies.setMatrixAt(k, dummy.matrix);
          dummy.position.set(st.x, yy + headY, st.z); dummy.updateMatrix(); heads.setMatrixAt(k, dummy.matrix);
        });
        bodies.instanceMatrix.needsUpdate = true; heads.instanceMatrix.needsUpdate = true;
      }
      if (gl.fly) { const u = gl.fly.userData; gl.fly.position.x += Math.sin(t * 0.7 + u.phase) * 0.004; gl.fly.position.y += Math.cos(t * 0.9 + u.phase) * 0.003; gl.fly.material.opacity = 0.35 + 0.65 * Math.max(0, Math.sin(t * 2.2 + u.phase)); }
      if (gl.flame) gl.flame.scale.set(1 + Math.sin(t * 17) * 0.1, 1.8 + Math.sin(t * 23) * 0.3, 1);
      if (gl.candle) gl.candle.intensity = 2.2 + Math.sin(t * 13) * 0.3 + Math.sin(t * 29) * 0.2;
    }
    if (o.boxes) {
      const v = [], c = [];
      const put = (b, col) => { if (!b) return; const [x0, x1, y0, y1] = b; for (const [px, py] of [[x0, y0], [x1, y0], [x1, y0], [x1, y1], [x1, y1], [x0, y1], [x0, y1], [x0, y0]]) { v.push(px, py, 0.5); c.push(...col); } };
      for (const f of g.f) { put(hurtbox(f), [0.3, 0.6, 1]); put(hitbox(f), [1, 0.2, 0.2]); }
      for (const p of g.projs) put(pbox(p), [1, 0.6, 0.1]);
      boxLines.geometry.setAttribute('position', new THREE.Float32BufferAttribute(v, 3)); boxLines.geometry.setAttribute('color', new THREE.Float32BufferAttribute(c, 3));
      boxLines.visible = true;
    } else boxLines.visible = false;

    // the camera: between the fighters, pulling back as they part; closer on a super or a KO
    const [a, b] = g.f, mid = (a.x + b.x) / 2, gap = Math.abs(a.x - b.x);
    const portrait = camera.aspect < 1;
    const tall = Math.max(a.c.build, b.c.build) - 1;
    let tx = clamp(mid, -PHYS.wall + 2, PHYS.wall - 2), ty = 0.98 + tall * 0.7 + Math.max(a.y, b.y) * 0.35, tz = (portrait ? 8.6 : 4.0) + gap * (portrait ? 0.9 : 0.46) + tall * 1.6;
    if (o.showcase) { tx = 0; ty = 1.05 + tall * 0.7; tz = (portrait ? 7.6 : 5.4) + tall * 1.6; }
    // the shots: a sweep in at the start of a match, an orbit round the knockout, a push in on the winner,
    // a tilt on a super. yaw turns the camera round the fight, so the stage shows its depth.
    let yaw = 0, lift = 0, roll = 0, fast = false;
    if (cam.flash > 0) { const f = g.f[cam.flashSide]; tx = lerp(tx, f.x, 0.6); ty = 1.25; tz = 4.4; roll = 0.06 * (f.face || 1); fast = true; }
    const cine = !o.reduced && !o.showcase && !portrait;
    if (cine && g.phase === 'intro' && g.round === 1) {
      const p = ease(clamp(1 - g.phaseT / 100, 0, 1));
      yaw = lerp(0.85, 0, p); lift = lerp(2.2, 0, p); tz = lerp(tz + 4.5, tz, p); ty = lerp(ty + 0.6, ty, p);
    }
    const downed = g.f.find((f) => f.state === 'ko'), winner = g.f.find((f) => f.state === 'win');
    if (g.phase === 'ko' && downed && cam.slow > 0) { tx = lerp(tx, downed.x, 0.5); tz *= 0.8; if (cine) { cam.koT = (cam.koT || 0) + dt; yaw = 0.55 * ease(Math.min(1, cam.koT / 1.8)) * -(downed.face || 1); lift = -0.3; } }
    else if ((g.phase === 'ko' || g.phase === 'matchOver') && winner && cine) { tx = winner.x; ty = 1.2 + tall * 0.7; tz = 3.4 + tall * 1.6; yaw = 0.42 * (winner.face || 1); lift = -0.45; cam.koT = 0; }
    else cam.koT = 0;
    const k = Math.min(1, dt * (fast ? 10 : g.phase === 'intro' ? 6 : 3.2));
    cam.x = lerp(cam.x, tx, k); cam.y = lerp(cam.y, ty, k); cam.z = lerp(cam.z, tz, k);
    cam.yaw = lerp(cam.yaw || 0, yaw, Math.min(1, dt * (g.phase === 'intro' ? 8 : 2.2))); cam.lift = lerp(cam.lift || 0, lift, Math.min(1, dt * 3)); cam.roll = lerp(cam.roll || 0, roll, Math.min(1, dt * 8));
    const shake = o.reduced ? 0 : cam.shake;
    camera.position.set(cam.x + Math.sin(cam.yaw) * cam.z + (Math.random() - 0.5) * shake, cam.y + 0.4 + cam.lift + (Math.random() - 0.5) * shake, Math.cos(cam.yaw) * cam.z);
    camera.lookAt(cam.x, cam.y - 0.05 + cam.lift * 0.25, 0);
    camera.rotateZ(cam.roll);
    cam.shake = Math.max(0, cam.shake - dt * 0.6); cam.hype = Math.max(0, cam.hype - dt);
    cam.flash = g.freeze > 0 && cam.flash > 0 ? cam.flash : Math.max(0, cam.flash - dt * 3);
    dim.material.opacity = cam.flash * 0.6;
    burst.material.opacity = cam.flash * 0.9;
    if (cam.flash > 0) { const f = g.f[cam.flashSide]; burst.position.set(f.x, 1.1, -0.4); burst.material.rotation = t * 2; burst.scale.setScalar(3 + (1 - cam.flash) * 2); }
    if (g.phase !== 'ko') cam.slow = 0;
    const L = stage.light;
    fill.position.set(cam.x, 2.6, 2.4);
    sun.target.position.set(cam.x, 0, 0); sun.position.set(cam.x + L.sun[2][0], L.sun[2][1], L.sun[2][2]);
    rim.target.position.set(cam.x, 1, 0); rim.position.set(cam.x - 2, 5, -7);
    cam.split = Math.max(0, cam.split - dt * 5);
    cam.impact = Math.max(0, cam.impact - dt * 9);
    post.render(dt, { split: o.reduced ? 0 : cam.split, bloomBoost: cam.flash * 0.5, flash: o.reduced ? 0 : cam.impact });
  }

  // Head-and-shoulders portraits of each fighter, for the select screen.
  function portraits(roster) {
    const out = {}, S = 192, rt = new THREE.WebGLRenderTarget(S, S), ps = new THREE.Scene(), pc = new THREE.PerspectiveCamera(24, 1, 0.05, 20);
    rt.texture.colorSpace = THREE.SRGBColorSpace; // render targets skip tone mapping, so the lights below are gentler
    ps.environment = scene.environment;
    const key = new THREE.DirectionalLight('#fff4e4', 1.8); key.position.set(2, 2, 3); const back = new THREE.DirectionalLight('#9ec4ff', 1.4); back.position.set(-2, 2, -3);
    ps.add(key, back, new THREE.HemisphereLight('#e8f0ff', '#6a5a4a', 0.5));
    const bg = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), new THREE.MeshBasicMaterial({ color: '#2a2030' })); bg.position.z = -3; ps.add(bg);
    const px = new Uint8Array(S * S * 4), cv = canvas(S, S), cx = cv.getContext('2d'), img = cx.createImageData(S, S);
    for (const c of roster) {
      const real = hasMocap(mocap, c.id), m = real ? mocapFighter(mocap, c, ps) : fighterModel(c, ps, { low });
      if (real) {
        const f = { state: 'stand', vx: 0, face: 1, crouch: false, mf: 0, c, y: 0, id: c.id }, gg = { phase: 'fight', freeze: 0, phaseT: 0 };
        m.loopT = 0.4; driveMocap(m, f, gg, mocap, 0.016, 0, true); m.turn.rotation.y = 0.55;
      } else {
        m.pose = { ...STANCE, aL: [0.4, 1.2, 0.2], aR: [0.3, 1.4, 0.2], twist: -0.1 }; m.breath = 0;
        applyPose(m, m.pose);
        m.flip.rotation.y = -0.75;
      }
      ps.updateMatrixWorld(true);
      const head = new THREE.Vector3(); (real ? m.bones.Head : m.head).getWorldPosition(head);
      bg.material.color.set(c.colors.accent).multiplyScalar(0.35);
      pc.position.set(head.x + 0.55 * c.build, head.y + 0.06 * c.build, head.z + 0.95 * c.build); pc.lookAt(head.x, head.y + 0.02 * c.build, head.z);
      renderer.setRenderTarget(rt); renderer.render(ps, pc); renderer.readRenderTargetPixels(rt, 0, 0, S, S, px); renderer.setRenderTarget(null);
      for (let y = 0; y < S; y++) img.data.set(px.subarray((S - 1 - y) * S * 4, (S - y) * S * 4), y * S * 4);
      cx.putImageData(img, 0, 0);
      out[c.id] = cv.toDataURL('image/jpeg', 0.9);
      ps.remove(m.root);
    }
    rt.dispose();
    return out;
  }

  resize();
  return { frame, event, resize, setStage, portraits, setMocap(lib) { mocap = lib; }, setCrowd(lib) { crowdLib = lib; seatCrowd(); }, setEnv(e) { env = e; dressStage(); }, get mocap() { return mocap; }, renderer, post, scene, models, get stage() { return stageId; }, cam };
}
