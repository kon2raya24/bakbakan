// Every sound is synthesized with Web Audio: hits, guards, whooshes, projectiles, the super, the
// stingers, and a little loop for each stage (a pentatonic line over drums, a nod to the kulintang).
const SCALES = {
  terminal: { bpm: 118, root: 45, notes: [0, 2, 4, 7, 9, 12], lead: 'square' },
  court: { bpm: 126, root: 43, notes: [0, 3, 5, 7, 10, 12], lead: 'sawtooth' },
  palengke: { bpm: 112, root: 47, notes: [0, 2, 4, 7, 9, 12], lead: 'triangle' },
  balete: { bpm: 92, root: 40, notes: [0, 1, 5, 7, 8, 12], lead: 'sine' },
  title: { bpm: 104, root: 45, notes: [0, 2, 4, 7, 9, 12], lead: 'triangle' },
};

export function createAudio() {
  let ctx = null, master = null, sfx = null, mus = null, noiseBuf = null, muted = false;
  let song = null, timer = null, step = 0, nextT = 0;

  function start() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return; }
    master = ctx.createGain(); master.gain.value = muted ? 0 : 0.8; master.connect(ctx.destination);
    sfx = ctx.createGain(); sfx.gain.value = 0.9; sfx.connect(master);
    mus = ctx.createGain(); mus.gain.value = 0.28; mus.connect(master);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    if (song) playSong(song);
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
    switch (e.type) {
      case 'swing': SFX.swing(e.heavy); break;
      case 'hit': SFX.hit(e.heavy, e.super || e.counter); break;
      case 'block': SFX.block(); break;
      case 'jump': SFX.jump(); break;
      case 'land': SFX.land(); break;
      case 'down': SFX.down(); break;
      case 'special': SFX.special(); break;
      case 'super': SFX.super(); break;
      case 'proj': SFX.proj(e.kind); break;
      case 'clash': SFX.clash(); break;
      case 'grab': SFX.grab(); break;
      case 'throw': SFX.hit(true, true); break;
      case 'tech': SFX.tech(); break;
      case 'splat': SFX.splat(); break;
      case 'round': SFX.round(); break;
      case 'fight': SFX.fight(); break;
      case 'ko': SFX.ko(); break;
      case 'timeup': SFX.timeup(); break;
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
    music: (id) => { if (id === song) return; if (id) playSong(id); else stopSong(); },
    setMuted(m) { muted = m; if (master) master.gain.value = m ? 0 : 0.8; },
  };
}
