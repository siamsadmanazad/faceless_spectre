'use client';

/**
 * Procedural sound — synthesized with the native Web Audio API. No asset files,
 * no dependency: every effect is generated from oscillators and filtered noise.
 *
 * Browsers block audio until a user gesture, so the context is created lazily
 * and resumed on the first interaction (armed once at module load). Everything
 * is gated behind `enabled` (wired to a UI toggle) and a soft master volume.
 */

class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private enabled = true;

  setEnabled(on: boolean): void {
    this.enabled = on;
    if (on) this.resume();
  }

  /** Resume the context — must be called from within a user gesture once. */
  resume(): void {
    this.ensure();
    if (this.ctx && this.ctx.state === 'suspended') void this.ctx.resume();
  }

  private ensure(): boolean {
    if (typeof window === 'undefined') return false;
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return false;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.35;
      this.master.connect(this.ctx.destination);
      // One second of white noise, reused for every textured sound.
      const buf = this.ctx.createBuffer(1, this.ctx.sampleRate, this.ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      this.noise = buf;
    }
    return !!this.ctx;
  }

  private now(): number {
    return this.ctx!.currentTime;
  }

  /** A short filtered-noise burst — the basis of card swishes. */
  private swish(t: number, freq: number, q: number, peak: number, dur: number): void {
    if (!this.ctx || !this.noise || !this.master) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const filt = this.ctx.createBiquadFilter();
    filt.type = 'bandpass';
    filt.frequency.value = freq;
    filt.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    src.connect(filt).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  /** A soft sine tone with a gentle bell envelope — for chimes. */
  private tone(t: number, freq: number, peak: number, dur: number, type: OscillatorType = 'sine'): void {
    if (!this.ctx || !this.master) return;
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  private play(fn: () => void): void {
    if (!this.enabled || !this.ensure()) return;
    if (this.ctx!.state === 'suspended') return; // not yet unlocked by a gesture
    fn();
  }

  // ── Public SFX ─────────────────────────────────────────────────────────────

  /** A single card sliding off the deck. */
  draw(): void {
    this.play(() => this.swish(this.now(), 2600, 1.2, 0.5, 0.16));
  }

  /** A small soft tap when a card lands on the table. */
  place(): void {
    this.play(() => {
      this.swish(this.now(), 1400, 1.0, 0.4, 0.1);
      this.tone(this.now(), 180, 0.12, 0.08, 'triangle');
    });
  }

  /** Riffle — a rapid run of swishes. */
  shuffle(): void {
    this.play(() => {
      const t0 = this.now();
      for (let i = 0; i < 12; i++) {
        this.swish(t0 + i * 0.035, 2200 + Math.random() * 1200, 1.4, 0.22, 0.06);
      }
    });
  }

  /** Deal — a short staggered flurry of slides. */
  deal(): void {
    this.play(() => {
      const t0 = this.now();
      for (let i = 0; i < 4; i++) this.swish(t0 + i * 0.09, 2500, 1.2, 0.34, 0.13);
    });
  }

  /** Reveal — a soft two-note chime. */
  reveal(): void {
    this.play(() => {
      const t = this.now();
      this.tone(t, 660, 0.18, 0.5);
      this.tone(t + 0.08, 990, 0.14, 0.6);
    });
  }

  /** Tiny UI click. */
  tick(): void {
    this.play(() => this.swish(this.now(), 3200, 2.0, 0.18, 0.04));
  }
}

export const audio = new AudioEngine();

// Arm once: resume the context on the first user gesture (browser autoplay gate).
if (typeof window !== 'undefined') {
  const arm = () => {
    audio.resume();
    window.removeEventListener('pointerdown', arm);
    window.removeEventListener('keydown', arm);
  };
  window.addEventListener('pointerdown', arm);
  window.addEventListener('keydown', arm);
}
