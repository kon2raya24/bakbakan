// The four stages of Bakbakan sa Kanto, built realistically: textured and bump-mapped ground, painted
// building fronts with glass that reflects the sky, rounded props, and each stage's light (golden
// hour at the terminal, floodlights at the court, morning at the palengke, moonlight at the balete).
import * as THREE from './vendor/three.module.min.js';
import { STAGES } from './roster.mjs';
import * as T from './tex.mjs';

const TAU = Math.PI * 2;

function mesh(geo, material, { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1, cast = true, receive = true } = {}) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.scale.set(sx, sy, sz);
  m.castShadow = cast; m.receiveShadow = receive;
  return m;
}
// A box with rounded edges, from an extruded rounded rectangle: nothing in the street is a sharp cube.
const RB = new Map();
export function roundedBox(w, h, d, r = 0.04) {
  const key = [w, h, d, r].map((v) => v.toFixed(3)).join();
  if (RB.has(key)) return RB.get(key);
  r = Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001);
  const s = new THREE.Shape(), x0 = -w / 2 + r, x1 = w / 2 - r, y0 = -h / 2 + r, y1 = h / 2 - r;
  s.moveTo(x0, -h / 2); s.lineTo(x1, -h / 2); s.quadraticCurveTo(w / 2, -h / 2, w / 2, y0); s.lineTo(w / 2, y1); s.quadraticCurveTo(w / 2, h / 2, x1, h / 2);
  s.lineTo(x0, h / 2); s.quadraticCurveTo(-w / 2, h / 2, -w / 2, y1); s.lineTo(-w / 2, y0); s.quadraticCurveTo(-w / 2, -h / 2, x0, -h / 2);
  const g = new THREE.ExtrudeGeometry(s, { depth: d - r * 2, bevelEnabled: true, bevelSize: r, bevelThickness: r, bevelSegments: 3, curveSegments: 4 });
  g.translate(0, 0, -(d - r * 2) / 2);
  g.computeVertexNormals();
  RB.set(key, g);
  return g;
}
const std = (o) => new THREE.MeshStandardMaterial({ roughness: 0.8, ...o });

// Merge every static mesh that shares a material into one; anything marked userData.dynamic is left alone.
function mergeStatic(root) {
  root.updateMatrixWorld(true);
  const buckets = new Map();
  const walk = (o) => {
    if (o.userData.dynamic) return;
    if (o.isMesh && !o.isInstancedMesh && !Array.isArray(o.material)) {
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
    for (const gg of parts) { pos.set(gg.attributes.position.array, at * 3); nor.set(gg.attributes.normal.array, at * 3); if (gg.attributes.uv) uv.set(gg.attributes.uv.array, at * 2); at += gg.attributes.position.count; gg.dispose(); }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    const merged = new THREE.Mesh(geo, list[0].material);
    merged.castShadow = list[0].castShadow; merged.receiveShadow = list[0].receiveShadow;
    for (const m of list) m.parent.remove(m);
    root.add(merged);
  }
}

export function buildStage(id, scene, { low = false } = {}) {
  const group = new THREE.Group(); scene.add(group);
  const add = (...o) => { group.add(...o); return o[0]; };
  const st = STAGES.find((s) => s.id === id) || STAGES[0];
  const r = T.rng(id.length * 7919 + 3), pick = (a) => a[Math.floor(r() * a.length)];
  const TS = low ? 256 : 512;
  const glows = [];
  // the light, the sky for reflections, and the air
  const L = { hemi: ['#e4f1ff', '#8a7a64', 0.5], sun: ['#fff1dc', 3, [-4, 9, 6]], rim: ['#bcd8ff', 1.4], fog: ['#dce9f2', 20, 70], sky: st.sky, envSky: ['#8fc8f0', '#fff2d8', '#6a6258'], exposure: 1, fill: ['#ffffff', 0], cards: [] };

  // `surface` names the scanned material that can replace this one (envpack.mjs), and the size it covers
  const tag = (m, kind, w, h, extra = {}) => { m.userData.surface = { kind, w, h, ...extra }; return m; };
  const ground = (set, { w = 40, d = 14, z = -2, rough = 0.9, color = '#ffffff', far = '#6a6660', roughMap = null, surface = null } = {}) => {
    const gm = std({ map: set.map, normalMap: set.normalMap, normalScale: new THREE.Vector2(0.8, 0.8), roughness: rough, roughnessMap: roughMap, color });
    if (surface) tag(gm, surface, w, d, { rough, keepRough: roughMap });
    add(mesh(new THREE.PlaneGeometry(w, d), gm, { rx: -Math.PI / 2, z, cast: false }));
    add(mesh(new THREE.PlaneGeometry(300, 150), std({ color: far, roughness: 1 }), { rx: -Math.PI / 2, y: -0.02, z: -60, cast: false }));
  };
  // a row of buildings: painted fronts, some air-con units, a water tank here and there, wires
  const buildings = (z, colors, { hMin = 6, hMax = 12, shops = 0.3, lit = 0, sky } = {}) => {
    let x = -24;
    while (x < 24) {
      const w = 4 + Math.floor(r() * 4), floors = Math.max(2, Math.round((hMin + r() * (hMax - hMin)) / 3)), h = floors * 3, c = pick(colors);
      const f = T.facade(Math.floor(r() * 1e6), w, h, c, { shop: r() < shops, sky: sky || L.envSky, lit });
      add(mesh(new THREE.BoxGeometry(w, h, 6), std({ color: T.shade(c, 0.85), roughness: 0.95 }), { x: x + w / 2, y: h / 2, z: z - 3 }));
      add(mesh(new THREE.PlaneGeometry(w, h), std({ map: f.map, normalMap: f.normalMap, normalScale: new THREE.Vector2(0.9, 0.9), roughness: 0.85 }), { x: x + w / 2, y: h / 2, z: z + 0.005, cast: false }));
      add(mesh(roundedBox(w + 0.2, 0.25, 0.5, 0.05), std({ color: T.shade(c, 1.05), roughness: 0.9 }), { x: x + w / 2, y: h + 0.12, z: z - 0.1 })); // the parapet
      for (let f2 = 1; f2 < floors; f2++) if (r() < 0.6) { // an air-con unit under a window
        const ax = x + 0.8 + r() * (w - 1.6);
        add(mesh(roundedBox(0.7, 0.45, 0.5, 0.03), std({ color: '#e4e2dc', roughness: 0.6 }), { x: ax, y: f2 * 3 + 0.4, z: z + 0.26 }));
        add(mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.02, 16), std({ color: '#3a3a3a', roughness: 0.7 }), { x: ax + 0.12, y: f2 * 3 + 0.4, z: z + 0.52, rx: Math.PI / 2, cast: false }));
      }
      if (r() < 0.5) { add(mesh(new THREE.CylinderGeometry(0.55, 0.55, 1.2, 20), std({ color: '#2f6fd6', roughness: 0.45 }), { x: x + w * 0.7, y: h + 0.85, z: z - 1.2 })); }
      x += w;
    }
  };
  const bunting = (z, y, colors = ['#e8384f', '#ffd23f', '#2f6fd6', '#3fae5a', '#ffffff']) => {
    const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-0.14, 0, 0), new THREE.Vector3(0.14, 0, 0), new THREE.Vector3(0, -0.32, 0)]); geo.computeVertexNormals();
    const mats = colors.map((c) => std({ color: c, side: THREE.DoubleSide, roughness: 0.7 }));
    for (let k = 0; k < 50; k++) { const x = -12.5 + k * 0.5, sag = Math.sin(((k % 25) / 25) * Math.PI) * 0.45; add(mesh(geo, mats[k % mats.length], { x, y: y - sag, z, ry: (r() - 0.5) * 0.3, cast: false })); }
    const pts = []; for (let k = 0; k <= 50; k++) { const x = -12.5 + k * 0.5; pts.push(new THREE.Vector3(x, y - Math.sin(((k % 25) / 25) * Math.PI) * 0.45 + 0.01, z)); }
    add(mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 100, 0.006, 4), std({ color: '#222' }), { cast: false }));
  };
  const wire = (a, b, sag, mat) => { const pts = []; for (let k = 0; k <= 16; k++) { const t = k / 16; pts.push(new THREE.Vector3(T.lerp(a[0], b[0], t), T.lerp(a[1], b[1], t) - Math.sin(t * Math.PI) * sag, T.lerp(a[2], b[2], t))); } add(mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.012, 4), mat, { cast: false })); };
  const signBoard = (tex, w, h, o) => add(mesh(new THREE.PlaneGeometry(w, h), std({ map: tex, roughness: 0.7 }), { cast: false, ...o }));

  if (id === 'terminal') {
    // Cubao at golden hour: a jeepney terminal, the shed, the line of jeeps, the city behind
    Object.assign(L, { hemi: ['#ffd8b0', '#6a5040', 0.55], sun: ['#ffc080', 3.4, [-7, 5, 6]], rim: ['#ffe0b0', 1.6], fog: ['#f0b88a', 18, 65], exposure: 1.05, envSky: ['#6f96d8', '#ffb070', '#5a4a3c'], cards: [{ dir: [-0.7, 0.35, 0.5], color: '#ffd08a', size: 0.25, power: 10 }] });
    ground(T.asphalt(21, { size: TS }), { far: '#4a4642', surface: 'asphalt' });
    // lane markings, painted and worn
    const paintTex = T.paint(256, 32, (x, y) => { const n = Math.sin(x * 0.7) * Math.sin(y * 1.3) * 20; return [226 + n, 190 + n, 84 + n * 0.5]; }).map;
    const laneM = std({ map: paintTex, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -2 });
    for (let x = -18; x <= 18; x += 4) add(mesh(new THREE.PlaneGeometry(2.2, 0.14), laneM, { x, y: 0.004, z: 2.6, rx: -Math.PI / 2, cast: false }));
    add(mesh(new THREE.PlaneGeometry(40, 0.12), std({ color: '#e8e4dc', roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -2 }), { y: 0.004, z: -2.6, rx: -Math.PI / 2, cast: false }));
    const kerb = T.concrete(22, '#b8b2a8', { size: 256, repeat: [12, 1] });
    add(mesh(roundedBox(40, 0.16, 1.6, 0.05), tag(std({ map: kerb.map, normalMap: kerb.normalMap, roughness: 0.9 }), 'kerb', 1, 1), { y: 0.08, z: -3.6 })); // the kerb and sidewalk
    buildings(-10, ['#e8c9a0', '#f2e6d0', '#c8d8e0', '#e0a890', '#f4dfb0'], { shops: 0.5 });
    // the shed: green steel posts, purlins, and a sloped corrugated roof
    const steel = std({ color: '#3e6b4a', roughness: 0.5, metalness: 0.6 });
    for (let x = -12; x <= 12; x += 6) { add(mesh(new THREE.CylinderGeometry(0.055, 0.06, 4.4, 14), steel, { x: x + 1, y: 2.2, z: -4.3 })); add(mesh(new THREE.CylinderGeometry(0.055, 0.06, 4.9, 14), steel, { x: x + 1, y: 2.45, z: -8.2 })); }
    for (const z of [-4.3, -6.2, -8.2]) add(mesh(new THREE.BoxGeometry(26, 0.1, 0.07), steel, { y: z === -4.3 ? 4.4 : z === -6.2 ? 4.65 : 4.9, z }));
    const sheet = T.corrugated(23, { size: TS / 2, repeat: [26, 1] });
    add(mesh(new THREE.PlaneGeometry(26, 4.3), tag(std({ map: sheet.map, normalMap: sheet.normalMap, metalness: 0.5, roughness: 0.45, side: THREE.DoubleSide }), 'roof', 26, 4.3, { rough: 0.7 }), { y: 4.72, z: -6.25, rx: -Math.PI / 2 + 0.12 }));
    signBoard(T.sign([['CUBAO · QUIAPO · DIVISORIA', 12]], '#1e6b3e', '#ffffff', { w: 1024, h: 96 }), 6.4, 0.6, { y: 3.9, z: -4.24 });
    signBoard(T.sign([['BAWAL MANIGARILYO', 12]], '#f4f1e6', '#c0182e', { w: 512, h: 96, border: '#c0182e' }), 1.4, 0.26, { x: -7, y: 2.5, z: -4.24 });
    // jeepneys: rounded bodies, chrome, glass, painted sides, in a queue
    const chrome = std({ color: '#e8ecf0', metalness: 1, roughness: 0.18 }), glass = new THREE.MeshPhysicalMaterial({ color: '#1a222a', roughness: 0.05, metalness: 0.1, clearcoat: 1 }), tyre = std({ color: '#161616', roughness: 0.85 });
    const jside = (c, route) => { const cv = T.canvas(1024, 256), x = cv.getContext('2d'); x.fillStyle = c; x.fillRect(0, 0, 1024, 256); const gr = x.createLinearGradient(0, 0, 0, 256); gr.addColorStop(0, 'rgba(255,255,255,0.25)'); gr.addColorStop(1, 'rgba(0,0,0,0.2)'); x.fillStyle = gr; x.fillRect(0, 0, 1024, 256); ['#e8384f', '#2f6fd6', '#ffd23f', '#3fae5a'].forEach((cc, k) => { x.fillStyle = cc; x.beginPath(); x.moveTo(0, 150 + k * 16); for (let i = 0; i <= 1024; i += 32) x.lineTo(i, 150 + k * 16 + Math.sin(i / 90 + k) * 6); x.lineTo(1024, 162 + k * 16); x.lineTo(0, 162 + k * 16); x.fill(); }); x.fillStyle = '#c0182e'; x.font = '800 44px "Baloo 2", system-ui'; x.textAlign = 'center'; x.fillText(route, 512, 240); return T.toTex(cv); };
    for (const [x, c, route] of [[-7, '#f2f0ea', 'CUBAO — QUIAPO'], [0.3, '#fff2c8', 'DIVISORIA'], [7.6, '#d8ecf4', 'ESPAÑA — CUBAO']]) {
      const j = new THREE.Group(), paint = std({ map: jside(c, route), roughness: 0.35, metalness: 0.2 }), body = std({ color: c, roughness: 0.35, metalness: 0.2 });
      j.add(mesh(roundedBox(3.9, 0.85, 1.9, 0.1), paint, { x: -0.25, y: 0.98 })); // the passenger body, painted
      j.add(mesh(roundedBox(3.7, 0.44, 1.78, 0.04), glass, { x: -0.3, y: 1.62 })); // the open windows
      for (let k = 0; k < 7; k++) j.add(mesh(new THREE.BoxGeometry(0.07, 0.46, 1.92), body, { x: -2.05 + k * 0.6, y: 1.62 })); // pillars
      j.add(mesh(roundedBox(4.3, 0.1, 2.02, 0.04), std({ color: '#c0182e', roughness: 0.4, metalness: 0.3 }), { x: -0.1, y: 1.9 })); // the roof
      j.add(mesh(new THREE.BoxGeometry(3.6, 0.05, 0.05), chrome, { x: -0.2, y: 2.0, z: 0.9 })); j.add(mesh(new THREE.BoxGeometry(3.6, 0.05, 0.05), chrome, { x: -0.2, y: 2.0, z: -0.9 })); // the roof rails
      j.add(mesh(roundedBox(1.2, 0.62, 1.7, 0.16), chrome, { x: 2.3, y: 0.92 })); // the hood
      j.add(mesh(roundedBox(0.06, 0.52, 1.6, 0.02), glass, { x: 1.72, y: 1.55, rz: -0.25 })); // the windshield
      j.add(mesh(roundedBox(0.08, 0.5, 1.3, 0.03), chrome, { x: 2.92, y: 0.9 })); // the grille
      for (let k = 0; k < 7; k++) j.add(mesh(new THREE.BoxGeometry(0.02, 0.44, 0.02), std({ color: '#2a2a2a' }), { x: 2.97, y: 0.9, z: -0.54 + k * 0.18, cast: false }));
      for (const sz of [-1, 1]) { j.add(mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.05, 18), std({ color: '#fff8e0', emissive: '#fff2c0', emissiveIntensity: 0.6 }), { x: 2.96, y: 1.08, z: sz * 0.66, rz: Math.PI / 2, cast: false })); j.add(mesh(roundedBox(0.8, 0.08, 0.3, 0.03), chrome, { x: 2.2, y: 0.62, z: sz * 0.92 })); } // lights, fenders
      j.add(mesh(new THREE.ConeGeometry(0.08, 0.32, 12), chrome, { x: 2.6, y: 1.34, rz: -1.2 })); // the chrome horse, more or less
      for (const [wx, wz] of [[1.9, 0.86], [1.9, -0.86], [-1.4, 0.86], [-1.4, -0.86]]) { j.add(mesh(new THREE.TorusGeometry(0.3, 0.12, 12, 24), tyre, { x: wx, y: 0.42, z: wz })); j.add(mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.05, 18), chrome, { x: wx, y: 0.42, z: wz + Math.sign(wz) * 0.06, rx: Math.PI / 2 })); }
      j.position.set(x, 0, -6.2);
      add(j);
    }
    for (const x of [-11, 4]) { add(mesh(new THREE.CylinderGeometry(0.12, 0.15, 8, 12), std({ color: '#8a8478', roughness: 0.8 }), { x, y: 4, z: -8.6 })); }
    const wm = std({ color: '#1b1b1b', roughness: 0.6 });
    for (const dy of [0, 0.3, 0.55]) wire([-24, 7.6 - dy, -8.6], [24, 7.6 - dy, -8.6], 0.6, wm);
    bunting(-2.2, 4.3);
  } else if (id === 'court') {
    // a barangay covered court at night: a glossy wooden floor under floodlights, bleachers, the liga
    Object.assign(L, { hemi: ['#6a7ab0', '#2a2430', 0.35], sun: ['#fff0dc', 3.6, [1, 12, 5]], rim: ['#8fb0ff', 2.2], fog: ['#141828', 16, 50], exposure: 1.1, fill: ['#fff0dc', 5], envSky: ['#0a0e20', '#2a2a48', '#3a2a1a'], cards: [{ dir: [0, 1, 0.1], color: '#fff4e0', size: 0.3, power: 14 }, { dir: [0.6, 0.8, 0], color: '#fff4e0', size: 0.15, power: 8 }, { dir: [-0.6, 0.8, 0], color: '#fff4e0', size: 0.15, power: 8 }] });
    const floor = T.planks(31, { size: TS, repeat: [34, 12], color: '#c48a52' });
    ground(floor, { rough: 0.28, far: '#1a1614', d: 12, surface: 'court' });
    // the lines, painted on
    const lines = T.canvas(1024, 384), lx = lines.getContext('2d');
    lx.strokeStyle = 'rgba(248,244,236,0.92)'; lx.lineWidth = 6; lx.beginPath(); lx.moveTo(512, 0); lx.lineTo(512, 384); lx.stroke(); lx.beginPath(); lx.arc(512, 170, 70, 0, TAU); lx.stroke(); lx.beginPath(); lx.moveTo(0, 60); lx.lineTo(1024, 60); lx.stroke();
    lx.strokeStyle = 'rgba(232,56,79,0.85)'; lx.lineWidth = 60; lx.beginPath(); lx.arc(512, 170, 36, 0, TAU); lx.stroke();
    add(mesh(new THREE.PlaneGeometry(32, 12), std({ map: T.toTex(lines), transparent: true, roughness: 0.3, polygonOffset: true, polygonOffsetFactor: -2 }), { rx: -Math.PI / 2, y: 0.003, z: -2, cast: false }));
    // bleachers of rounded concrete, and the barangay on them
    const cc = T.concrete(32, '#8a8a8e', { size: 256, repeat: [10, 1] });
    const bleacherM = tag(std({ map: cc.map, normalMap: cc.normalMap, roughness: 0.9 }), 'bleacher', 1, 1);
    for (let k = 0; k < 4; k++) add(mesh(roundedBox(26, 0.42, 0.85, 0.05), bleacherM, { y: 0.21 + k * 0.45, z: -4.6 - k * 0.82 }));
    const N = low ? 40 : 70, bodyG = new THREE.LatheGeometry([[0.001, -0.36], [0.15, -0.36], [0.16, -0.1], [0.17, 0.06], [0.21, 0.16], [0.19, 0.24], [0.08, 0.29], [0.04, 0.32]].map(([rr, y]) => new THREE.Vector2(rr, y)), 14), headG = new THREE.SphereGeometry(0.1, 14, 10);
    bodyG.scale(1, 1, 0.62); // they face the court: wide at the shoulders, shallow front to back
    const bodies = new THREE.InstancedMesh(bodyG, std({ roughness: 0.85 }), N), heads = new THREE.InstancedMesh(headG, std({ roughness: 0.55 }), N);
    const crowdC = ['#e8384f', '#ffd23f', '#2f6fd6', '#3fae5a', '#f4f1e6', '#ff8ae2', '#ff9f43', '#2a2a2a', '#6a4a8a'], skinC = ['#b87a4a', '#c98a5a', '#a86a3a', '#d9a06b'], seats = [];
    for (let n = 0; n < N; n++) { const k = n % 4; seats.push({ x: -12 + ((n * 37) % 240) / 10 + (r() - 0.5) * 0.4, y: 0.42 + k * 0.45, z: -4.6 - k * 0.82, phase: r() * TAU }); bodies.setColorAt(n, new THREE.Color(pick(crowdC))); heads.setColorAt(n, new THREE.Color(pick(skinC))); }
    bodies.castShadow = heads.castShadow = false; bodies.receiveShadow = heads.receiveShadow = true; bodies.userData.dynamic = heads.userData.dynamic = true;
    add(bodies); add(heads);
    glows.push({ crowd: { bodies, heads, seats, bodyY: 0.33, headY: 0.72 } });
    // the back wall, the liga tarp, the hoops, the roof trusses and floodlights
    const wall = T.concrete(33, '#4a5a78', { size: 256, repeat: [8, 3] });
    add(mesh(new THREE.PlaneGeometry(40, 9), tag(std({ map: wall.map, normalMap: wall.normalMap, roughness: 0.9 }), 'hollowblock', 40, 9, { tint: '#9aa8c0' }), { y: 4.5, z: -8.4, cast: false }));
    signBoard(T.sign([['LIGA NG BARANGAY MALINIS', 12], ['ang basketbol ay para sa lahat · 2026', 6, 700]], '#2a58a8', '#ffffff', { w: 1024, h: 200, border: '#ffd23f' }), 7.5, 1.45, { y: 5.4, z: -8.35 });
    const pole = std({ color: '#2a3a52', roughness: 0.4, metalness: 0.7 }), board = new THREE.MeshPhysicalMaterial({ color: '#ffffff', transparent: true, opacity: 0.35, roughness: 0.05, clearcoat: 1 });
    for (const s of [-1, 1]) {
      const x = s * 9.5;
      add(mesh(new THREE.CylinderGeometry(0.1, 0.12, 3.6, 16), pole, { x, y: 1.8, z: -3.2 }));
      add(mesh(new THREE.BoxGeometry(0.9, 0.08, 0.08), pole, { x: x - s * 0.45, y: 3.45, z: -3.2 }));
      add(mesh(roundedBox(0.05, 1.05, 1.8, 0.02), board, { x: x - s * 0.9, y: 3.55, z: -3.2, cast: false }));
      add(mesh(new THREE.TorusGeometry(0.23, 0.018, 10, 28), std({ color: '#ff5a1a', metalness: 0.6, roughness: 0.35 }), { x: x - s * 1.18, y: 3.1, z: -3.2, rx: Math.PI / 2 }));
      add(mesh(new THREE.CylinderGeometry(0.23, 0.14, 0.42, 16, 1, true), std({ color: '#f4f4f4', roughness: 0.9, wireframe: true }), { x: x - s * 1.18, y: 2.88, z: -3.2, cast: false }));
    }
    const truss = std({ color: '#3a3a40', roughness: 0.5, metalness: 0.7 });
    for (let x = -12; x <= 12; x += 3) add(mesh(new THREE.BoxGeometry(0.1, 0.1, 12), truss, { x, y: 7.6, z: -2 }));
    for (let x = -9; x <= 9; x += 6) { add(mesh(roundedBox(0.9, 0.18, 0.5, 0.03), std({ color: '#fff8e8', emissive: '#fff4e0', emissiveIntensity: 3 }), { x, y: 7.35, z: -1.5, cast: false })); }
  } else if (id === 'palengke') {
    // Divisoria in the morning: a wet concrete floor, stalls under striped awnings, fruit, fish on ice
    Object.assign(L, { hemi: ['#dcecff', '#8a8678', 0.6], sun: ['#fff8ec', 3.2, [4, 10, 6]], rim: ['#dff0ff', 1.3], fog: ['#dce8ee', 18, 60], exposure: 0.85, envSky: ['#7ab8ea', '#eaf4f8', '#6a6a64'] });
    const wet = T.concrete(41, '#8e8e88', { size: TS, repeat: [6, 2] });
    const puddle = T.fbm(256, 128, 40, 3, T.rng(42)), rc = T.canvas(256, 128), rx = rc.getContext('2d'), img = rx.createImageData(256, 128);
    for (let i = 0; i < puddle.length; i++) { const v = puddle[i] > 0.58 ? 30 : 220; img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = 255; }
    rx.putImageData(img, 0, 0);
    const roughMap = T.toTex(rc, { color: false }); roughMap.wrapS = roughMap.wrapT = THREE.RepeatWrapping; roughMap.repeat.set(3, 1);
    ground(wet, { rough: 1, roughMap, far: '#5a5a54', surface: 'market' });
    buildings(-10.5, ['#f2e6d0', '#e8d8a0', '#e0b8a0', '#c8c0e0', '#d8e8d0'], { shops: 0.4 });
    const wood = T.planks(43, { size: 256, repeat: [2, 1], color: '#8a5a32' });
    const woodM = tag(std({ map: wood.map, normalMap: wood.normalMap, roughness: 0.8 }), 'stall', 1, 1);
    const fruitKinds = [
      { color: '#f2b82a', geo: new THREE.SphereGeometry(0.075, 10, 7), s: [1, 1.35, 0.9] }, // mangoes
      { color: '#d6251c', geo: new THREE.SphereGeometry(0.05, 9, 6), s: [1, 0.9, 1] }, // tomatoes
      { color: '#5a2a6a', geo: new THREE.SphereGeometry(0.06, 9, 6), s: [2.2, 1, 1] }, // eggplants
      { color: '#6aa82a', geo: new THREE.SphereGeometry(0.03, 7, 5), s: [1, 1, 1] }, // calamansi
      { color: '#e8c42a', geo: new THREE.TorusGeometry(0.1, 0.028, 6, 8, 1.6), s: [1, 1, 1] }, // bananas
    ];
    const fruitMats = fruitKinds.map((f) => { const fm = new THREE.MeshPhysicalMaterial({ color: f.color, roughness: 0.35, clearcoat: 0.4 }); fm.userData.standIn = true; return fm; }); // real fruit replaces these
    for (let s = 0; s < 7; s++) {
      const x = -12 + s * 4, c = pick(['#d6252c', '#2f5fae', '#2e8a4a', '#e8742a']);
      const aw = T.canvas(256, 64), ax = aw.getContext('2d');
      for (let k = 0; k < 256; k += 32) { ax.fillStyle = c; ax.fillRect(k, 0, 16, 64); ax.fillStyle = '#f4f1e6'; ax.fillRect(k + 16, 0, 16, 64); }
      const awning = new THREE.PlaneGeometry(3.6, 1.9, 24, 4), p = awning.attributes.position;
      for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin(p.getX(i) * 5) * 0.03 + (p.getY(i) < -0.9 ? Math.sin(p.getX(i) * 9) * 0.05 : 0)); // cloth, sagging between the poles
      awning.computeVertexNormals();
      add(mesh(awning, std({ map: T.toTex(aw), roughness: 0.9, side: THREE.DoubleSide }), { x, y: 2.55, z: -3.7, rx: -Math.PI / 2 + 0.3 }));
      for (const px of [-1.7, 1.7]) add(mesh(new THREE.CylinderGeometry(0.04, 0.045, 2.6, 10), woodM, { x: x + px, y: 1.3, z: -2.9 }));
      add(mesh(roundedBox(3.2, 0.1, 1.3, 0.03), woodM, { x, y: 0.82, z: -3.7 }));
      for (const [dx, dz] of [[-1.4, -0.5], [1.4, -0.5], [-1.4, 0.5], [1.4, 0.5]]) add(mesh(new THREE.BoxGeometry(0.08, 0.8, 0.08), woodM, { x: x + dx, y: 0.4, z: -3.7 + dz }));
      if (s === 3) { // fish on ice
        add(mesh(roundedBox(3.0, 0.12, 1.1, 0.04), new THREE.MeshPhysicalMaterial({ color: '#eef6fa', roughness: 0.15, transmission: 0.2, clearcoat: 1 }), { x, y: 0.93, z: -3.7 }));
        const fishM = new THREE.MeshPhysicalMaterial({ color: '#a8b4bc', metalness: 0.6, roughness: 0.25, clearcoat: 1 });
        for (let n = 0; n < 14; n++) add(mesh(new THREE.SphereGeometry(0.06, 10, 7), fishM, { cast: false, x: x - 1.2 + (n % 7) * 0.38, y: 1.0, z: -3.9 + Math.floor(n / 7) * 0.4, sx: 3.2, sy: 0.6, sz: 0.9, ry: (r() - 0.5) * 0.4 }));
      } else {
        for (let n = 0; n < (low ? 24 : 44); n++) { const f = pick(fruitKinds); add(mesh(f.geo, fruitMats[fruitKinds.indexOf(f)], { x: x - 1.35 + r() * 2.7, y: 0.93 + r() * 0.08, z: -3.7 + (r() - 0.5) * 1.0, sx: f.s[0], sy: f.s[1], sz: f.s[2], ry: r() * TAU, rx: f.geo.type === 'TorusGeometry' ? Math.PI / 2 : 0, cast: false })); }
      }
      signBoard(T.sign([[pick(['₱50/KILO', 'SARIWA!', 'BAGSAK-PRESYO', 'SUKI, DITO!', 'TIG-₱20'])], [pick(['mura na!', 'bili na', 'bagong dating']), 6, 700]].map((l) => [l[0], l[1] || 11, l[2]]), '#c9a878', '#2a1a10', { w: 256, h: 96 }), 0.8, 0.3, { x: x + (r() - 0.5), y: 1.15, z: -3.05, rz: (r() - 0.5) * 0.1 });
    }
    for (let k = 0; k < 8; k++) add(mesh(roundedBox(0.6, 0.4, 0.42, 0.03), woodM, { x: -11 + k * 3.1 + r(), y: 0.2 + (k % 3 === 0 ? 0.4 : 0), z: -2.5 }));
    bunting(-2.4, 3.4, ['#ffffff', '#2f6fd6', '#e8384f', '#ffd23f']);
  } else {
    // the balete at midnight: moonlight, mist, a gnarled trunk and its hanging roots, fireflies
    Object.assign(L, { hemi: ['#5a78a8', '#1a2418', 0.45], sun: ['#b8ccff', 2.6, [6, 9, -2]], rim: ['#9aff9a', 1.6], fog: ['#16262a', 10, 34], exposure: 1.3, fill: ['#9ab8ff', 6], envSky: ['#050a14', '#1a2a38', '#0e140c'], cards: [{ dir: [0.3, 0.45, -0.85], color: '#f4f0d0', size: 0.08, power: 6 }] });
    ground(T.dirt(51, { size: TS }), { far: '#1a1a12', surface: 'forest' });
    const bk = T.bark(52, { size: 256 }), barkM = tag(std({ map: bk.map, normalMap: bk.normalMap, normalScale: new THREE.Vector2(1.5, 1.5), roughness: 0.95 }), 'bark', 15, 14);
    // the trunk: a cylinder pushed around by noise, so it's gnarled
    const trunk = new THREE.CylinderGeometry(1.9, 2.8, 14, 40, 24), tp = trunk.attributes.position, tn = T.fbm(64, 32, 8, 3, T.rng(53));
    for (let i = 0; i < tp.count; i++) { const x = tp.getX(i), y = tp.getY(i), z = tp.getZ(i), a = Math.atan2(z, x), u = ((a / TAU + 1) % 1) * 63 | 0, v = ((y + 7) / 14) * 31 | 0, d = 1 + (tn[v * 64 + u] - 0.5) * 0.5; tp.setX(i, x * d); tp.setZ(i, z * d); }
    trunk.computeVertexNormals();
    add(mesh(trunk, barkM, { y: 7, z: -8 }));
    // aerial roots, hanging and curving down into the ground
    for (let k = 0; k < (low ? 12 : 24); k++) {
      const a = Math.PI + (k / 24) * Math.PI + (r() - 0.5) * 0.2, rr = 2.4 + r() * 4.5, x0 = Math.cos(a) * rr * 1.3, z0 = -8 + Math.sin(a) * rr * 0.5;
      const pts = [new THREE.Vector3(x0 * 0.6, 11 + r() * 2, -8 + (z0 + 8) * 0.6), new THREE.Vector3(x0 * 0.85 + (r() - 0.5), 6 + r() * 2, z0 * 0.95), new THREE.Vector3(x0 + (r() - 0.5) * 0.6, 2 + r(), z0), new THREE.Vector3(x0 + (r() - 0.5) * 0.4, -0.1, z0 + (r() - 0.5) * 0.4)];
      add(mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.06 + r() * 0.1, 7), barkM));
    }
    // ground roots crawling out toward the fight
    const rootM = tag(std({ map: bk.map, normalMap: bk.normalMap, normalScale: new THREE.Vector2(1.5, 1.5), roughness: 0.95 }), 'bark', 4, 0.6, { tint: '#6e6054' });
    for (let k = 0; k < 7; k++) { const x0 = -6 + k * 2 + (r() - 0.5), pts = [new THREE.Vector3(x0 * 0.4, 0.3, -6.2), new THREE.Vector3(x0 * 0.7, 0.1, -4.8), new THREE.Vector3(x0 + (r() - 0.5), 0.04, -3.2 - r())]; add(mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, 0.08 + r() * 0.06, 7), rootM)); }
    const lf = T.fbm(256, 256, 12, 3, T.rng(55)), dots = T.noise(256, 256, 3, T.rng(56));
    const leaf = T.paint(256, 256, (x, y) => { const i = y * 256 + x, v = lf[i], d = dots[i] > 0.62 ? 1 : 0; return [18 + v * 34 + d * 14, 34 + v * 52 + d * 22, 14 + v * 18, v + d * 0.6]; }, { repeat: [2, 2], strength: 5 });
    const leafM = std({ map: leaf.map, normalMap: leaf.normalMap, normalScale: new THREE.Vector2(1.4, 1.4), roughness: 0.85 });
    // foliage: spheres pushed around by noise, so no two clumps are the same shape
    const bush = (rad, detail) => { const g = new THREE.IcosahedronGeometry(rad, detail), p = g.attributes.position, v = new THREE.Vector3(), ph = r() * 10; for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); const n = 1 + 0.18 * Math.sin(v.x * 2.1 + ph) * Math.sin(v.y * 2.7 + ph) + 0.1 * Math.sin(v.z * 4.3 - ph); p.setXYZ(i, v.x * n, v.y * n * 0.7, v.z * n); } g.computeVertexNormals(); return g; };
    for (let k = 0; k < (low ? 10 : 18); k++) add(mesh(bush(2.2 + r() * 1.8, 4), leafM, { x: (r() - 0.5) * 22, y: 12 + r() * 3.5, z: -9 + (r() - 0.5) * 5 }));
    const lowLeafM = leafM.clone(); lowLeafM.userData.standIn = true; // real shrubs replace these
    for (let k = 0; k < 16; k++) add(mesh(bush(0.8 + r() * 1.2, 3), lowLeafM, { x: -16 + k * 2.1, y: 0.5, z: -10 - r() * 3 }));
    add(mesh(new THREE.SphereGeometry(1.5, 24, 16), new THREE.MeshBasicMaterial({ color: '#f6f2d8', fog: false }), { x: 10, y: 14, z: -36, cast: false })); // the moon
    // a little shrine: tabi-tabi po, and candles
    const post = std({ map: T.planks(54, { size: 128, color: '#5a3a22' }).map, roughness: 0.9 });
    add(mesh(new THREE.BoxGeometry(0.08, 1.1, 0.08), post, { x: -5, y: 0.55, z: -2.8 }));
    signBoard(T.sign([['TABI-TABI PO', 11]], '#6a5438', '#f4efe0', { w: 256, h: 64 }), 1.2, 0.3, { x: -5, y: 1.1, z: -2.75, rz: 0.06 });
    for (let k = 0; k < 3; k++) {
      add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.2 + k * 0.05, 10), std({ color: '#f4efe0', roughness: 0.6 }), { x: -4.6 + k * 0.12, y: 0.1 + k * 0.025, z: -2.6 }));
      const flame = mesh(new THREE.SphereGeometry(0.018, 8, 6), new THREE.MeshBasicMaterial({ color: '#ffcf6a' }), { x: -4.6 + k * 0.12, y: 0.22 + k * 0.05, z: -2.6, sy: 1.8, cast: false });
      flame.userData.dynamic = true; glows.push({ flame }); add(flame);
    }
    const candle = new THREE.PointLight('#ffb05a', 2.5, 5, 2); candle.position.set(-4.5, 0.4, -2.4); candle.userData.dynamic = true; glows.push({ candle }); add(candle);
    const glowTex = (() => { const cv = T.canvas(64, 64), x = cv.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(230,255,150,1)'); g.addColorStop(0.3, 'rgba(180,255,90,0.5)'); g.addColorStop(1, 'rgba(120,255,60,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64); return T.toTex(cv); })();
    for (let k = 0; k < (low ? 24 : 50); k++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); s.position.set((r() - 0.5) * 18, 0.4 + r() * 3.2, -1 - r() * 6); s.scale.setScalar(0.12 + r() * 0.1); s.userData = { phase: r() * TAU, dynamic: true }; glows.push({ fly: s }); add(s); }
  }
  mergeStatic(group);
  return { group, light: L, glows };
}
