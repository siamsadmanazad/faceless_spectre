'use client';

/**
 * Procedural sound — synthesized with the native Web Audio API. No asset files,
 * no dependency: every effect is generated from oscillators and filtered noise.
 *
 * Browsers block audio until a user gesture, so the context is created lazily
 * and resumed on the first interaction (armed once at module load). Everything
 * is gated behind `enabled` (wired to a UI toggle) and a soft master volume.
 */

import { ShuffleStyle, ShuffleIntensity } from '@faceless-spectre/shared';
import { getPhases, findPhase } from './shuffle/timings';

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

  /** Generic shuffle — a rapid run of swishes (reduced-motion / fallback cue). */
  shuffle(): void {
    this.play(() => {
      const t0 = this.now();
      for (let i = 0; i < 12; i++) {
        this.swish(t0 + i * 0.035, 2200 + Math.random() * 1200, 1.4, 0.22, 0.06);
      }
    });
  }

  // ── Per-style shuffle cues ──────────────────────────────────────────────────
  // Each style schedules its texture across the real phase timeline (from
  // lib/shuffle/timings), so what you hear lines up with what the cards do.

  /** The interleave zip — a fast ascending run of clicks. */
  private zip(start: number, dur: number, n: number, base = 2400): void {
    for (let i = 0; i < n; i++) {
      const f = i / (n - 1 || 1);
      this.swish(start + f * dur, base + f * 900 + Math.random() * 300, 1.6, 0.16, 0.045);
    }
  }

  /** The bridge waterfall — a snap, then a descending cascade. */
  private cascade(start: number, dur: number): void {
    this.tone(start, 220, 0.1, 0.09, 'triangle');
    const n = 14;
    for (let i = 0; i < n; i++) {
      const f = i / (n - 1);
      this.swish(start + 0.03 + f * dur, 3000 - f * 1400, 1.3, 0.2 * (1 - f * 0.5), 0.05);
    }
  }

  /** A packet landing — soft thwip + low tap. */
  private packet(t: number, weight = 1): void {
    this.swish(t, 1700 + Math.random() * 500, 1.1, 0.2 * weight, 0.05);
    this.tone(t + 0.012, 140 + Math.random() * 40, 0.06 * weight, 0.05, 'triangle');
  }

  /**
   * Style-aware shuffle cue, synced to the animation's phase boundaries.
   * Purely cosmetic, like everything else the client renders.
   */
  shuffleStyled(style: ShuffleStyle, intensity: ShuffleIntensity, durationMs: number): void {
    this.play(() => {
      const t0 = this.now();
      const dur = durationMs / 1000;
      const phases = getPhases(style, intensity);
      const at = (frac: number): number => t0 + frac * dur;
      const span = (name: string): { start: number; len: number } | null => {
        const p = findPhase(phases, name);
        return p ? { start: t0 + p.start * dur, len: (p.end - p.start) * dur } : null;
      };

      switch (style) {
        case ShuffleStyle.Overhand: {
          // Uneven "thwip … tap" per packet, accelerating slightly per pass.
          const passes =
            intensity === ShuffleIntensity.Low ? 1 : intensity === ShuffleIntensity.Medium ? 3 : 5;
          const packets = Math.round(7 * passes);
          const window = span('passes')!;
          for (let i = 0; i < packets; i++) {
            const f = (i + Math.random() * 0.5) / packets;
            this.packet(window.start + f * window.len, 0.9);
          }
          break;
        }
        case ShuffleStyle.Riffle: {
          const r1 = span('riffle')!;
          this.zip(r1.start, r1.len * 0.9, 18);
          const r2 = span('riffle2');
          if (r2) this.zip(r2.start, r2.len * 0.9, 18);
          const bridge = span('bridge');
          if (bridge) this.cascade(bridge.start, bridge.len * 0.7);
          this.swish(at(0.97), 1200, 1.0, 0.18, 0.07); // final square tap
          break;
        }
        case ShuffleStyle.Wash: {
          // A continuous soft slither — many overlapping low-Q washes.
          const spread = span('spread')!;
          const gatherP = findPhase(phases, 'gather')!;
          const start = spread.start;
          const end = t0 + gatherP.end * dur;
          const n = 10;
          for (let i = 0; i < n; i++) {
            const tt = start + ((end - start) * i) / n + Math.random() * 0.08;
            this.swish(tt, 900 + Math.random() * 700, 0.7, 0.12, 0.5);
          }
          this.swish(at(0.96), 1400, 1.0, 0.16, 0.08); // gather tap
          break;
        }
        case ShuffleStyle.Split: {
          // Clean, spaced taps as each pile lands, then again on restack.
          const P =
            intensity === ShuffleIntensity.Low ? 3 : intensity === ShuffleIntensity.Medium ? 4 : 5;
          const divide = span('divide')!;
          const reassemble = span('reassemble')!;
          for (let k = 0; k < P; k++) {
            this.packet(divide.start + ((k + 0.8) / P) * divide.len, 1.1);
            this.packet(reassemble.start + ((k + 0.8) / P) * reassemble.len, 1.1);
          }
          break;
        }
        case ShuffleStyle.Casino: {
          const r1 = span('riffle1')!;
          this.zip(r1.start + r1.len * 0.3, r1.len * 0.65, 16, 2100);
          const strip = span('strip')!;
          for (let i = 0; i < 6; i++) {
            this.packet(strip.start + ((i + 0.5) / 6) * strip.len, 0.85);
          }
          const r2 = span('riffle2');
          if (r2) this.zip(r2.start + r2.len * 0.3, r2.len * 0.65, 16, 2100);
          const box = span('box')!;
          this.packet(box.start + box.len * 0.6, 1.2);
          const bridge = span('bridge')!;
          this.cascade(bridge.start, bridge.len * 0.75);
          this.swish(at(0.97), 1200, 1.0, 0.2, 0.08);
          break;
        }
        default:
          this.shuffle();
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
