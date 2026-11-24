/**
 * StereoDrift Audio-Reactive Gradient & Visualizer Engine.
 * Adapted from stereoDrift (https://github.com/stereoDrift/stereoDrift.github.io)
 *
 * Features:
 * - Real-time Web Audio multi-band FFT analysis (sub-bass kick, mid melody, treble air).
 * - Transient beat detection with elastic punch and smooth exponential decay.
 * - Smooth 2D Perlin noise flow-field coordinates for organic gradient drift.
 * - StereoDrift aesthetic color palettes (Vapor, Analog, Euphoria, Emerald, Sunset, Noir) + Album Art extraction.
 * - Zero-dependency, GPU-accelerated direct DOM rendering (0 React state re-renders).
 */

// ============================================================================
// 1. Classical 2D Perlin Noise Generator (Zero Dependencies)
// ============================================================================
class PerlinNoise {
  private p: number[] = [];

  constructor(seed = 42) {
    this.reseed(seed);
  }

  reseed(seed: number) {
    const permutation = [];
    for (let i = 0; i < 256; i++) permutation[i] = i;

    // Deterministic shuffle using seed
    let s = seed % 2147483647;
    if (s <= 0) s += 2147483646;
    for (let i = 255; i > 0; i--) {
      s = (s * 16807) % 2147483647;
      const j = Math.floor((s / 2147483647) * (i + 1));
      [permutation[i], permutation[j]] = [permutation[j]!, permutation[i]!];
    }

    this.p = new Array(512);
    for (let i = 0; i < 512; i++) {
      this.p[i] = permutation[i & 255]!;
    }
  }

  private fade(t: number): number {
    return t * t * t * (t * (t * 6 - 15) + 10);
  }

  private lerp(t: number, a: number, b: number): number {
    return a + t * (b - a);
  }

  private grad(hash: number, x: number, y: number): number {
    const h = hash & 3;
    const u = h < 2 ? x : y;
    const v = h < 2 ? y : x;
    return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
  }

  get(x: number, y: number): number {
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;

    const xf = x - Math.floor(x);
    const yf = y - Math.floor(y);

    const u = this.fade(xf);
    const v = this.fade(yf);

    const aa = this.p[this.p[X]! + Y]!;
    const ab = this.p[this.p[X]! + Y + 1]!;
    const ba = this.p[this.p[X + 1]! + Y]!;
    const bb = this.p[this.p[X + 1]! + Y + 1]!;

    const x1 = this.lerp(u, this.grad(aa, xf, yf), this.grad(ba, xf - 1, yf));
    const x2 = this.lerp(u, this.grad(ab, xf, yf - 1), this.grad(bb, xf - 1, yf - 1));

    // Normalized to [-1, 1]
    return this.lerp(v, x1, x2);
  }
}

export const perlin = new PerlinNoise(1337);

// ============================================================================
// 2. StereoDrift Aesthetic Color Palettes
// ============================================================================
export interface DriftPalette {
  name: string;
  background: string;
  primary: string;
  secondary: string;
  tertiary: string;
}

export type StereoDriftPaletteName = 'vapor' | 'analog' | 'euphoria' | 'emerald' | 'sunset' | 'noir';

export const STEREODRIFT_PALETTES: Record<StereoDriftPaletteName, DriftPalette> = {
  vapor: {
    name: 'Vapor',
    background: '#120726',
    primary: '#f72585',
    secondary: '#7909c3',
    tertiary: '#42c7f0',
  },
  analog: {
    name: 'Analog',
    background: '#141224',
    primary: '#20615B',
    secondary: '#DECE9C',
    tertiary: '#652EC7',
  },
  euphoria: {
    name: 'Euphoria',
    background: '#180a24',
    primary: '#86BFE7',
    secondary: '#B09060',
    tertiary: '#f72585',
  },
  emerald: {
    name: 'Emerald',
    background: '#041209',
    primary: '#10b981',
    secondary: '#900C3F',
    tertiary: '#FF7C60',
  },
  sunset: {
    name: 'Sunset',
    background: '#0b0826',
    primary: '#f43f5e',
    secondary: '#fb923c',
    tertiary: '#818cf8',
  },
  noir: {
    name: 'Noir',
    background: '#09090b',
    primary: '#71717a',
    secondary: '#3f3f46',
    tertiary: '#e4e4e7',
  },
};

// ============================================================================
// 3. StereoDrift Audio Dynamics Analyzer
// ============================================================================
export interface AudioDynamics {
  bass: number;       // 0.0 - 1.0 (sub-bass & kick drum)
  mid: number;        // 0.0 - 1.0 (vocals & melody)
  treble: number;     // 0.0 - 1.0 (hi-hats & air)
  beatHit: number;    // Transient strike spike (0.0 - 1.0, decayed smoothly)
  overallEnergy: number;
}

export class StereoDriftAnalyzer {
  private freqData = new Uint8Array(64);
  private runningBassAvg = 0.2;
  private beatHit = 0;

  analyze(analyser: AnalyserNode | null, isPlaying: boolean): AudioDynamics {
    if (!analyser || !isPlaying) {
      this.beatHit *= 0.88;
      return {
        bass: 0,
        mid: 0,
        treble: 0,
        beatHit: this.beatHit,
        overallEnergy: 0,
      };
    }

    analyser.getByteFrequencyData(this.freqData);

    // 1. Sub-bass & Kick drum: bins 0 to 5 (~20 Hz - 140 Hz)
    let bassSum = 0;
    for (let i = 0; i < 6; i++) {
      bassSum += this.freqData[i] ?? 0;
    }
    const bass = bassSum / (6 * 255);

    // 2. Mid frequencies: bins 8 to 28 (~200 Hz - 800 Hz)
    let midSum = 0;
    for (let i = 8; i < 28; i++) {
      midSum += this.freqData[i] ?? 0;
    }
    const mid = midSum / (20 * 255);

    // 3. Treble frequencies: bins 30 to 55 (~1 kHz - 4.5 kHz)
    let trebleSum = 0;
    for (let i = 30; i < 55; i++) {
      trebleSum += this.freqData[i] ?? 0;
    }
    const treble = trebleSum / (25 * 255);

    // 4. StereoDrift Transient Beat Spike Detection
    this.runningBassAvg = this.runningBassAvg * 0.94 + bass * 0.06;
    if (bass > this.runningBassAvg * 1.28 && bass > 0.22) {
      const delta = (bass - this.runningBassAvg) * 3.2;
      this.beatHit = Math.max(this.beatHit, Math.min(1.0, delta));
    }
    this.beatHit *= 0.86;

    const overallEnergy = (bass * 0.5 + mid * 0.35 + treble * 0.15);

    return {
      bass,
      mid,
      treble,
      beatHit: this.beatHit,
      overallEnergy,
    };
  }
}

// ============================================================================
// 4. StereoDrift Perlin Gradient Coordinates Engine
// ============================================================================
export interface GradientSpot {
  x: number; // percentage (0 - 100)
  y: number; // percentage (0 - 100)
  radius: number; // percentage radius
  color: string;
}

export class StereoDriftGradientEngine {
  private analyzer = new StereoDriftAnalyzer();
  private time = 0;

  /**
   * Computes the real-time audio-reactive gradient string based on StereoDrift logic.
   */
  update(
    analyser: AnalyserNode | null,
    isPlaying: boolean,
    dt: number,
    colors: {
      primary: string;
      secondary: string;
      accent?: string;
      darkBg?: string;
    },
  ): {
    background: string;
    opacity: number;
    scale: number;
    dynamics: AudioDynamics;
  } {
    const dynamics = this.analyzer.analyze(analyser, isPlaying);

    // Time progresses with musical momentum: surges with kick and energy
    const timeScale = isPlaying ? 0.35 + dynamics.bass * 0.6 + dynamics.beatHit * 0.4 : 0.08;
    this.time += dt * timeScale;

    // Perlin noise continuous flow coordinates
    const t = this.time;

    // Spot 1 (Primary / Kick bloom) - centered with bass expansion
    const p1X = 50 + perlin.get(t * 0.4, 0.5) * (18 + dynamics.bass * 16);
    const p1Y = 40 + perlin.get(0.5, t * 0.4) * (16 + dynamics.bass * 14);
    const r1 = 45 + dynamics.bass * 25 + dynamics.beatHit * 22;

    // Spot 2 (Secondary / Mid harmony flow) - top right / counter swirl
    const p2X = 75 + perlin.get(t * 0.35 + 5, 2.5) * (20 + dynamics.mid * 15);
    const p2Y = 25 + perlin.get(2.5, t * 0.35 + 5) * (18 + dynamics.mid * 14);
    const r2 = 40 + dynamics.mid * 20;

    // Spot 3 (Tertiary / Low-end base) - bottom left
    const p3X = 25 + perlin.get(t * 0.3 + 10, 7.5) * (16 + dynamics.treble * 12);
    const p3Y = 75 + perlin.get(7.5, t * 0.3 + 10) * (16 + dynamics.treble * 12);
    const r3 = 45 + dynamics.treble * 15;

    // Spot 4 (Center ambience)
    const p4X = 50 + perlin.get(t * 0.2 + 20, 15) * 12;
    const p4Y = 60 + perlin.get(15, t * 0.2 + 20) * 12;
    const r4 = 65 + dynamics.overallEnergy * 15;

    const c1 = colors.primary;
    const c2 = colors.secondary;
    const c3 = colors.accent ?? colors.primary;
    const c4 = colors.darkBg ?? '#0a0a0f';

    const background = `
      radial-gradient(circle at ${p1X.toFixed(1)}% ${p1Y.toFixed(1)}%, ${c1} 0%, transparent ${r1.toFixed(1)}%),
      radial-gradient(circle at ${p2X.toFixed(1)}% ${p2Y.toFixed(1)}%, ${c2} 0%, transparent ${r2.toFixed(1)}%),
      radial-gradient(circle at ${p3X.toFixed(1)}% ${p3Y.toFixed(1)}%, ${c3} 0%, transparent ${r3.toFixed(1)}%),
      radial-gradient(circle at ${p4X.toFixed(1)}% ${p4Y.toFixed(1)}%, ${c4} 0%, transparent ${r4.toFixed(1)}%)
    `;

    // Dynamic opacity & scale surge on beat
    const baseOpacity = isPlaying ? 0.42 : 0.22;
    const opacity = baseOpacity + dynamics.bass * 0.25 + dynamics.beatHit * 0.18;
    const scale = 1.0 + dynamics.beatHit * 0.05 + dynamics.bass * 0.02;

    return {
      background,
      opacity: Math.min(0.95, opacity),
      scale,
      dynamics,
    };
  }
}



