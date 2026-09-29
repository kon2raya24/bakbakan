// The fighters of Bakbakan sa Kanto, as data: stats, looks and every move's frame data. Frames are
// 1/60 s; boxes are [x0, x1, y0, y1] in metres, relative to the fighter's feet, facing right.
//
// A move: startup / active / recovery frames; dmg; stun (hitstun) and bstun (blockstun) frames; the
// hitbox; guard (mid: any block, low: crouch block only, high: standing block only); push (metres of
// pushback); kd (knocks down); launch (pops the other fighter up); hits (spread over the active frames);
// vx ([frame, speed] lunges, forward); inv ([from, to] frames that can't be hit); proj (a projectile it
// throws); cancel ('chain' lights chain into anything, 'special' normals cancel into specials).

const normals = (o = {}) => ({
  L5: { name: 'Suntok', anim: 'jab', startup: 4, active: 3, recovery: 8, dmg: 30, stun: 14, bstun: 10, box: [0.25, 0.85, 0.9, 1.4], guard: 'mid', push: 0.18, cancel: 'chain', ...o.L5 },
  H5: { name: 'Lakas', anim: 'straight', startup: 8, active: 4, recovery: 17, dmg: 75, stun: 21, bstun: 15, box: [0.25, 1.05, 0.95, 1.5], guard: 'mid', push: 0.3, cancel: 'special', ...o.H5 },
  L2: { name: 'Mababa', anim: 'lowJab', startup: 5, active: 3, recovery: 8, dmg: 25, stun: 13, bstun: 9, box: [0.25, 0.9, 0.05, 0.45], guard: 'low', push: 0.15, cancel: 'chain', crouch: true, ...o.L2 },
  H2: { name: 'Walis', anim: 'sweep', startup: 9, active: 4, recovery: 21, dmg: 70, stun: 20, bstun: 14, box: [0.2, 1.15, 0.0, 0.35], guard: 'low', push: 0.3, kd: true, crouch: true, cancel: 'special', ...o.H2 },
  LJ: { name: 'Talon', anim: 'airJab', startup: 4, active: 7, recovery: 4, dmg: 40, stun: 15, bstun: 11, box: [0.1, 0.75, 0.35, 0.95], guard: 'high', push: 0.15, air: true, ...o.LJ },
  HJ: { name: 'Talong Sipa', anim: 'airKick', startup: 7, active: 6, recovery: 6, dmg: 70, stun: 20, bstun: 14, box: [0.15, 0.95, 0.15, 0.8], guard: 'high', push: 0.25, air: true, ...o.HJ },
  T: { name: 'Hagis', anim: 'throw', startup: 3, active: 2, recovery: 22, dmg: 110, throw: true, range: 0.95, ...o.T },
});

export const ROSTER = [
  {
    id: 'lakan', name: 'Lakan', title: 'Ang Arnisador', from: 'Batangas', style: 'Arnis', blurb: 'Balanced. Twin baston, a rush, an anti-air and a thrown stick.',
    hp: 1000, speed: 1, colors: { skin: '#c98a5a', top: '#f4f1e6', bottom: '#2a2a3a', accent: '#e8384f', hair: '#1b1320' }, prop: 'baston', build: 1,
    moves: {
      ...normals({ L5: { name: 'Tusok', anim: 'stickJab' }, H5: { name: 'Hampas', anim: 'stickSwing', box: [0.25, 1.25, 0.9, 1.6], dmg: 80 } }),
      QCF: { name: 'Sinawali', anim: 'flurry', startup: 9, active: 18, recovery: 18, dmg: 32, hits: 3, stun: 16, bstun: 12, box: [0.25, 1.1, 0.8, 1.55], guard: 'mid', push: 0.12, vx: [[9, 0.07], [27, 0]], kd: true, special: true, chip: 0.15 },
      DP: { name: 'Pasok', anim: 'rising', startup: 3, active: 9, recovery: 24, dmg: 110, stun: 30, bstun: 18, box: [0.1, 0.8, 0.8, 2.3], guard: 'mid', push: 0.2, inv: [1, 8], launch: 0.13, kd: true, special: true, chip: 0.15 },
      QCB: { name: 'Hagis Baston', anim: 'toss', startup: 12, active: 1, recovery: 22, special: true, proj: { at: 12, vx: 0.13, box: [-0.25, 0.25, 0.75, 1.1], dmg: 60, stun: 20, bstun: 14, life: 70, kind: 'baston', chip: 0.15 } },
      SUPER: { name: 'Sinawali Bagyo', anim: 'flurry', startup: 6, active: 30, recovery: 22, dmg: 42, hits: 8, stun: 18, bstun: 12, box: [0.2, 1.25, 0.6, 1.7], guard: 'mid', push: 0.08, vx: [[6, 0.1], [36, 0]], inv: [1, 12], kd: true, special: true, super: true, chip: 0.25 },
    },
  },
  {
    id: 'dalisay', name: 'Dalisay', title: 'Ang Sikaran', from: 'Baras, Rizal', style: 'Sikaran', blurb: 'Fast kicks, no projectile: get in close and stay there.',
    hp: 950, speed: 1.18, colors: { skin: '#d9a06b', top: '#e8384f', bottom: '#1f2a4a', accent: '#ffd23f', hair: '#1b1320' }, prop: 'none', build: 0.92, long: true,
    moves: {
      ...normals({ L5: { name: 'Tadyak', anim: 'lowKickHigh', box: [0.25, 0.95, 0.9, 1.35], startup: 4 }, H5: { name: 'Bira', anim: 'roundhouse', box: [0.25, 1.2, 1.0, 1.65], dmg: 70, startup: 7 }, H2: { anim: 'sweep', dmg: 65, startup: 8 } }),
      QCF: { name: 'Sikad', anim: 'flyKick', startup: 8, active: 10, recovery: 16, dmg: 90, stun: 22, bstun: 14, box: [0.3, 1.1, 0.8, 1.4], guard: 'mid', push: 0.35, vx: [[8, 0.17], [18, 0.02]], kd: true, special: true, chip: 0.15 },
      DP: { name: 'Lipad na Sipa', anim: 'risingKick', startup: 4, active: 10, recovery: 22, dmg: 105, stun: 30, bstun: 18, box: [0.05, 0.85, 0.9, 2.4], guard: 'mid', push: 0.2, inv: [1, 7], launch: 0.14, kd: true, special: true, chip: 0.15 },
      QCB: { name: 'Ikot', anim: 'spinKick', startup: 14, active: 5, recovery: 16, dmg: 80, stun: 22, bstun: 12, box: [0.2, 1.15, 0.6, 1.3], guard: 'high', push: 0.3, vx: [[4, 0.05], [19, 0]], kd: true, special: true, chip: 0.15 },
      SUPER: { name: 'Sikaran ng Bagyo', anim: 'flurryKick', startup: 5, active: 28, recovery: 22, dmg: 40, hits: 9, stun: 18, bstun: 12, box: [0.2, 1.2, 0.5, 1.8], guard: 'mid', push: 0.06, vx: [[5, 0.13], [33, 0]], inv: [1, 12], kd: true, special: true, super: true, chip: 0.25 },
    },
  },
  {
    id: 'tanod', name: 'Mang Tanod', title: 'Ang Bantay ng Barangay', from: 'Tondo', style: 'Batuta at Flashlight', blurb: 'Slow but tough. Long batuta, a flashlight beam and a whistle.',
    hp: 1150, speed: 0.85, colors: { skin: '#b87a4a', top: '#2f6fd6', bottom: '#2a2a2a', accent: '#ffd23f', hair: '#2a2a2a' }, prop: 'batuta', build: 1.12,
    moves: {
      ...normals({ L5: { name: 'Tulak', dmg: 35, startup: 5 }, H5: { name: 'Batuta', anim: 'stickSwing', box: [0.25, 1.35, 0.9, 1.6], dmg: 90, startup: 10, recovery: 19 }, H2: { box: [0.2, 1.3, 0.0, 0.35], dmg: 80, startup: 11 } }),
      QCF: { name: 'Silaw', anim: 'shine', startup: 13, active: 1, recovery: 20, special: true, proj: { at: 13, vx: 0.2, box: [-0.35, 0.35, 0.7, 1.2], dmg: 55, stun: 20, bstun: 14, life: 45, kind: 'silaw', chip: 0.15 } },
      DP: { name: 'Pito!', anim: 'whistle', startup: 4, active: 8, recovery: 26, dmg: 95, stun: 28, bstun: 18, box: [-0.6, 1.0, 0.0, 2.3], guard: 'mid', push: 0.4, inv: [1, 8], launch: 0.1, kd: true, special: true, chip: 0.15 },
      QCB: { name: 'Batuta Bagsak', anim: 'overhead', startup: 18, active: 5, recovery: 18, dmg: 110, stun: 24, bstun: 14, box: [0.25, 1.3, 0.2, 1.8], guard: 'high', push: 0.25, vx: [[6, 0.05], [20, 0]], kd: true, special: true, chip: 0.15 },
      SUPER: { name: 'Ronda', anim: 'flurry', startup: 8, active: 30, recovery: 24, dmg: 48, hits: 7, stun: 18, bstun: 12, box: [0.2, 1.4, 0.4, 1.8], guard: 'mid', push: 0.08, vx: [[8, 0.08], [38, 0]], inv: [1, 14], kd: true, special: true, super: true, chip: 0.25 },
    },
  },
  {
    id: 'balut', name: 'Boy Balut', title: 'Ang Magbabalut', from: 'Pateros', style: 'Diskarte sa Kalye', blurb: 'Tricky. Lobbed balut, a spinning basket and a sneaky slide.',
    hp: 1000, speed: 1.1, colors: { skin: '#c48450', top: '#ffd23f', bottom: '#3a5a2a', accent: '#8a5a2b', hair: '#1b1320' }, prop: 'basket', build: 0.95,
    moves: {
      ...normals({ H5: { name: 'Buslo', anim: 'basketSwing', box: [0.2, 1.15, 0.8, 1.55], dmg: 82 } }),
      QCF: { name: 'Baluuut!', anim: 'lob', startup: 11, active: 1, recovery: 20, special: true, proj: { at: 11, vx: 0.09, vy: 0.12, gravity: 0.006, box: [-0.25, 0.25, -0.25, 0.25], dmg: 70, stun: 22, bstun: 14, life: 90, kind: 'balut', arc: true, chip: 0.15 } },
      DP: { name: 'Tinda Ikot', anim: 'spinUp', startup: 5, active: 12, recovery: 22, dmg: 38, hits: 3, stun: 22, bstun: 14, box: [-0.4, 0.9, 0.6, 2.1], guard: 'mid', push: 0.15, inv: [1, 6], launch: 0.12, kd: true, special: true, chip: 0.15 },
      QCB: { name: 'Penoy Slide', anim: 'slide', startup: 6, active: 12, recovery: 18, dmg: 80, stun: 22, bstun: 14, box: [0.1, 1.0, 0.0, 0.4], guard: 'low', push: 0.3, vx: [[7, 0.15], [19, 0]], kd: true, special: true, crouch: true, chip: 0.15 },
      SUPER: { name: 'Ulan ng Balut', anim: 'lob', startup: 6, active: 1, recovery: 30, special: true, super: true, inv: [1, 8], proj: { at: 6, vx: 0.11, box: [-0.4, 0.4, 0.2, 1.8], dmg: 50, stun: 18, bstun: 12, life: 60, kind: 'ulan', hits: 6, chip: 0.25 } },
    },
  },
  {
    id: 'kapre', name: 'Kapre', title: 'Ang Higante ng Balete', from: 'Puno ng Balete', style: 'Lakas ng Gubat', blurb: 'The boss. Huge, slow, and he grabs.', boss: true,
    hp: 1350, speed: 0.72, colors: { skin: '#5a3a24', top: '#3f5a2a', bottom: '#2a3a1a', accent: '#ff9f43', hair: '#1a1a12' }, prop: 'tabako', build: 1.45,
    moves: {
      ...normals({ L5: { dmg: 45, startup: 6, box: [0.3, 1.1, 1.3, 1.9] }, H5: { name: 'Palo', anim: 'hammer', dmg: 95, startup: 13, recovery: 22, box: [0.3, 1.5, 1.0, 2.2] }, L2: { dmg: 35, box: [0.3, 1.05, 0.05, 0.5] }, H2: { dmg: 95, startup: 12, box: [0.3, 1.5, 0.0, 0.45] }, T: { dmg: 150, range: 1.15 } }),
      QCF: { name: 'Usok', anim: 'smoke', startup: 16, active: 1, recovery: 24, special: true, proj: { at: 16, vx: 0.06, box: [-0.5, 0.5, 0.3, 1.8], dmg: 70, stun: 24, bstun: 16, life: 120, kind: 'usok', chip: 0.2 } },
      DP: { name: 'Ugat', anim: 'stomp', startup: 10, active: 10, recovery: 26, dmg: 100, stun: 30, bstun: 18, box: [0.4, 1.9, 0.0, 2.2], guard: 'low', push: 0.3, inv: [1, 9], launch: 0.13, kd: true, special: true, chip: 0.2 },
      QCB: { name: 'Buhat', anim: 'grab', startup: 11, active: 3, recovery: 34, dmg: 150, throw: true, range: 1.25, special: true },
      SUPER: { name: 'Galit ng Kapre', anim: 'hammer', startup: 8, active: 24, recovery: 28, dmg: 70, hits: 5, stun: 20, bstun: 14, box: [0.2, 1.8, 0.0, 2.4], guard: 'mid', push: 0.1, vx: [[8, 0.06], [32, 0]], inv: [1, 14], kd: true, special: true, super: true, chip: 0.25 },
    },
  },
];

export const STAGES = [
  { id: 'terminal', name: 'Jeepney Terminal', place: 'Cubao', time: 'hapon', sky: ['#ff9a5c', '#ffd79a'] },
  { id: 'court', name: 'Covered Court', place: 'Barangay Malinis', time: 'gabi', sky: ['#1a1f4a', '#3a3a6a'] },
  { id: 'palengke', name: 'Palengke', place: 'Divisoria', time: 'umaga', sky: ['#8fd0ff', '#e8f6ff'] },
  { id: 'balete', name: 'Puno ng Balete', place: 'Sa Gubat', time: 'hatinggabi', sky: ['#0a0f1a', '#1a2a2a'] },
];

export const byId = (id) => ROSTER.find((c) => c.id === id) || ROSTER[0];
