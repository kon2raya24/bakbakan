// Sound, in Web Audio. Real recordings (CC0, from Kenney) for the hits, sticks, falls, footsteps and
// the announcer, played with a little variety in pitch. Under and around them, synthesized sound:
// - weight under the hits, the whooshes, the projectiles, the super and the stingers
// - each stage's air: a crowd that cheers the big hits and roars at a knockout, the city, the
//   market, crickets at the balete
// - a little loop for each stage: a pentatonic line over drums, a nod to the kulintang
// Until the recordings load, or if they can't, the synthesized sounds play alone.
const SAMPLES = { punch_m: 5, punch_h: 5, soft_h: 3, soft_m: 3, wood_m: 3, wood_h: 3, block: 3, step_concrete: 5, step_wood: 5, step_grass: 5 };
const VOICE = ['round_1', 'round_2', 'round_3', 'round_4', 'round_5', 'final_round', 'fight', 'time', 'flawless_victory', 'you_win', 'you_lose', 'winner', 'tie', 'choose_your_character', 'ready'];
const FLOOR = { terminal: 'step_concrete', court: 'step_wood', palengke: 'step_concrete', balete: 'step_grass' };
const STICKS = new Set(['lakan', 'tanod']);
const SCALES = {
  terminal: { bpm: 118, root: 45, notes: [0, 2, 4, 7, 9, 12], lead: 'square' },
  court: { bpm: 126, root: 43, notes: [0, 3, 5, 7, 10, 12], lead: 'sawtooth' },
  palengke: { bpm: 112, root: 47, notes: [0, 2, 4, 7, 9, 12], lead: 'triangle' },
  balete: { bpm: 92, root: 40, notes: [0, 1, 5, 7, 8, 12], lead: 'sine' },
  title: { bpm: 104, root: 45, notes: [0, 2, 4, 7, 9, 12], lead: 'triangle' },
};

export function createAudio({ base = 'assets/sfx/' } = {}) {
  let ctx = null, master = null, sfx = null, mus = null, amb = null, noiseBuf = null, muted = false;
  const buf = {}; let fighters = ['', ''], stage = 'terminal', ambience = null, ambId = null;
  const mix = { music: 1, sfx: 1, voice: true }; // the player's settings
  let song = null, timer = null, step = 0, nextT = 0;

  function start() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return; }
    master = ctx.createGain(); master.gain.value = muted ? 0 : 0.8; master.connect(ctx.destination);
    sfx = ctx.createGain(); sfx.gain.value = 0.9 * mix.sfx; sfx.connect(master);
    mus = ctx.createGain(); mus.gain.value = 0.28 * mix.music; mus.connect(master);
    amb = ctx.createGain(); amb.gain.value = 0.5; amb.connect(master);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    if (song) playSong(song);
    if (ambId) setAmbience(ambId);
    loadSamples();
  }
  // the recordings, fetched once the sound is on
  function loadSamples() {
    const names = [...Object.entries(SAMPLES).flatMap(([k, n]) => Array.from({ length: n }, (_, i) => k + i)), ...VOICE.map((v) => 'v_' + v)];
    for (const n of names) fetch(`${base}${n}.mp3`).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject())).then((a) => ctx.decodeAudioData(a)).then((b) => { buf[n] = b; }).catch(() => { /* synth only */ });
  }
  // one of a sample's takes, a little higher or lower each time
  function play(name, { gain = 1, rate = 1, vary = 0.08, at = 0, out = sfx } = {}) {
    if (!ctx) return false;
    const takes = SAMPLES[name] ? Array.from({ length: SAMPLES[name] }, (_, i) => buf[name + i]).filter(Boolean) : [buf[name]].filter(Boolean);
    if (!takes.length) return false;
    const s = ctx.createBufferSource(), g = ctx.createGain();
    s.buffer = takes[Math.floor(Math.random() * takes.length)]; s.playbackRate.value = rate * (1 + (Math.random() * 2 - 1) * vary);
    g.gain.value = gain; s.connect(g); g.connect(out); s.start(now() + at);
    return true;
  }
  const say = (line, at = 0) => mix.voice && play('v_' + line, { gain: 1.1, vary: 0, at });

  // ---------- each stage's air ----------
  function loopNoise(freq, q, gain, type = 'bandpass') {
    const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noiseBuf; s.loop = true; f.type = type; f.frequency.value = freq; f.Q.value = q; g.gain.value = gain;
    s.connect(f); f.connect(g); g.connect(amb); s.start();
    return { s, g, f };
  }
  function setAmbience(id) {
    ambId = id;
    if (!ctx) return;
    if (ambience) { for (const n of ambience.nodes) try { n.s.stop(); } catch { /* already */ } clearInterval(ambience.timer); }
    const nodes = [], t0 = now();
    let timer = null;
    if (id === 'court' || id === 'palengke') {
      // a crowd murmuring: two bands of noise, swelling and falling
      const a = loopNoise(520, 0.8, id === 'court' ? 0.2 : 0.12), b = loopNoise(1500, 1.2, id === 'court' ? 0.08 : 0.06); nodes.push(a, b);
      timer = setInterval(() => { const t = now(); a.g.gain.setTargetAtTime((id === 'court' ? 0.16 : 0.1) + Math.random() * 0.1, t, 0.6); b.g.gain.setTargetAtTime(0.04 + Math.random() * 0.06, t, 0.5); if (id === 'palengke' && Math.random() < 0.25) tone(hz(62 + Math.floor(Math.random() * 7)), hz(60), 0.35, 'triangle', 0.02, { out: amb }); }, 700);
    } else if (id === 'terminal') {
      // the city: a low rumble of traffic, a jeep idling, a horn now and then
      nodes.push(loopNoise(120, 0.6, 0.3, 'lowpass'), loopNoise(700, 0.5, 0.03));
      timer = setInterval(() => { if (Math.random() < 0.12) { const f = 330 + Math.random() * 80; tone(f, f, 0.22, 'square', 0.025, { out: amb }); tone(f * 1.26, f * 1.26, 0.22, 'square', 0.02, { out: amb, at: 0.02 }); } }, 1500);
    } else if (id === 'balete') {
      // night: wind in the leaves, crickets
      const w = loopNoise(400, 0.4, 0.08, 'lowpass'); nodes.push(w);
      timer = setInterval(() => { const t = now(); w.g.gain.setTargetAtTime(0.04 + Math.random() * 0.08, t, 1.2); for (let k = 0; k < 3; k++) if (Math.random() < 0.7) tone(4200 + Math.random() * 600, 4200, 0.035, 'sine', 0.018, { out: amb, at: k * 0.07 }); }, 420);
    }
    ambience = { nodes, timer, t0 };
  }
  // the crowd's roar: louder and longer for a knockout
  function cheer(big) {
    if (!ctx || (ambId !== 'court' && ambId !== 'palengke')) return;
    const k = ambId === 'court' ? 1 : 0.5;
    noise(big ? 2.8 : 1.1, 700, 0.6, (big ? 0.5 : 0.22) * k, { out: amb, to: 900 }); noise(big ? 2.4 : 0.9, 2200, 1.2, (big ? 0.2 : 0.09) * k, { out: amb });
  }
  const now = () => ctx.currentTime;
  function env(g, t, a, peak, dur) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); }
  function noise(dur, freq, q, peak, { type = 'bandpass', to = null, at = 0, out = sfx } = {}) {
    if (!ctx) return;
    const t = now() + at, s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noiseBuf; f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (to) f.frequency.exponentialRampToValueAtTime(to, t + dur);
    env(g, t, 0.004, peak, dur);
    s.connect(f); f.connect(g); g.connect(out);
    s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
  }
  function tone(f0, f1, dur, type, peak, { at = 0, out = sfx, a = 0.005 } = {}) {
    if (!ctx) return;
    const t = now() + at, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t); if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    env(g, t, a, peak, dur);
    o.connect(g); g.connect(out);
    o.start(t); o.stop(t + dur + 0.05);
  }
  const hz = (m) => 440 * 2 ** ((m - 69) / 12);

  const SFX = {
    swing: (heavy) => noise(heavy ? 0.16 : 0.09, heavy ? 900 : 1600, 1.2, heavy ? 0.25 : 0.16, { to: heavy ? 2400 : 3200 }),
    hit: (heavy, big) => { tone(big ? 90 : heavy ? 120 : 180, 40, big ? 0.3 : heavy ? 0.2 : 0.12, 'sine', big ? 0.9 : heavy ? 0.7 : 0.5); noise(heavy ? 0.14 : 0.08, heavy ? 1400 : 2400, 0.8, heavy ? 0.6 : 0.45, { type: 'lowpass' }); },
    block: () => { noise(0.05, 3000, 2, 0.35); tone(700, 500, 0.05, 'square', 0.08); },
    jump: () => noise(0.12, 600, 1, 0.1, { to: 1400 }),
    land: () => noise(0.08, 300, 1, 0.18, { type: 'lowpass' }),
    down: () => { tone(80, 35, 0.35, 'sine', 0.8); noise(0.25, 400, 0.7, 0.4, { type: 'lowpass' }); },
    special: () => { tone(300, 900, 0.18, 'sawtooth', 0.12); noise(0.2, 1200, 1, 0.2, { to: 4000 }); },
    super: () => { for (const [k, m] of [[0, 57], [1, 61], [2, 64], [3, 69]]) tone(hz(m), hz(m), 0.5, 'sawtooth', 0.1, { at: k * 0.04 }); noise(0.6, 500, 0.8, 0.35, { to: 6000 }); },
    proj: (kind) => kind === 'silaw' ? tone(1200, 1800, 0.25, 'sine', 0.12) : kind === 'usok' ? noise(0.5, 300, 0.6, 0.25, { type: 'lowpass', to: 900 }) : noise(0.2, 800, 1.5, 0.2, { to: 2200 }),
    clash: () => { tone(1500, 600, 0.2, 'square', 0.12); noise(0.2, 4000, 1, 0.3); },
    grab: () => noise(0.1, 500, 1, 0.3, { type: 'lowpass' }),
    tech: () => { tone(900, 1400, 0.12, 'triangle', 0.2); noise(0.08, 3000, 2, 0.25); },
    splat: () => noise(0.12, 900, 2, 0.3, { type: 'lowpass' }),
    tick: () => tone(1000, 1000, 0.03, 'square', 0.05),
    // stingers: a gong for the round, a rising call to fight, a big hit and a fall for the KO
    round: () => { tone(hz(45), hz(44), 1.6, 'sine', 0.5, { a: 0.01 }); tone(hz(57), hz(57), 1.2, 'triangle', 0.18); tone(hz(64), hz(64), 1.0, 'sine', 0.1); },
    fight: () => { for (const [k, m] of [[0, 69], [1, 73], [2, 76], [3, 81]]) tone(hz(m), hz(m), 0.18, 'square', 0.09, { at: k * 0.07 }); noise(0.3, 2000, 0.7, 0.2, { at: 0.2 }); },
    ko: () => { tone(60, 30, 1.2, 'sine', 1.0); noise(1.0, 200, 0.5, 0.6, { type: 'lowpass', to: 60 }); for (const [k, m] of [[0, 57], [1, 53], [2, 50]]) tone(hz(m), hz(m - 1), 0.5, 'sawtooth', 0.08, { at: 0.3 + k * 0.22 }); },
    timeup: () => { for (let k = 0; k < 3; k++) tone(880, 880, 0.12, 'square', 0.1, { at: k * 0.18 }); },
    win: () => { for (const [k, m] of [[0, 60], [1, 64], [2, 67], [3, 72], [4, 76]]) tone(hz(m), hz(m), 0.3, 'triangle', 0.14, { at: k * 0.1 }); },
    lose: () => { for (const [k, m] of [[0, 60], [1, 58], [2, 55], [3, 51]]) tone(hz(m), hz(m), 0.35, 'triangle', 0.12, { at: k * 0.16 }); },
    cursor: () => tone(660, 660, 0.04, 'square', 0.05),
    pick: () => { tone(523, 523, 0.08, 'square', 0.08); tone(784, 784, 0.12, 'square', 0.08, { at: 0.07 }); },
  };

  function event(e) {
    if (!ctx) return;
    const stick = STICKS.has(fighters[e.side]);
    switch (e.type) {
      case 'swing': SFX.swing(e.heavy); break;
      case 'hit': {
        const big = e.super || e.counter;
        // the recording, with the synth's weight underneath; sticks crack, kicks thump
        if (play(e.heavy || big ? 'punch_h' : 'punch_m', { gain: big ? 1.3 : 1 })) { tone(big ? 90 : e.heavy ? 110 : 160, 40, big ? 0.3 : 0.16, 'sine', big ? 0.6 : e.heavy ? 0.4 : 0.2); if (stick) play(e.heavy ? 'wood_h' : 'wood_m', { gain: 0.7 }); if (e.heavy) play('soft_h', { gain: 0.6 }); }
        else SFX.hit(e.heavy, big);
        if (big || e.heavy && Math.random() < 0.4) cheer(false);
        break;
      }
      case 'block': if (play('block', { gain: 0.9 })) { if (stick) play('wood_m', { gain: 0.5, rate: 1.2 }); } else SFX.block(); break;
      case 'jump': SFX.jump(); break;
      case 'land': if (!play(FLOOR[stage], { gain: 0.8 })) SFX.land(); break;
      case 'down': if (play('soft_h', { gain: 1.2, rate: 0.85 })) { play(FLOOR[stage], { gain: 1, rate: 0.8 }); tone(70, 35, 0.3, 'sine', 0.5); } else SFX.down(); break;
      case 'special': SFX.special(); break;
      case 'super': SFX.super(); break;
      case 'proj': SFX.proj(e.kind); break;
      case 'clash': SFX.clash(); break;
      case 'grab': SFX.grab(); break;
      case 'throw': SFX.hit(true, true); break;
      case 'tech': SFX.tech(); break;
      case 'splat': SFX.splat(); break;
      case 'round': SFX.round(); say(e.final ? 'final_round' : `round_${Math.min(5, e.n || 1)}`, 0.35); break;
      case 'fight': SFX.fight(); say('fight'); break;
      case 'ko': SFX.ko(); play('punch_h', { gain: 1.4, rate: 0.7, vary: 0 }); cheer(true); if (e.perfect) say('flawless_victory', 1.3); break;
      case 'timeup': SFX.timeup(); say('time'); cheer(false); break;
      case 'second': if (e.left <= 10) SFX.tick(); break;
      default: break;
    }
  }

  // ---------- music ----------
  // Sixteen steps a bar, four bars: kick, snare, hats, a bass on the root and fifth, and a lead that
  // wanders the scale in a seeded pattern.
  function pattern(id) {
    let s = [...id].reduce((a, c) => a * 31 + c.charCodeAt(0), 7) >>> 0;
    const r = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
    const lead = [];
    for (let i = 0; i < 64; i++) lead.push(r() < (i % 4 === 0 ? 0.8 : 0.35) ? Math.floor(r() * 6) : -1);
    return lead;
  }
  function playSong(id) {
    song = id;
    if (!ctx) return;
    clearInterval(timer);
    const sc = SCALES[id] || SCALES.title, lead = pattern(id), stepDur = 60 / sc.bpm / 4;
    step = 0; nextT = now() + 0.1;
    timer = setInterval(() => {
      while (nextT < now() + 0.12) {
        const i = step % 64, at = nextT - now(), bar = Math.floor(i / 16);
        if (i % 4 === 0) tone(110, 40, 0.18, 'sine', 0.6, { at, out: mus }); // kick
        if (i % 8 === 4) noise(0.12, 1800, 0.8, 0.28, { at, out: mus }); // snare
        if (i % 2 === 1 && id !== 'balete') noise(0.03, 8000, 1, 0.08, { type: 'highpass', at, out: mus }); // hats
        if (i % 4 === 0) { const n = sc.root + (bar === 2 ? 5 : bar === 3 ? 7 : 0); tone(hz(n), hz(n), stepDur * 3.5, 'triangle', 0.22, { at, out: mus }); }
        if (lead[i] >= 0) { const n = sc.root + 24 + sc.notes[lead[i]]; tone(hz(n), hz(n), stepDur * 1.6, sc.lead, id === 'balete' ? 0.08 : 0.05, { at, out: mus }); tone(hz(n + 12), hz(n + 12), stepDur, 'sine', 0.03, { at, out: mus }); } // a gong-like double
        step++; nextT += stepDur;
      }
    }, 25);
  }
  function stopSong() { song = null; clearInterval(timer); }

  return {
    start, event, sfx: (name, ...a) => { if (ctx && SFX[name]) SFX[name](...a); },
    say, cheer,
    // who's fighting where: sticks sound like sticks, feet sound like the floor they're on
    setFight(ids, st) { fighters = ids; stage = st; setAmbience(st); },
    ambience: (id) => setAmbience(id),
    step: (gain = 0.35) => play(FLOOR[stage], { gain, vary: 0.12 }),
    music: (id) => { if (id === song) return; if (id) playSong(id); else stopSong(); },
    setMuted(m) { muted = m; if (master) master.gain.value = m ? 0 : 0.8; },
    setMix(m) { Object.assign(mix, m); if (sfx) sfx.gain.value = 0.9 * mix.sfx; if (mus) mus.gain.value = 0.28 * mix.music; if (amb) amb.gain.value = 0.5 * mix.sfx; },
  };
}
