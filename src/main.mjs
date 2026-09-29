// The page: menus, modes (arcade, versus, training), input for two players (keyboard, gamepads, touch),
// the HUD and saves. The rules live in fight.mjs, the CPU in ai.mjs and the 3D in view3d.mjs.
import { createMatch, tick, NOIN, ROUND, METER } from './fight.mjs';
import { createAI, aiInput, LEVELS } from './ai.mjs';
import { ROSTER, STAGES, byId } from './roster.mjs';
import { createView } from './view3d.mjs';
import { loadMocap } from './mocap.mjs';
import { loadCrowd } from './crowd.mjs';
import { loadEnv } from './envpack.mjs';
import { createAudio } from './audio.mjs';

const Q = new URLSearchParams(location.search);
const TEST = Q.get('test') === '1';
const KEY = 'bakbakan.v1';
const store = {
  get() { if (TEST) return null; try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; } },
  set(v) { if (TEST) return; try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* storage unavailable: play on */ } },
};
const touch = matchMedia('(pointer: coarse)').matches;
const saved = store.get() || {};
const data = {
  diff: LEVELS[saved.diff] ? saved.diff : 'madali', muted: !!saved.muted, how: !!saved.how, unlocked: !!saved.unlocked,
  best: saved.best && typeof saved.best === 'object' ? saved.best : {},
};
const persist = () => store.set(data);
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = (id) => document.getElementById(id);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const seed = () => (TEST && Q.get('seed') ? Number(Q.get('seed')) : Math.floor(Math.random() * 1e9));
const HOME = { lakan: 'terminal', dalisay: 'court', tanod: 'court', balut: 'palengke', kapre: 'balete' };
const stageName = (id) => { const s = STAGES.find((x) => x.id === id); return s ? `${s.name}, ${s.place}` : id; };

const QUOTES = {
  lakan: { win: ['Isang baston, dalawang baston. Ilan pa ang kailangan mo?', 'Sa Batangas, ensayo lang namin ʼyan.', 'Sinawali: sayaw ng mga baston, at ikaw ang tugtog.'], taunt: 'Handa ka na ba? Hindi ako nagbibiro sa baston.', end: 'Lakan brought the Kapreʼs tabako home to Batangas as proof. The barkers at the Cubao terminal still say he bought it at a sari-sari store.' },
  dalisay: { win: ['Mas mabilis pa sa jeep na sumisingit sa EDSA.', 'Sikaran ʼyan, hindi sayaw!', 'Sa Baras, ganito kami maglaro ng habulan.'], taunt: 'Bantayan mo ang paa ko. Kung kaya mo.', end: 'Dalisay kicked a balete leaf clean off the branch, and the Kapre bowed. Back in Baras, the kids now line up for sikaran lessons every Saturday.' },
  tanod: { win: ['Curfew na. Uwi na, iho.', 'Nasa blotter ka na.', 'Walang basag-ulo sa barangay ko.'], taunt: 'Anak, bawal ang tambay dito pagkatapos ng alas-diyes.', end: 'Mang Tanod wrote the Kapre up for smoking in a public place. The Kapre paid the fine in dried leaves. It is still on file at the barangay hall.' },
  balut: { win: ['Baluuut! Penoy! May sisiw pa ʼyan!', 'Pang-energy lang ʼyan, suki.', 'Mainit pa, gusto mo?'], taunt: 'Bili ka muna ng balut bago tayo magsuntukan.', end: 'Boy Balut sold the Kapre forty balut on credit. Every night since, a big shadow waits under the lamp post for him, with a leaf for a peso.' },
  kapre: { win: ['Hmm. Maliit ka pa sa isang dahon ng balete.', 'Tabi-tabi po... sana nagpaalam ka.', 'Ang usok ko ay mas matanda pa sa lolo mo.'], taunt: 'Sino ang gumagambala sa aking pahinga?', end: 'The Kapre walked out of the balete and into the city, looking for someone who could keep up. He found a basketball court, and nobody has beaten him at the barangay liga since.' },
};
const NOTATION = { QCF: '↓↘→ S · or S', DP: '→↓↘ S · or ↓ S', QCB: '↓↙← S · or ← S', SUPER: 'H + S · full bar', T: 'L + H · close', L5: 'L', H5: 'H', L2: '↓ L', H2: '↓ H', LJ: 'L in the air', HJ: 'H in the air' };
function moveList(c) {
  const rows = ['QCF', 'DP', 'QCB', 'SUPER', 'T', 'L5', 'H5', 'L2', 'H2', 'HJ'].filter((k) => c.moves[k]).map((k) => `<span>${NOTATION[k]}</span><span>${c.moves[k].name}${c.moves[k].proj ? ' · projectile' : ''}${c.moves[k].guard === 'low' ? ' · low' : c.moves[k].guard === 'high' && !c.moves[k].air ? ' · overhead' : ''}${c.moves[k].throw && c.moves[k].special ? ' · canʼt be broken' : ''}</span>`);
  return `<div class="moves">${rows.join('')}</div>`;
}
// A pixel portrait, drawn from the fighter's colours.
function portrait(c) {
  const cv = document.createElement('canvas'); cv.width = 24; cv.height = 24;
  const x = cv.getContext('2d'), R = (col, X, Y, W = 1, H = 1) => { x.fillStyle = col; x.fillRect(X, Y, W, H); };
  const k = c.colors;
  R(k.accent, 0, 0, 24, 24); R('rgba(0,0,0,.25)', 0, 16, 24, 8);
  R(k.top, 4, 19, 16, 5); R(k.skin, 9, 17, 6, 3);
  const big = c.id === 'kapre';
  R(k.skin, big ? 5 : 6, big ? 3 : 5, big ? 14 : 12, big ? 15 : 13);
  R(k.hair, big ? 4 : 5, big ? 1 : 3, big ? 16 : 14, 4); R(k.hair, big ? 4 : 5, 4, 2, big ? 12 : 7);
  if (c.id === 'lakan' || c.id === 'dalisay') R(k.accent === '#ffd23f' ? '#ffd23f' : '#e8384f', 6, 7, 12, 1);
  if (c.id === 'tanod') { R('#2f3f6a', 5, 3, 14, 4); R('#2f3f6a', 14, 6, 6, 1); R('#1b1320', 10, 14, 6, 1); }
  if (c.id === 'balut') R('#e8384f', 5, 3, 14, 2);
  const eye = big ? '#ff9f43' : '#1b1320';
  R('#fff', 9, 10, 2, 2); R('#fff', 14, 10, 2, 2); R(eye, 10, 10, 1, 2); R(eye, 15, 10, 1, 2);
  R(k.hair, 8, 9, 3, 1); R(k.hair, 14, 9, 3, 1);
  R('#7a2a2a', 11, 15, 3, 1);
  if (big) { for (let i = 0; i < 6; i++) R('#1a1a12', 7 + i * 2, 16, 2, 3); R('#7a4a2a', 17, 14, 5, 1); R('#ff6a2a', 22, 14, 1, 1); }
  return cv.toDataURL();
}
const PORTRAITS = Object.fromEntries(ROSTER.map((c) => [c.id, portrait(c)]));

let view = null;
const A = createAudio();
A.setMuted(data.muted);
let mode = 'title', g = null, session = null, acc = 0, slow = 0, prev = null;
// Where everything was one tick ago, so frames can be drawn between ticks.
const remember = () => ({ f: g.f.map((f) => ({ x: f.x, y: f.y })), p: new Map(g.projs.map((p) => [p, { x: p.x, y: p.y }])) });

const SCREENS = ['title', 'how', 'select', 'ladder', 'pause', 'result'];
function show(name) {
  for (const id of SCREENS) $(id).hidden = id !== name;
  document.body.classList.toggle('fighting', name === null || name === 'pause');
  $('hud').hidden = !(name === null || name === 'pause');
  $('credit').hidden = name !== 'title';
  const first = name && ($(name).querySelector('button.primary') || $(name).querySelector('button'));
  if (first && !touch) first.focus({ preventScroll: true });
}

// ---------- input ----------
const keys = new Set();
const P1K = { left: ['KeyA'], right: ['KeyD'], up: ['KeyW'], down: ['KeyS'], l: ['KeyJ'], h: ['KeyK'], s: ['KeyL'], t: ['KeyI'], x: ['KeyU'] };
const P2K = { left: ['ArrowLeft'], right: ['ArrowRight'], up: ['ArrowUp'], down: ['ArrowDown'], l: ['Digit1', 'Numpad1', 'Comma'], h: ['Digit2', 'Numpad2', 'Period'], s: ['Digit3', 'Numpad3', 'Slash'], t: ['Digit4', 'Numpad4'], x: ['Digit5', 'Numpad5'] };
document.addEventListener('keydown', (e) => {
  A.start();
  if (mode === 'fight' && (e.code.startsWith('Arrow') || e.code === 'Space')) e.preventDefault();
  keys.add(e.code);
  if (e.repeat) return;
  if ((e.code === 'Escape' || e.code === 'KeyP') && (mode === 'fight' || mode === 'pause')) { if (mode === 'fight') pause(); else resume(); return; }
  if (e.code === 'KeyM') toggleSound();
  if (mode === 'fight' && session.kind === 'training') trainingKey(e.code);
  if (mode === 'select') selectKey(e.code);
});
document.addEventListener('keyup', (e) => keys.delete(e.code));
window.addEventListener('blur', () => keys.clear());

// gamepads: the first is player 1 unless player 1 is on the keyboard in a two-player game
const padPrev = [{}, {}];
function readPads() {
  const pads = navigator.getGamepads ? [...navigator.getGamepads()].filter(Boolean) : [];
  return pads.slice(0, 2).map((p, i) => {
    const dz = (v) => (Math.abs(v) < 0.3 ? 0 : Math.sign(v));
    const b = (n) => !!(p.buttons[n] && p.buttons[n].pressed);
    const st = {
      x: clamp(dz(p.axes[0] || 0) + (b(15) ? 1 : 0) - (b(14) ? 1 : 0), -1, 1), y: clamp(-dz(p.axes[1] || 0) + (b(12) ? 1 : 0) - (b(13) ? 1 : 0), -1, 1),
      l: b(2), h: b(3), s: b(1) || b(0), t: b(4) || b(6), sup: b(5) || b(7), start: b(9), ok: b(0), back: b(1),
    };
    const prev = padPrev[i];
    st.pressed = (k) => st[k] && !prev[k];
    st.moved = (dx, dy) => (st.x === dx && dx !== 0 && prev.x !== dx) || (st.y === dy && dy !== 0 && prev.y !== dy);
    padPrev[i] = { ...st };
    return st;
  });
}
window.addEventListener('gamepadconnected', () => { A.start(); banner('🎮', 'Controller ready', 1000); });

// touch: an eight-way pad and the buttons
const touchIn = { x: 0, y: 0, l: false, h: false, s: false, t: false, sup: false };
{
  const pad = $('pad'); let id = null;
  const set = (e) => { const r = pad.getBoundingClientRect(), dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2), d = Math.hypot(dx, dy); touchIn.x = d > 18 && Math.abs(dx) > d * 0.38 ? Math.sign(dx) : 0; touchIn.y = d > 18 && Math.abs(dy) > d * 0.38 ? -Math.sign(dy) : 0; $('knob').style.transform = `translate(${clamp(dx, -45, 45)}px, ${clamp(dy, -45, 45)}px)`; };
  pad.addEventListener('pointerdown', (e) => { A.start(); id = e.pointerId; pad.setPointerCapture(id); set(e); });
  pad.addEventListener('pointermove', (e) => { if (e.pointerId === id) set(e); });
  const end = () => { id = null; touchIn.x = 0; touchIn.y = 0; $('knob').style.transform = ''; };
  pad.addEventListener('pointerup', end); pad.addEventListener('pointercancel', end);
  for (const [bid, k] of [['tb-l', 'l'], ['tb-h', 'h'], ['tb-s', 's'], ['tb-t', 't'], ['tb-x', 'sup']]) {
    const b = $(bid);
    b.addEventListener('pointerdown', (e) => { e.preventDefault(); A.start(); b.setPointerCapture(e.pointerId); touchIn[k] = true; });
    for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) b.addEventListener(ev, () => { touchIn[k] = false; });
  }
}

let pads = [];
// One player's buttons this frame, as the fight engine wants them (x is left/right on screen).
function humanInput(side) {
  const two = session.humans[0] && session.humans[1];
  const sets = two ? [side ? P2K : P1K] : [P1K, P2K];
  const k = (list) => sets.some((s) => s[list].some((c) => keys.has(c)));
  let x = (k('right') ? 1 : 0) - (k('left') ? 1 : 0), y = (k('up') ? 1 : 0) - (k('down') ? 1 : 0);
  let l = k('l'), h = k('h'), s = k('s');
  if (k('t')) { l = true; h = true; }
  if (k('x')) { h = true; s = true; }
  // with two players, the first pad goes to player 2 when player 1 has no pad of their own
  const pad = two ? pads[pads.length >= 2 ? side : side === 1 ? 0 : 99] : side === 0 ? pads[0] : null;
  if (pad) { x = x || pad.x; y = y || pad.y; l = l || pad.l || pad.t; h = h || pad.h || pad.t || pad.sup; s = s || pad.s || pad.sup; }
  if (side === 0 || !two) { x = x || touchIn.x; y = y || touchIn.y; l = l || touchIn.l || touchIn.t; h = h || touchIn.h || touchIn.t || touchIn.sup; s = s || touchIn.s || touchIn.sup; }
  return { x: clamp(x, -1, 1), y: clamp(y, -1, 1), l, h, s };
}

// ---------- the HUD ----------
const el = { h: [$('h1'), $('h2')], t: [$('t1'), $('t2')], n: [$('n1'), $('n2')], w: [$('w1'), $('w2')], m: [$('m1'), $('m2')], mm: [$('mm1'), $('mm2')], c: [$('c1'), $('c2')], s: [$('s1'), $('s2')], timer: $('timer') };
const shown = { hp: [-1, -1], wins: '', meter: [-1, -1], timer: -1 };
const comboT = [0, 0], calloutT = [0, 0];
let bannerT = 0;
function hud() {
  for (let i = 0; i < 2; i++) {
    const f = g.f[i], pct = (f.hp / f.c.hp) * 100;
    if (shown.hp[i] !== f.hp) { shown.hp[i] = f.hp; el.h[i].style.width = `${pct}%`; el.t[i].style.width = `${pct}%`; el.h[i].classList.toggle('low', pct < 25); }
    const mt = Math.floor(f.meter);
    if (shown.meter[i] !== mt) { shown.meter[i] = mt; el.m[i].style.width = `${mt}%`; el.mm[i].classList.toggle('full', f.meter >= METER.max); }
  }
  const w = g.wins.join(',');
  if (shown.wins !== w) { shown.wins = w; for (let i = 0; i < 2; i++) el.w[i].innerHTML = '<i></i>'.repeat(g.wins[i]); }
  const secs = session.kind === 'training' ? -1 : Math.ceil(g.timer / 60);
  if (shown.timer !== secs) { shown.timer = secs; el.timer.textContent = secs < 0 ? '∞' : String(secs); el.timer.classList.toggle('low', secs >= 0 && secs <= 10); }
  $('tb-x').style.opacity = g.f[0].meter >= METER.max ? 1 : 0.45;
}
function banner(big, small = '', ms = 1200, red = false) {
  const b = $('banner');
  b.innerHTML = '<span></span><small></small>'; b.firstChild.textContent = big; b.lastChild.textContent = small;
  b.classList.toggle('red', red); b.hidden = false; b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop');
  bannerT = ms / 1000;
}
function callout(side, text, ms = 900) { const c = el.s[side]; c.textContent = text; c.classList.remove('pop'); void c.offsetWidth; c.classList.add('pop'); calloutT[side] = ms / 1000; }

function onEvent(e) {
  view.event(e, g);
  A.event(e, g);
  switch (e.type) {
    case 'round': banner(e.final ? 'HULING ROUND' : `ROUND ${e.n}`, e.final ? 'Final round' : '', 1500); break;
    case 'fight': banner('LABAN!', 'Fight!', 700); break;
    case 'hit':
      if (e.combo >= 2) { el.c[e.side].innerHTML = `${e.combo} HITS<small>${e.combo >= 5 ? 'GRABE!' : 'combo'}</small>`; el.c[e.side].classList.remove('pop'); void el.c[e.side].offsetWidth; el.c[e.side].classList.add('pop'); comboT[e.side] = 1.1; }
      if (e.counter) callout(e.side, 'COUNTER!');
      break;
    case 'special': callout(e.side, `${e.name}!`); break;
    case 'super': callout(e.side, `★ ${e.name.toUpperCase()} ★`, 1500); break;
    case 'throw': callout(e.side, `${e.name}!`); break;
    case 'tech': callout(e.side, 'NAKAWALA!'); break;
    case 'ko': slow = 50; banner(e.double ? 'DOUBLE K.O.' : 'K.O.!', e.perfect ? 'PERFECT!' : '', 1800, true); break;
    case 'timeup': banner('TIME!', e.winner === null ? 'Tabla · Draw' : '', 1600); break;
    case 'roundEnd': break;
    case 'matchEnd': setTimeout(() => finish(e.winner), 900); break;
    default: break;
  }
}

// footsteps on the stage's floor, one for every half metre walked
const walked = [0, 0];
function footsteps() {
  for (let i = 0; i < 2; i++) { const f = g.f[i]; if (f.state !== 'stand' || f.y > 0 || !f.vx) continue; walked[i] += Math.abs(f.vx); if (walked[i] > 0.5) { walked[i] = 0; A.step(); } }
}

// ---------- sessions ----------
function beginFight() {
  const s = session;
  g = createMatch({ p1: s.p1, p2: s.p2, stage: s.stage, seed: seed() });
  s.ai = [0, 1].map((i) => (s.humans[i] ? null : createAI(i, s.levels[i], seed() + i)));
  view.setStage(s.stage);
  A.music(s.stage); A.setFight([s.p1, s.p2], s.stage); walked[0] = walked[1] = 0;
  shown.hp = [-1, -1]; shown.wins = ''; shown.meter = [-1, -1]; shown.timer = -1;
  for (let i = 0; i < 2; i++) { el.n[i].textContent = `${byId(i ? s.p2 : s.p1).name}${s.humans[i] ? '' : ' · CPU'}`; el.c[i].textContent = ''; el.s[i].textContent = ''; }
  $('train').hidden = s.kind !== 'training';
  if (s.kind === 'training') { g.phase = 'fight'; g.phaseT = 0; train.combo = 0; train.dmg = 0; trainPanel(); }
  mode = 'fight'; acc = 0; slow = 0; keys.clear();
  show(null);
}
function pause() { if (mode === 'fight' && session.kind !== 'demo') { mode = 'pause'; $('pause-moves').innerHTML = `<h3>${byId(session.p1).name}</h3>${moveList(byId(session.p1))}`; show('pause'); } }
function resume() { if (mode === 'pause') { mode = 'fight'; keys.clear(); show(null); } }
function toTitle() {
  mode = 'title';
  demo();
  show('title');
  labels();
}
// the attract mode behind the title: two CPUs going at it
function demo() {
  const pool = ROSTER.filter((c) => !c.boss || data.unlocked).map((c) => c.id);
  const r = () => pool[Math.floor(Math.random() * pool.length)];
  const p1 = r(), p2 = r();
  session = { kind: 'demo', p1, p2, stage: HOME[p2] || 'terminal', humans: [false, false], levels: ['katamtaman', 'katamtaman'] };
  g = createMatch({ p1, p2, stage: session.stage, seed: seed() });
  session.ai = [createAI(0, 'katamtaman', seed()), createAI(1, 'katamtaman', seed() + 1)];
  view.setStage(session.stage);
  A.music('title'); A.ambience(session.stage);
}

function finish(winner) {
  if (mode !== 'fight') return;
  const s = session;
  if (s.kind === 'demo') { demo(); return; }
  mode = 'result';
  A.say(winner === null ? 'tie' : s.humans[0] && s.humans[1] ? 'winner' : s.humans[winner] ? 'you_win' : 'you_lose');
  const wid = winner === null ? null : winner === 0 ? s.p1 : s.p2;
  const quote = wid ? QUOTES[wid].win[Math.floor(Math.random() * 3)] : 'Walang nanalo. Isa pa!';
  const buttons = [];
  $('result-score').textContent = '';
  if (s.kind === 'arcade') {
    if (winner === 0) {
      const f = g.f[0];
      const points = Math.round(f.stats.hits * 10 + f.hp * 2 + f.stats.maxCombo * 50 + (g.wins[1] === 0 ? 1000 : 0));
      s.score += points;
      $('result-score').textContent = `+${points} · Iskor ${s.score}`;
      A.sfx('win');
      if (s.step >= s.ladder.length - 1) {
        const newly = !data.unlocked;
        data.unlocked = true;
        const best = data.best[data.diff] || 0;
        if (s.score > best) data.best[data.diff] = s.score;
        persist();
        $('result-title').textContent = `Tinalo mo ang Kapre!`;
        $('result-quote').textContent = QUOTES[s.p1].end;
        $('result-score').textContent = `Iskor ${s.score}${s.score > best ? ' · bagong best!' : ` · best ${best}`}${newly ? ' · ang Kapre: unlocked!' : ''}`;
        buttons.push(['Menu', toTitle, true]);
      } else {
        $('result-title').textContent = `PANALO si ${byId(s.p1).name}!`;
        $('result-quote').textContent = `“${quote}”`;
        buttons.push(['Susunod · Next', () => { s.step++; ladder(); }, true], ['Menu', toTitle]);
      }
    } else {
      A.sfx('lose');
      $('result-title').textContent = winner === null ? 'Tabla!' : `Talo... panalo si ${byId(s.p2).name}`;
      $('result-quote').textContent = `“${quote}”`;
      buttons.push(['Tuloy · Continue', () => { s.score = Math.floor(s.score / 2); beginFight(); }, true], ['Menu', toTitle]);
    }
  } else {
    A.sfx(winner === null ? 'lose' : 'win');
    $('result-title').textContent = winner === null ? 'Tabla! · Draw' : `PANALO si ${byId(wid).name}!${s.humans[0] && s.humans[1] ? ` (P${winner + 1})` : ''}`;
    $('result-quote').textContent = `“${quote}”`;
    buttons.push(['Isa pa · Rematch', beginFight, true], ['Palit · New fighters', () => openSelect(s.kind)], ['Menu', toTitle]);
  }
  const row = $('result-buttons'); row.innerHTML = '';
  for (const [label, fn, primary] of buttons) { const b = document.createElement('button'); b.type = 'button'; b.textContent = label; if (primary) b.className = 'primary'; b.onclick = fn; row.appendChild(b); }
  setTimeout(() => { if (mode === 'result') show('result'); }, 600);
}

// ---------- the arcade ladder ----------
function startArcade(p1) {
  const others = ROSTER.filter((c) => !c.boss && c.id !== p1).map((c) => c.id);
  for (let i = others.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [others[i], others[j]] = [others[j], others[i]]; }
  session = { kind: 'arcade', p1, ladder: [...others, 'kapre'], step: 0, score: 0, humans: [true, false] };
  ladder();
}
function ladder() {
  const s = session, opp = s.ladder[s.step], boss = opp === 'kapre';
  s.p2 = opp; s.stage = HOME[opp]; s.levels = [null, boss ? { madali: 'katamtaman', katamtaman: 'mahirap', mahirap: 'mahirap' }[data.diff] : data.diff];
  mode = 'ladder';
  $('ladder-title').textContent = boss ? `Huling laban: ang ${byId(opp).name}!` : `Laban ${s.step + 1}: ${byId(opp).name}`;
  $('ladder-list').innerHTML = s.ladder.map((id, i) => `<span class="${i < s.step ? 'done' : i === s.step ? 'now' : ''}">${byId(id).name}</span>`).join('');
  $('ladder-quote').textContent = `${stageName(s.stage)} · “${QUOTES[opp].taunt}”`;
  g = createMatch({ p1: s.p1, p2: opp, stage: s.stage }); view.setStage(s.stage); A.music(s.stage); A.setFight([s.p1, opp], s.stage);
  show('ladder');
}

// ---------- choosing fighters ----------
const sel = { kind: 'arcade', cur: [0, 1], picked: [false, false], cpu2: true, stage: 'random' };
// whose cursor moves: in arcade only yours; otherwise you pick yourself, then your opponent
const chooser = () => (sel.kind !== 'arcade' && sel.picked[0] ? 1 : 0);
function openSelect(kind) {
  A.start(); setTimeout(() => A.say('choose_your_character'), 250);
  Object.assign(sel, { kind, picked: [false, false], cur: [0, 1] });
  mode = 'select';
  $('select-title').textContent = kind === 'arcade' ? 'Arcade: pumili ng manlalaban' : kind === 'versus' ? 'Versus: pumili ng manlalaban' : 'Ensayo: ikaw at ang kalaban';
  renderSelect();
  show('select');
  $('select-ok').focus({ preventScroll: true });
}
const pickable = (c) => !(c.boss && sel.kind === 'arcade' && !data.unlocked);
function renderSelect() {
  const two = sel.kind !== 'arcade';
  $('roster').innerHTML = '';
  ROSTER.forEach((c, i) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'pick';
    if (!pickable(c)) b.classList.add('locked');
    if (sel.cur[0] === i) b.classList.add('p1');
    if (two && sel.cur[1] === i) b.classList.add('p2');
    b.innerHTML = `<img alt="" src="${PORTRAITS[c.id]}"><b>${pickable(c) ? c.name : '???'}</b>${sel.cur[0] === i ? `<span class="tag t1">${sel.picked[0] ? '✓ ' : ''}P1</span>` : ''}${two && sel.cur[1] === i ? `<span class="tag t2">${sel.picked[1] ? '✓ ' : ''}${sel.kind === 'training' ? 'KALABAN' : sel.cpu2 ? 'CPU' : 'P2'}</span>` : ''}`;
    b.setAttribute('aria-label', pickable(c) ? `${c.name}, ${c.title}` : 'Locked');
    b.onclick = () => { A.sfx('cursor'); const who = chooser(); sel.cur[who] = i; if (two && pickable(c)) sel.picked[who] = true; renderSelect(); };
    $('roster').appendChild(b);
  });
  const c = ROSTER[sel.cur[chooser()]] || ROSTER[0];
  $('info').innerHTML = pickable(c)
    ? `<h3>${c.name} <span class="who">· ${c.title} · ${c.style} · taga-${c.from}</span></h3><div class="who">${c.blurb}</div>${moveList(c)}`
    : '<h3>???</h3><div class="who">Talunin ang Arcade para makilala siya. Beat the arcade ladder to meet him.</div>';
  const ex = $('select-extra'); ex.innerHTML = '';
  if (two) {
    if (sel.kind === 'versus') { const t = document.createElement('button'); t.type = 'button'; t.textContent = `Player 2: ${sel.cpu2 ? 'CPU' : 'Tao · Human'}`; t.onclick = () => { sel.cpu2 = !sel.cpu2; renderSelect(); }; ex.appendChild(t); }
    const st = document.createElement('button'); st.type = 'button'; st.textContent = `Lugar: ${sel.stage === 'random' ? 'Kahit saan · Random' : stageName(sel.stage)}`;
    st.onclick = () => { const ids = ['random', ...STAGES.map((s) => s.id)]; sel.stage = ids[(ids.indexOf(sel.stage) + 1) % ids.length]; renderSelect(); if (sel.stage !== 'random') view.setStage(sel.stage); };
    ex.appendChild(st);
  }
  $('select-hint').textContent = touch ? 'Tap a fighter, then Fight.' : two ? `P1: A/D, J to pick · ${sel.kind === 'versus' && !sel.cpu2 ? 'P2: ←/→, 1 to pick' : 'then choose the opponent the same way'} · Enter: fight` : 'A/D or ←/→ to choose · J or Enter: fight';
  // show them in 3D
  const p1 = ROSTER[sel.cur[0]].id, p2 = two ? ROSTER[sel.cur[1]].id : ROSTER[(sel.cur[0] + 1) % 4].id;
  if (!g || g.f[0].id !== p1 || g.f[1].id !== p2 || session.kind !== 'showcase') { g = createMatch({ p1, p2, stage: view.stage || 'terminal' }); g.phaseT = 60; session = { kind: 'showcase', p1, p2 }; }
}
function selectKey(code) {
  const twoHumans = sel.kind === 'versus' && !sel.cpu2, has = (set, k) => set[k].includes(code);
  let who = null, d = 0, ok = false;
  for (const [set, side] of [[P1K, 0], [P2K, 1]]) {
    if (!(has(set, 'left') || has(set, 'right') || has(set, 'l'))) continue;
    who = twoHumans ? side : chooser();
    d = has(set, 'left') ? -1 : has(set, 'right') ? 1 : 0; ok = has(set, 'l');
  }
  if (who === null || sel.picked[who]) return;
  if (d) { sel.cur[who] = (sel.cur[who] + d + ROSTER.length) % ROSTER.length; A.sfx('cursor'); renderSelect(); }
  if (ok) confirm(who);
}
function confirm(who) {
  const c = ROSTER[sel.cur[who]];
  if (!pickable(c)) return;
  A.sfx('pick');
  if (sel.kind === 'arcade') { go(); return; }
  sel.picked[who] = true;
  renderSelect();
  if (sel.picked[0] && sel.picked[1]) go();
}
function go() {
  const p1 = ROSTER[sel.cur[0]].id;
  if (!pickable(ROSTER[sel.cur[0]])) return;
  if (sel.kind === 'arcade') { startArcade(p1); return; }
  const p2 = ROSTER[sel.cur[1]].id;
  const stage = sel.stage === 'random' ? STAGES[Math.floor(Math.random() * STAGES.length)].id : sel.stage;
  const humans = sel.kind === 'versus' ? [true, !sel.cpu2] : [true, false];
  session = { kind: sel.kind, p1, p2, stage, humans, levels: [data.diff, data.diff] };
  beginFight();
}

// ---------- training ----------
const DUMMY = ['tayo · stand', 'yuko · crouch', 'talon · jump', 'depensa · guard', 'CPU'];
const train = { dummy: 0, boxes: false, full: true, combo: 0, dmg: 0, idle: 0 };
function trainingKey(code) {
  if (code === 'KeyT') train.dummy = (train.dummy + 1) % DUMMY.length;
  if (code === 'KeyB') train.boxes = !train.boxes;
  if (code === 'KeyN') train.full = !train.full;
  if (train.dummy === 4 && !session.ai[1]) session.ai[1] = createAI(1, data.diff, seed());
  if (train.dummy !== 4) session.ai[1] = null;
  trainPanel();
}
function trainPanel() { $('train').innerHTML = `Kalaban: <b>${DUMMY[train.dummy]}</b> <kbd>T</kbd> · Boxes <b>${train.boxes ? 'on' : 'off'}</b> <kbd>B</kbd> · Laging puno ang super <b>${train.full ? 'on' : 'off'}</b> <kbd>N</kbd><br>Huling combo: <b>${train.combo}</b> hits, <b>${train.dmg}</b> damage`; }
function dummyInput() {
  const d = train.dummy, f = g.f[1];
  if (d === 1) return { ...NOIN, y: -1 };
  if (d === 2) return { ...NOIN, y: f.state === 'stand' && g.frame % 40 === 0 ? 1 : 0 };
  if (d === 3) { const o = g.f[0], low = o.state === 'move' && o.move && o.move.guard === 'low'; return { ...NOIN, x: Math.sign(f.x - o.x) || 1, y: low || o.crouch ? -1 : 0 }; }
  return NOIN;
}
function trainingTick(ev) {
  g.timer = ROUND.secs * 60;
  if (train.full) g.f[0].meter = METER.max;
  for (const e of ev) if (e.type === 'hit' && e.side === 0) { train.combo = e.combo; train.dmg = g.f[1].c.hp - g.f[1].hp; trainPanel(); }
  // health comes back once the combo is over
  const f = g.f[1];
  if (['stand', 'crouch', 'block'].includes(f.state) && f.hp < f.c.hp) { if (++train.idle > 50) { f.hp = f.c.hp; g.f[0].hp = g.f[0].c.hp; train.idle = 0; } } else train.idle = 0;
  if (g.phase === 'ko') { g.phase = 'fight'; g.roundWinner = null; for (const x of g.f) { x.hp = x.c.hp; if (x.state === 'ko') x.state = 'hitAir'; } }
}

// ---------- menus ----------
function toggleSound() { A.start(); data.muted = !data.muted; A.setMuted(data.muted); persist(); labels(); }
function labels() {
  for (const b of document.querySelectorAll('.sound')) { b.textContent = data.muted ? '🔇' : '🔊'; b.setAttribute('aria-label', data.muted ? 'Sound off, turn it on' : 'Sound on, turn it off'); }
  for (const b of document.querySelectorAll('[data-diff]')) b.setAttribute('aria-pressed', String(b.dataset.diff === data.diff));
  const best = data.best[data.diff];
  $('title-best').textContent = `CPU: ${LEVELS[data.diff].name}${best ? ` · Arcade best: ${best}` : ''}${data.unlocked ? ' · ang Kapre: unlocked' : ''}`;
}
for (const b of document.querySelectorAll('.sound')) b.onclick = toggleSound;
for (const b of document.querySelectorAll('[data-diff]')) b.onclick = () => { data.diff = b.dataset.diff; persist(); labels(); A.sfx('cursor'); };
$('go-arcade').onclick = () => (data.how ? openSelect('arcade') : howFirst('arcade'));
$('go-versus').onclick = () => (data.how ? openSelect('versus') : howFirst('versus'));
$('go-training').onclick = () => openSelect('training');
let afterHow = null;
function howFirst(kind) { afterHow = kind; mode = 'how'; show('how'); }
$('how-btn').onclick = () => { afterHow = null; mode = 'how'; show('how'); };
$('how-ok').onclick = () => { data.how = true; persist(); if (afterHow) openSelect(afterHow); else toTitle(); };
$('select-ok').onclick = () => { if (sel.kind !== 'arcade' && !sel.picked[1]) { sel.picked[0] = true; sel.picked[1] = true; } go(); };
$('ladder-ok').onclick = beginFight;
$('resume').onclick = resume;
$('pause-btn').onclick = pause;
for (const b of document.querySelectorAll('.menu')) b.onclick = toTitle;
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
labels();

// moving through buttons with a controller
function padMenus() {
  const p = pads[0];
  if (!p || mode === 'fight') return;
  if (p.pressed('start') && mode === 'pause') { resume(); return; }
  if (mode === 'select') {
    const who = chooser();
    if (p.moved(-1, 0)) { sel.cur[who] = (sel.cur[who] + ROSTER.length - 1) % ROSTER.length; A.sfx('cursor'); renderSelect(); }
    if (p.moved(1, 0)) { sel.cur[who] = (sel.cur[who] + 1) % ROSTER.length; A.sfx('cursor'); renderSelect(); }
    if (p.pressed('ok')) confirm(who);
    if (p.pressed('back')) toTitle();
    return;
  }
  const btns = [...document.querySelectorAll('.screen:not([hidden]) button')];
  if (!btns.length) return;
  let i = btns.indexOf(document.activeElement);
  if (p.moved(1, 0) || p.moved(0, -1)) { i = (i + 1) % btns.length; btns[i].focus(); A.sfx('cursor'); }
  if (p.moved(-1, 0) || p.moved(0, 1)) { i = (i - 1 + btns.length) % btns.length; btns[i].focus(); A.sfx('cursor'); }
  if (p.pressed('ok') && i >= 0) btns[i].click();
}

// ---------- the loop ----------
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  pads = readPads();
  padMenus();
  if (pads[0] && pads[0].pressed('start') && mode === 'fight') pause();
  const running = (mode === 'fight' || mode === 'title' || mode === 'how') && g && session && session.kind !== 'showcase';
  if (running) {
    // a moment of slow motion after the knockout
    acc += dt * (slow > 0 ? 0.35 : 1);
    let steps = 0;
    while (acc >= 1 / 60 && steps < 4) {
      acc -= 1 / 60; steps++;
      if (slow > 0) slow--;
      prev = remember();
      const inputs = [0, 1].map((i) => (session.ai[i] ? aiInput(session.ai[i], g) : session.kind === 'training' && i === 1 ? dummyInput() : session.humans[i] ? humanInput(i) : NOIN));
      const ev = tick(g, inputs);
      if (mode === 'fight') { for (const e of ev) onEvent(e); if (session.kind === 'training') trainingTick(ev); footsteps(); }
      else { for (const e of ev) { view.event(e, g); if (e.type === 'matchEnd') demo(); } }
    }
    if (steps === 4) acc = Math.min(acc, 1 / 60); // after a long hitch, carry on rather than race to catch up
  } else if (g && session && session.kind === 'showcase') { g.frame++; }
  if (mode === 'fight') hud();
  for (let i = 0; i < 2; i++) {
    if (comboT[i] > 0 && (comboT[i] -= dt) <= 0) el.c[i].textContent = '';
    if (calloutT[i] > 0 && (calloutT[i] -= dt) <= 0) el.s[i].textContent = '';
  }
  if (bannerT > 0 && (bannerT -= dt) <= 0) $('banner').hidden = true;
  // drawn a fraction of a tick behind the simulation, so motion stays even at any frame rate
  const alpha = running ? clamp(acc * 60, 0, 1) : 1;
  if (g) view.frame(g, dt, { reduced: reduced(), boxes: mode === 'fight' && session.kind === 'training' && train.boxes, showcase: session && session.kind === 'showcase', prev: running ? prev : null, alpha });
  requestAnimationFrame(frame);
}

async function boot() {
  try { await Promise.race([document.fonts.load('800 20px "Baloo 2"'), new Promise((r) => setTimeout(r, 1500))]); } catch { /* system fonts then */ }
  try { view = createView($('view'), { low: touch, gfx: Q.get('gfx') }); }
  catch {
    $('title').innerHTML = '<h1 class="logo">BAKBAKAN<br>SA KANTO</h1><p class="muted">This game needs 3D (WebGL), which this browser could not start. Try Chrome, Edge, Safari or Firefox, or turn on hardware acceleration.</p>';
    show('title');
    return;
  }
  try { Object.assign(PORTRAITS, view.portraits(ROSTER)); } catch { /* keep the drawn ones */ }
  // the real, motion-captured fighters load in the background; the handmade ones fill in until then
  loadMocap(Q.get('mocap') || 'assets/fighters/').then((lib) => {
    view.setMocap(lib);
    try { Object.assign(PORTRAITS, view.portraits(ROSTER)); } catch { /* keep what we have */ }
    if (mode === 'select') renderSelect();
  }).catch(() => { /* not deployed here: the handmade fighters it is */ });
  loadCrowd(Q.get('mocap') || 'assets/fighters/').then((c) => view.setCrowd(c)).catch(() => { /* the painted crowd stays */ });
  loadEnv(Q.get('env') || 'assets/env/').then((e) => view.setEnv(e)).catch(() => { /* the painted stages stay */ });
  window.addEventListener('resize', () => view.resize());
  new ResizeObserver(() => view.resize()).observe($('view'));
  toTitle();
  requestAnimationFrame(frame);
  if (TEST) {
    window.__bk = { get g() { return g; }, get mode() { return mode; }, get session() { return session; }, beginFight, openSelect, renderSelect, sel, train, view, keys };
    const f = Q.get('fight');
    if (f) {
      const [p1, p2] = f.split(',');
      const cpu = Q.get('cpu') || '1';
      session = { kind: Q.get('kind') || 'versus', p1, p2, stage: Q.get('stage') || HOME[p2] || 'terminal', humans: [!cpu.includes('0'), !cpu.includes('1')], levels: [Q.get('diff') || 'katamtaman', Q.get('diff') || 'katamtaman'] };
      beginFight();
    }
  }
}
boot();
if ('serviceWorker' in navigator && !TEST) navigator.serviceWorker.register('sw.js').catch(() => { /* online only, then */ });
