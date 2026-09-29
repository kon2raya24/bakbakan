// Real surroundings: CC0 scans from Poly Haven (converted by tools/env.html) dressed onto each stage.
// - a photographed sky lights and reflects everything
// - the big surfaces (road, floor, bleachers, walls, bark, ground) get scanned materials
// - real props stand where a street, a court, a market or a forest would have them
// Each stage loads only what it uses. Without the files, the painted stage stays as it is.
import * as THREE from './vendor/three.module.min.js';
import { GLTFLoader } from './vendor/three-mocap.min.js';
import { HDRLoader } from './vendor/three-fx.min.js';

// the sky for each stage, its strength, and a turn so its sun sits behind the key light
const SKY = {
  terminal: ['sunset_jhbcentral', 0.55, 2.2],
  court: ['basement_boxing_ring', 0.45, 0],
  palengke: ['leadenhall_market', 0.6, 0.6],
  balete: ['narrow_moonlit_road', 0.7, 3.4],
};

// [prop, x, y, z, turn, scale]; y is the ground under it
const PLACES = {
  terminal: [
    // the sidewalk: waiting passengers' bench, chairs, a carinderia's crates and gas, rubbish
    ['painted_wooden_bench', -0.9, 0.16, -3.85, 0, 1], ['plastic_monobloc_chair_01', -3.3, 0.16, -3.4, 0.5, 1], ['plastic_monobloc_chair_01', -2.6, 0.16, -3.95, -0.4, 1],
    ['plastic_crate_02', 4.6, 0.16, -3.4, 0.1, 1], ['plastic_crate_02', 4.62, 0.41, -3.42, -0.05, 1], ['plastic_crate_01', 5.25, 0.16, -3.7, 0.4, 1], ['plastic_bottle_gallon', 4.55, 0.66, -3.4, 0.3, 1],
    ['small_lpg_tank', 3.8, 0.16, -3.95, 0, 1], ['plastic_jerrycan', 5.95, 0.16, -3.95, -0.6, 1], ['wooden_stool_01', 3.1, 0.16, -3.3, 0.3, 1],
    ['cardboard_box_01', -5.8, 0.16, -3.55, 0.3, 1], ['cardboard_box_01', -5.75, 0.5, -3.6, -0.2, 0.9], ['trashbag', -6.4, 0.16, -3.2, 0.8, 1], ['trashbag', -6.9, 0.16, -3.6, 2.1, 0.9],
    ['old_tyre', -7.9, 0.16, -3.9, 0.2, 1], ['metal_trash_can', -10, 0.16, -3.8, 0, 1], ['utility_box_02', 2.2, 0.16, -4.15, 0, 1],
    ['street_lamp_01', -4.4, 0.16, -4.25, 0, 1.2], ['street_lamp_01', 9.2, 0.16, -4.25, 0, 1.2],
    ['water_manhole_cover', 1.8, 0.004, 1.3, 0.4, 1], ['concrete_road_barrier', 10.5, 0, -2.0, 0.1, 1], ['concrete_road_barrier', -11.8, 0, -1.8, -0.1, 1],
    // the shops behind
    ['rollershutter_door', -3.2, 0, -9.85, 0, 1], ['rollershutter_window_01', 5.2, 0.2, -9.85, 0, 1], ['exterior_aircon_unit', -6.5, 3.4, -9.8, 0, 0.8], ['exterior_aircon_unit', 2.5, 6.4, -9.8, 0, 0.8],
  ],
  court: [
    // the officials' table, the barangay's sound system, water for the players
    ['WoodenTable_01', 0, 0, -3.35, 0, 1], ['plastic_monobloc_chair_01', -0.7, 0, -3.95, Math.PI, 1], ['plastic_monobloc_chair_01', 0.7, 0, -3.95, Math.PI + 0.2, 1],
    ['boombox', -0.5, 'table', -3.3, 0.2, 1], ['Megaphone_01', 0.55, 'table', -3.35, -0.6, 1],
    ['plastic_bottle_gallon', 1.8, 0, -3.5, 0, 1.3], ['plastic_bottle_gallon', 2.05, 0, -3.62, 0.5, 1.3], ['plastic_crate_03', -3.4, 0, -3.6, 0.2, 1], ['plastic_crate_03', -3.42, 0.27, -3.6, -0.1, 1],
    ['plastic_monobloc_chair_01', -7.2, 0, -3.55, 0.3, 1], ['plastic_monobloc_chair_01', -6.4, 0, -3.7, -0.1, 1], ['plastic_monobloc_chair_01', 6.8, 0, -3.6, -0.2, 1],
    ['WetFloorSign_01', 5.3, 0, -2.6, 0.5, 1], ['plastic_broom', 7.8, 0, -3.8, 0.3, 1],
    ['mounted_fluorescent_lights', -6, 7.25, -1.5, 0, 1.2], ['mounted_fluorescent_lights', 0, 7.25, -1.5, 0, 1.2], ['mounted_fluorescent_lights', 6, 7.25, -1.5, 0, 1.2],
  ],
  palengke: [
    // vendors' seats and stock behind and between the stalls
    ['plastic_monobloc_chair_01', -8.6, 0, -4.9, Math.PI + 0.3, 1], ['plastic_monobloc_chair_01', 4.3, 0, -4.9, Math.PI - 0.2, 1], ['metal_stool_01', -3.6, 0, -4.8, 0, 1], ['wooden_stool_01', 8.4, 0, -4.8, 0.4, 1],
    ['plastic_crate_01', -10.3, 0, -2.6, 0.2, 1], ['plastic_crate_01', -10.28, 0.26, -2.62, -0.1, 1], ['plastic_crate_03', -6, 0, -2.5, 0.4, 1], ['plastic_crate_02', 2.1, 0, -2.6, -0.2, 1], ['plastic_crate_02', 2.12, 0.25, -2.6, 0.1, 1],
    ['wooden_crate_01', 6.1, 0, -2.6, 0.1, 1], ['wooden_crate_02', 10.2, 0, -2.5, 1.5, 1], ['cardboard_box_01', -1.8, 0, -2.4, 0.5, 1], ['cardboard_box_01', -1.75, 0.34, -2.45, -0.1, 0.9],
    ['wooden_bucket_01', 1.3, 0, -2.9, 0, 1], ['wicker_basket_02', -6.8, 0, -2.9, 0.4, 1], ['plastic_jerrycan', 11.2, 0, -3.1, 0.6, 1], ['trashbag', -12.4, 0, -2.6, 0.2, 1],
    ['rollershutter_door', -4.5, 0, -10.35, 0, 1], ['rollershutter_door', 7.5, 0, -10.35, 0, 1], ['exterior_aircon_unit', 1.5, 3.6, -10.3, 0, 0.8],
  ],
  balete: [
    // around the trunk: its roots, a fallen trunk, a stump, mossy stones
    ['root_cluster_01', -1.9, 0, -7.2, 0.4, 0.75], ['root_cluster_02', 2.4, 0, -6.9, -0.6, 1.1], ['pine_roots', 0.4, 0, -5.4, 1.2, 1.6], ['pine_roots', -4.2, 0, -5.2, 2.6, 1.3],
    ['dead_tree_trunk_02', 7.4, 0, -5.2, 0.35, 0.9], ['dead_tree_trunk', -7.8, 0, -3.4, -0.2, 1], ['tree_stump_01', -9.4, 0, -5.6, 0, 1],
    ['rock_moss_set_01~2', 5.2, 0, -4.6, 0.8, 0.45], ['rock_moss_set_01~3', -6.2, 0, -6.4, 2.1, 0.5], ['rock_moss_set_01~5', 10.5, 0, -3.8, 1.1, 0.4],
    // ferns, shrubs and flowers on the forest floor, and the shrine's lantern
    ['fern_02~0', -5.8, 0, -3.3, 0, 1.3], ['fern_02~1', 8.6, 0, -3.1, 1.3, 1.3], ['fern_02~2', -1.8, 0, -4.4, 2.2, 1.4], ['fern_02~3', 3.3, 0, -4.9, 0.7, 1.5], ['fern_02~0', 11.4, 0, -5.6, 2.4, 1.2], ['fern_02~1', -11.2, 0, -4.4, 0.6, 1.2],
    ['shrub_02~0', -10.4, 0, -7.4, 0, 1], ['shrub_02~1', 10.8, 0, -7.8, 1, 1.1], ['shrub_02~2', 5.6, 0, -9.2, 2, 1], ['shrub_02~3', -5.6, 0, -9.4, 0.5, 1.1],
    ['bark_debris_01', 1.6, 0, -2.3, 0.4, 1], ['dry_branches_medium_01', -3.4, 0, -2.0, 1.1, 1], ['dry_branches_medium_01', 5.6, 0, -2.5, -0.3, 0.9],
    ['wooden_lantern_01', -4.25, 0, -2.55, 0.3, 1], ['periwinkle_plant~3', -5.5, 0, -2.45, 0, 1.4], ['periwinkle_plant~5', -3.8, 0, -2.9, 0.6, 1.3], ['anthurium_botany_01~0', -6.6, 0, -2.9, 0.2, 1.3],
    ['island_tree_01', -13, 0, -14, 0, 1.3], ['island_tree_02', 14, 0, -15, 1, 1.4],
  ],
};
// piles of fruit on the palengke's tables: [prop, how many, table x], heaped on the table top
const PILES = [['bananas', 7, -12], ['food_lime_01', 60, -12], ['yellow_onion', 45, -8], ['food_ginger_01', 10, -8], ['sweet_potato', 40, -4], ['lemon', 30, -4], ['food_apple_01', 40, 4], ['food_avocado_01', 28, 4], ['food_pomegranate_01', 24, 8], ['food_lychee_01', 70, 8], ['bananas', 8, 12], ['food_lime_01', 50, 12]];
const TABLE_Y = 0.87, TABLE_Z = -3.7;

// what each tagged surface becomes: [Poly Haven material, metres a tile covers, roughness factor]
const SURF = {
  asphalt: ['asphalt_02', 3, 1], kerb: ['concrete_pavement', 1.5, 1], roof: ['corrugated_iron_02', 2, 0.8],
  court: ['wood_floor_worn', 2.5, 0.62], bleacher: ['concrete_floor_worn_001', 2, 1], hollowblock: ['concrete_block_wall', 2.4, 1],
  market: ['concrete_floor_damaged_01', 3, 1], stall: ['weathered_plank_siding', 1.5, 1],
  forest: ['brown_mud_leaves_01', 3, 1], bark: ['bark_willow_02', 2.5, 1],
};

export async function loadEnv(base = 'assets/env/') {
  const res = await fetch(base + 'env.json');
  if (!res.ok) throw new Error('no env');
  return { base, index: await res.json(), props: new Map(), tex: new Map(), sky: new Map() };
}

const gltf = new GLTFLoader(), texLoader = new THREE.TextureLoader();
const loadProp = (env, id) => {
  if (!env.index.props[id]) return Promise.resolve(null);
  if (!env.props.has(id)) env.props.set(id, gltf.loadAsync(env.base + 'props/' + id + '.glb').then((g) => g.scene).catch(() => null));
  return env.props.get(id);
};
const loadTex = (env, id) => {
  const t = env.index.tex[id];
  if (!t) return Promise.resolve(null);
  if (!env.tex.has(id)) env.tex.set(id, Promise.all(['diff', 'nor', 'arm', 'rough'].map((k) => (t[k] ? texLoader.loadAsync(env.base + t[k]).catch(() => null) : null))).then(([diff, nor, arm, rough]) => {
    if (diff) diff.colorSpace = THREE.SRGBColorSpace;
    for (const x of [diff, nor, arm, rough]) if (x) { x.wrapS = x.wrapT = THREE.RepeatWrapping; x.anisotropy = 8; }
    return { diff, nor, arm, rough };
  }));
  return env.tex.get(id);
};

// Dress the stage that's up now. `ctx` is the view: scene, renderer, the stage and whether it's still current.
export async function dress(env, id, stage, ctx) {
  const [skyId, skyPower, skyTurn] = SKY[id] || [];
  const jobs = [];
  // the sky
  if (skyId && env.index.sky[skyId]) jobs.push((async () => {
    if (!env.sky.has(skyId)) env.sky.set(skyId, new HDRLoader().loadAsync(env.base + env.index.sky[skyId]).then((t) => { t.mapping = THREE.EquirectangularReflectionMapping; const rt = ctx.pmrem.fromEquirectangular(t); t.dispose(); return rt; }).catch(() => null));
    const rt = await env.sky.get(skyId);
    if (rt && ctx.current()) ctx.setEnvironment(rt.texture, skyPower, skyTurn);
  })());
  // the surfaces
  const mats = new Map();
  stage.group.traverse((o) => { if (o.isMesh) for (const m of [].concat(o.material)) if (m.userData.surface) mats.set(m, m.userData.surface); });
  for (const [m, s] of mats) jobs.push((async () => {
    const [texId, tile, rough] = SURF[s.kind] || [];
    const t = texId && (await loadTex(env, texId));
    if (!t || !t.diff || !ctx.current()) return;
    const rep = [s.w / tile, s.h / tile], use = (x) => { if (!x) return null; const c = x.clone(); c.repeat.set(...rep); if (s.rot) c.rotation = s.rot; c.needsUpdate = true; return c; };
    m.map = use(t.diff); m.normalMap = use(t.nor); m.normalScale = new THREE.Vector2(1, 1);
    if (t.arm) { m.roughnessMap = use(t.arm); m.aoMap = use(t.arm); m.aoMapIntensity = 0.8; m.metalnessMap = null; m.metalness = 0; }
    else if (t.rough) m.roughnessMap = use(t.rough);
    if (s.keepRough) m.roughnessMap = s.keepRough;
    m.roughness = s.keepRough ? 1 : rough; m.color.set(s.tint || '#ffffff');
    m.needsUpdate = true;
  })());
  // the props
  const place = PLACES[id] || [];
  const table = env.index.props.WoodenTable_01 ? env.index.props.WoodenTable_01.size[1] : 0.75;
  const group = new THREE.Group(); group.name = 'real props';
  for (const [pid, x, y, z, ry, s] of place) jobs.push(loadProp(env, pid).then((tpl) => {
    if (!tpl || !ctx.current()) return;
    const o = tpl.clone(); o.position.set(x, y === 'table' ? table : y, z); o.rotation.y = ry; o.scale.setScalar(s);
    o.traverse((c) => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; } });
    group.add(o);
  }));
  let piles = 0, hidePainted = false;
  if (id === 'balete') for (let k = 0; k < 4; k++) jobs.push(loadProp(env, `shrub_02~${k}`).then((tpl) => {
    if (!tpl || !ctx.current()) return;
    const d = new THREE.Object3D(), mats = [];
    for (let i = 0; i < 5; i++) { d.position.set(-17 + (i * 4 + k) * 1.75, 0, -10.2 - ((i * 7 + k * 3) % 5) * 0.6); d.rotation.set(0, i * 1.7 + k, 0); d.scale.setScalar(1.1 + ((i + k) % 3) * 0.25); d.updateMatrix(); mats.push(d.matrix.clone()); }
    group.add(instanced(tpl, mats)); hidePainted = true;
  }));
  if (id === 'balete') for (const [k, n] of [[1, 36], [2, 30], [7, 30], [8, 24], [9, 20]]) jobs.push(loadProp(env, `grass_medium_01~${k}`).then((tpl) => { if (tpl && ctx.current()) group.add(scatter(tpl, n, k)); }));
  if (id === 'palengke') for (const [pid, n, tx] of PILES) jobs.push(loadProp(env, pid).then((tpl) => { if (tpl && ctx.current()) { group.add(pile(tpl, n, tx, pid)); piles++; } }));
  await Promise.all(jobs);
  if (!ctx.current()) return false;
  group.traverse((o) => { o.userData.shared = true; });
  stage.group.add(group);
  // the painted stand-ins the real ones replace
  if (piles >= PILES.length / 2 || hidePainted) stage.group.traverse((o) => { if (o.isMesh && [].concat(o.material).some((m) => m.userData.standIn)) o.visible = false; });
  return true;
}

// grass across the forest floor, thicker away from where the fighters stand
function scatter(tpl, n, seed0) {
  let seed = seed0 * 7919 + 13; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const d = new THREE.Object3D(), mats = [];
  for (let k = 0; k < n; k++) { const x = (rnd() - 0.5) * 26, z = -1.2 - rnd() * 8 - (Math.abs(x) < 6 ? 0 : -1.2 * rnd()); d.position.set(x, 0, z); d.rotation.set(0, rnd() * Math.PI * 2, 0); d.scale.setScalar(1.4 + rnd() * 1.4); d.updateMatrix(); mats.push(d.matrix.clone()); }
  return instanced(tpl, mats);
}
function instanced(tpl, mats) {
  const g = new THREE.Group(); tpl.updateMatrixWorld(true);
  tpl.traverse((p) => { if (!p.isMesh) return; const im = new THREE.InstancedMesh(p.geometry, p.material, mats.length), local = p.matrixWorld.clone(); mats.forEach((m, i) => im.setMatrixAt(i, m.clone().multiply(local))); im.castShadow = false; im.receiveShadow = true; g.add(im); });
  return g;
}

// a heap of one fruit on a table: instanced, each one turned and settled a little differently
function pile(tpl, n, tx, pid) {
  const g = new THREE.Group();
  tpl.updateMatrixWorld(true);
  const parts = []; tpl.traverse((o) => { if (o.isMesh) parts.push(o); });
  const size = new THREE.Box3().setFromObject(tpl).getSize(new THREE.Vector3());
  const half = pid === 'bananas' ? 0.55 : 0.62, d = new THREE.Object3D(), mats = [];
  let seed = Math.abs(Math.round(tx * 131 + n * 7)) + 1; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const side = PILES.filter((p) => p[2] === tx)[0][0] === pid ? -1 : 1; // two kinds share a table, left and right
  for (let k = 0; k < n; k++) {
    // a mound: more in the middle, stacked higher there
    const u = rnd(), v = rnd(), rr = Math.sqrt(u) * half, a = v * Math.PI * 2;
    const x = tx + side * 0.7 + Math.cos(a) * rr * 1.1, z = TABLE_Z + Math.sin(a) * rr * 0.4, h = (1 - rr / half) * Math.max(size.y, 0.05) * 1.6;
    d.position.set(x, TABLE_Y + h * rnd(), z); d.rotation.set((rnd() - 0.5) * 0.8, rnd() * Math.PI * 2, (rnd() - 0.5) * 0.8); d.scale.setScalar(0.9 + rnd() * 0.2); d.updateMatrix();
    mats.push(d.matrix.clone());
  }
  for (const p of parts) {
    const im = new THREE.InstancedMesh(p.geometry, p.material, n);
    const local = p.matrixWorld.clone();
    mats.forEach((m, i) => im.setMatrixAt(i, m.clone().multiply(local)));
    im.castShadow = true; im.receiveShadow = true; g.add(im);
  }
  return g;
}
