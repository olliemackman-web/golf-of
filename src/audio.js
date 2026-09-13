// Every sound is synthesised with WebAudio at play time.
export class GameAudio {
  constructor() { this.ctx = null; this.master = null; this.birdTimer = 0; }
  ensure() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const C = window.AudioContext || window.webkitAudioContext; if (!C) return;
    this.ctx = new C();
    this.master = this.ctx.createGain(); this.master.gain.value = 0.8; this.master.connect(this.ctx.destination);
    this.startAmbience();
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
  hit(power, club) {
    if (!this.ctx) return;
    const p = 0.4 + power * 0.6;
    if (club.putter) { this.burst({ dur: 0.03, freq: 1500, q: 0.8, gain: 0.25 * p }); this.tone({ freq: 900, to: 500, dur: 0.03, gain: 0.05 }); return; }
    if (club.wood) { this.burst({ dur: 0.06, freq: 3200, q: 1.5, gain: 0.7 * p }); this.tone({ freq: 3400, to: 2600, dur: 0.05, gain: 0.12 * p }); this.tone({ freq: 160, to: 90, dur: 0.08, gain: 0.25 * p }); }
    else { this.burst({ dur: 0.05, freq: 1900, q: 1.0, gain: 0.6 * p }); this.tone({ freq: 220, to: 120, dur: 0.07, gain: 0.25 * p }); this.burst({ dur: 0.12, freq: 600, q: 0.5, gain: 0.15 * p, type: 'lowpass' }); }
  }
  bounce(speed) { if (!this.ctx) return; const g = Math.min(0.35, speed / 40); if (g < 0.02) return; this.burst({ dur: 0.04, freq: 500, q: 0.7, gain: g, type: 'lowpass' }); }
  cup() {
    if (!this.ctx) return;
    this.burst({ dur: 0.05, freq: 1200, q: 1, gain: 0.35 });
    this.tone({ freq: 700, to: 380, dur: 0.16, gain: 0.12, when: 0.02 });
    this.burst({ dur: 0.05, freq: 900, q: 1, gain: 0.25, when: 0.09 });
    this.burst({ dur: 0.05, freq: 700, q: 1, gain: 0.18, when: 0.16 });
  }
  splash() { if (!this.ctx) return; this.burst({ dur: 0.5, freq: 700, q: 0.4, gain: 0.5, type: 'lowpass', attack: 0.02 }); this.burst({ dur: 0.25, freq: 2500, q: 0.5, gain: 0.2, attack: 0.05, when: 0.05 }); }
  tree() { if (!this.ctx) return; this.burst({ dur: 0.08, freq: 400, q: 0.6, gain: 0.35, type: 'lowpass' }); this.burst({ dur: 0.3, freq: 4000, q: 0.3, gain: 0.12, type: 'highpass', when: 0.02 }); }
  click() { if (!this.ctx) return; this.burst({ dur: 0.02, freq: 2000, q: 1, gain: 0.08 }); }
  startAmbience() {
    const ctx = this.ctx;
    const src = ctx.createBufferSource(); src.buffer = this.noiseBuffer(4); src.loop = true;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 320;
    const g = ctx.createGain(); g.gain.value = 0.045;
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
