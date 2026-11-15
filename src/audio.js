// Every sound is synthesised with WebAudio at play time.
export class GameAudio {
  constructor() { this.ctx = null; this.master = null; this.birdTimer = 0; }
  ensure() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const C = window.AudioContext || window.webkitAudioContext; if (!C) return;
    this.ctx = new C();
    this.master = this.ctx.createGain(); this.master.gain.value = 0.8; this.master.connect(this.ctx.destination);
    this.startAmbience();
    if (this.wantRain) this.setRain(true);
  }
  noiseBuffer(sec) {
    const ctx = this.ctx, n = Math.floor(ctx.sampleRate * sec), b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }
  burst({ dur = 0.05, freq = 2500, q = 1.2, gain = 0.5, type = 'bandpass', attack = 0.002, when = 0 }) {
    const ctx = this.ctx; if (!ctx) return;
    const src = ctx.createBufferSource(); src.buffer = this.noiseBuffer(dur + 0.05);
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain(); const t = ctx.currentTime + when;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.master); src.start(t); src.stop(t + dur + 0.05);
  }
  tone({ freq = 440, to = null, dur = 0.1, gain = 0.2, type = 'sine', when = 0 }) {
    const ctx = this.ctx; if (!ctx) return;
    const o = ctx.createOscillator(); o.type = type; const t = ctx.currentTime + when;
    o.frequency.setValueAtTime(freq, t); if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + 0.004); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.02);
  }
  /** The strike. Each family of club has its own voice, coloured by what the ball was sitting on. */
  hit(power, club, lie = 'turf') {
    if (!this.ctx) return;
    const p = 0.4 + power * 0.6;
    if (club.putter) { this.burst({ dur: 0.03, freq: 1500, q: 0.8, gain: 0.25 * p }); this.tone({ freq: 900, to: 500, dur: 0.03, gain: 0.05 }); return; }
    if (lie === 'sand') { // the club takes sand before ball: a soft thump under a long hiss
      this.burst({ dur: 0.32, freq: 2600, q: 0.35, gain: 0.4 * p, attack: 0.01 }); this.burst({ dur: 0.1, freq: 260, q: 0.6, gain: 0.5 * p, type: 'lowpass' }); this.tone({ freq: 150, to: 80, dur: 0.09, gain: 0.2 * p });
      return;
    }
    if (club.id === 'DR') { // driver: a bright hollow crack with a ring to it
      this.burst({ dur: 0.05, freq: 3600, q: 1.8, gain: 0.75 * p }); this.tone({ freq: 3900, to: 3100, dur: 0.09, gain: 0.14 * p }); this.tone({ freq: 2450, dur: 0.16, gain: 0.05 * p }); this.tone({ freq: 170, to: 90, dur: 0.09, gain: 0.28 * p });
    } else if (club.wood) { // fairway woods and hybrids: the same crack, a little lower and shorter
      this.burst({ dur: 0.05, freq: 2900, q: 1.5, gain: 0.65 * p }); this.tone({ freq: 3000, to: 2400, dur: 0.06, gain: 0.11 * p }); this.tone({ freq: 160, to: 90, dur: 0.08, gain: 0.25 * p });
    } else if (club.loft >= 44) { // wedges: a soft click and a brush of turf
      this.burst({ dur: 0.04, freq: 1500, q: 0.9, gain: 0.45 * p }); this.tone({ freq: 190, to: 110, dur: 0.07, gain: 0.2 * p }); this.burst({ dur: 0.16, freq: 800, q: 0.4, gain: 0.2 * p, type: 'lowpass', attack: 0.012 });
    } else { // irons: a crisp click, then the thud of the divot
      this.burst({ dur: 0.045, freq: 2100, q: 1.1, gain: 0.62 * p }); this.tone({ freq: 230, to: 120, dur: 0.07, gain: 0.26 * p }); this.burst({ dur: 0.12, freq: 600, q: 0.5, gain: 0.16 * p, type: 'lowpass' });
    }
    if (lie === 'rough') this.burst({ dur: 0.18, freq: 3200, q: 0.3, gain: 0.14 * p, type: 'highpass', attack: 0.01 }); // grass round the hosel
  }
  /** The club coming down: air rushing past, rising in pitch into the strike. */
  whoosh(power, dur = 0.32) {
    const ctx = this.ctx; if (!ctx) return;
    const src = ctx.createBufferSource(); src.buffer = this.noiseBuffer(dur + 0.2);
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 1.1; const t = ctx.currentTime;
    f.frequency.setValueAtTime(350, t); f.frequency.exponentialRampToValueAtTime(1400 + 1600 * power, t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.001, t); g.gain.exponentialRampToValueAtTime(0.05 + 0.16 * power, t + dur * 0.92); g.gain.exponentialRampToValueAtTime(0.001, t + dur + 0.14);
    src.connect(f); f.connect(g); g.connect(this.master); src.start(t); src.stop(t + dur + 0.2);
  }
  /** The ball coming down: a thud on turf, softer on a green, a muffled drop in rough, a puff in sand. */
  bounce(speed, surface = 'turf') {
    if (!this.ctx) return; const g = Math.min(0.35, speed / 40); if (g < 0.02) return;
    if (surface === 'sand') { this.burst({ dur: 0.14, freq: 2200, q: 0.35, gain: g * 0.9, attack: 0.008 }); this.burst({ dur: 0.05, freq: 220, q: 0.6, gain: g * 0.8, type: 'lowpass' }); }
    else if (surface === 'green') { this.burst({ dur: 0.035, freq: 380, q: 0.8, gain: g * 0.8, type: 'lowpass' }); this.tone({ freq: 130, to: 80, dur: 0.05, gain: g * 0.25 }); }
    else if (surface === 'rough') { this.burst({ dur: 0.06, freq: 300, q: 0.6, gain: g * 0.8, type: 'lowpass' }); this.burst({ dur: 0.1, freq: 3000, q: 0.3, gain: g * 0.18, type: 'highpass', attack: 0.01 }); }
    else { this.burst({ dur: 0.04, freq: 520, q: 0.7, gain: g, type: 'lowpass' }); this.tone({ freq: 150, to: 90, dur: 0.05, gain: g * 0.3 }); }
  }
  /** A near miss: the gallery's falling "ooh". */
  groan() {
    if (!this.ctx) return;
    for (const f of [196, 247, 294]) this.tone({ freq: f * (1 + Math.random() * 0.02), to: f * 0.8, dur: 0.75, gain: 0.035, type: 'sawtooth', when: 0.12 + Math.random() * 0.06 });
    this.burst({ dur: 0.7, freq: 500, q: 0.5, gain: 0.05, type: 'lowpass', attack: 0.15, when: 0.1 });
  }
  /** The breeze in the ambience follows the hole's wind. */
  setWind(speed) { this.windSpeed = speed; if (this.ambGain) { this.ambGain.gain.setTargetAtTime(0.03 + speed * 0.012, this.ctx.currentTime, 1.5); this.ambFilter.frequency.setTargetAtTime(260 + speed * 60, this.ctx.currentTime, 1.5); } }
  cup() {
    if (!this.ctx) return;
    this.burst({ dur: 0.05, freq: 1200, q: 1, gain: 0.35 });
    this.tone({ freq: 700, to: 380, dur: 0.16, gain: 0.12, when: 0.02 });
    this.burst({ dur: 0.05, freq: 900, q: 1, gain: 0.25, when: 0.09 });
    this.burst({ dur: 0.05, freq: 700, q: 1, gain: 0.18, when: 0.16 });
  }
  /** Holed out: a chime for par, rising notes and applause for a birdie, more of both for better. */
  celebrate(tier) {
    if (!this.ctx || tier <= 0) return;
    const notes = tier >= 3 ? [523, 659, 784, 1047, 1319] : tier === 2 ? [587, 740, 880, 1175] : [660, 880];
    notes.forEach((f, i) => { this.tone({ freq: f, dur: 0.5, gain: tier >= 2 ? 0.1 : 0.06, type: 'triangle', when: 0.25 + i * 0.11 }); this.tone({ freq: f * 2, dur: 0.3, gain: 0.03, when: 0.25 + i * 0.11 }); });
    if (tier < 2) return;
    // applause: a crowd of single claps, swelling and dying away
    const len = tier >= 3 ? 3.6 : 2.4, n = tier >= 3 ? 150 : 80;
    for (let i = 0; i < n; i++) { const u = Math.random(), env = Math.sin(Math.PI * Math.pow(u, 0.7)); this.burst({ dur: 0.03, freq: 1400 + Math.random() * 2200, q: 1.4, gain: (0.03 + Math.random() * 0.05) * (0.4 + env), when: 0.35 + u * len }); }
    if (tier >= 3) { this.tone({ freq: 1800, to: 2900, dur: 0.35, gain: 0.04, when: 0.9 }); this.tone({ freq: 2000, to: 3100, dur: 0.3, gain: 0.03, when: 1.7 }); }
  }
  /** Steady rain: a hiss with a lower patter under it. Remembered until the audio context exists. */
  setRain(on) {
    this.wantRain = on;
    if (!this.ctx) return;
    if (on && !this.rainGain) {
      const ctx = this.ctx, g = this.rainGain = ctx.createGain(); g.gain.value = 0; g.connect(this.master);
      const mk = (type, freq, q, gain) => { const src = ctx.createBufferSource(); src.buffer = this.noiseBuffer(3); src.loop = true; const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q; const gg = ctx.createGain(); gg.gain.value = gain; src.connect(f); f.connect(gg); gg.connect(g); src.start(); };
      mk('highpass', 3800, 0.4, 0.5); mk('bandpass', 900, 0.5, 0.6);
    }
    if (this.rainGain) this.rainGain.gain.setTargetAtTime(on ? 0.16 : 0, this.ctx.currentTime, 0.8);
  }
  splash() { if (!this.ctx) return; this.tone({ freq: 320, to: 110, dur: 0.16, gain: 0.22 }); this.burst({ dur: 0.5, freq: 700, q: 0.4, gain: 0.5, type: 'lowpass', attack: 0.02 }); this.burst({ dur: 0.25, freq: 2500, q: 0.5, gain: 0.2, attack: 0.05, when: 0.05 }); }
  tree(kind) { if (!this.ctx) return; if (kind === 'trunk') { this.tone({ freq: 420, to: 260, dur: 0.07, gain: 0.3, type: 'triangle' }); this.burst({ dur: 0.04, freq: 1100, q: 1.2, gain: 0.4 }); return; } this.burst({ dur: 0.08, freq: 400, q: 0.6, gain: 0.35, type: 'lowpass' }); this.burst({ dur: 0.3, freq: 4000, q: 0.3, gain: 0.12, type: 'highpass', when: 0.02 }); }
  click() { if (!this.ctx) return; this.burst({ dur: 0.02, freq: 2000, q: 1, gain: 0.08 }); }
  startAmbience() {
    const ctx = this.ctx;
    const src = ctx.createBufferSource(); src.buffer = this.noiseBuffer(4); src.loop = true;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 320;
    const g = ctx.createGain(); g.gain.value = 0.045; this.ambGain = g; this.ambFilter = f; if (this.windSpeed != null) this.setWind(this.windSpeed);
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.11; const lg = ctx.createGain(); lg.gain.value = 0.02; lfo.connect(lg); lg.connect(g.gain); lfo.start();
    src.connect(f); f.connect(g); g.connect(this.master); src.start();
    const bird = () => {
      if (!this.ctx) return;
      const base = 2600 + Math.random() * 1800, n = 2 + Math.floor(Math.random() * 4);
      for (let i = 0; i < n; i++) this.tone({ freq: base * (1 + Math.random() * 0.2), to: base * 1.4, dur: 0.09, gain: 0.02, when: i * 0.14 });
      setTimeout(bird, 3000 + Math.random() * 9000);
    };
    setTimeout(bird, 1500);
  }
}
