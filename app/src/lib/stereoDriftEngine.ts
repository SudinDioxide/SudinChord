import { getAudioAnalyser } from '@/state/player';
import type { ArtworkAccent } from './artworkAccent';

export interface StereoDriftAudioMetrics {
  bass: number;       // 0.0 - 1.0 (sub-bass & kick drum energy)
  mids: number;       // 0.0 - 1.0 (vocals & synth harmony)
  treble: number;     // 0.0 - 1.0 (hi-hats & presence)
  energy: number;     // 0.0 - 1.0 (overall RMS volume)
  beatPulse: number;  // 0.0 - 1.0 (punchy kick drum transient hit)
}

export interface StereoDriftColor {
  r: number;
  g: number;
  b: number;
}

export function parseColor(colorStr: string): StereoDriftColor {
  // Handles "#rrggbb", "rgb(r, g, b)", and "rgba(r, g, b, a)"
  if (colorStr.startsWith('#')) {
    const hex = colorStr.slice(1);
    const r = parseInt(hex.slice(0, 2), 16) || 0;
    const g = parseInt(hex.slice(2, 4), 16) || 0;
    const b = parseInt(hex.slice(4, 6), 16) || 0;
    return { r, g, b };
  }
  const match = colorStr.match(/rgba?\((\d+)[,\s]+(\d+)[,\s]+(\d+)/);
  if (match) {
    return {
      r: parseInt(match[1]!, 10) || 0,
      g: parseInt(match[2]!, 10) || 0,
      b: parseInt(match[3]!, 10) || 0,
    };
  }
  return { r: 255, g: 0, b: 51 };
}

export function lerpColor(c1: StereoDriftColor, c2: StereoDriftColor, t: number): StereoDriftColor {
  const clampT = Math.max(0, Math.min(1, t));
  return {
    r: Math.round(c1.r + (c2.r - c1.r) * clampT),
    g: Math.round(c1.g + (c2.g - c1.g) * clampT),
    b: Math.round(c1.b + (c2.b - c1.b) * clampT),
  };
}

/**
 * StereoDrift Gradient & Audio-Reactive Visualizer Engine.
 * Adapted from stereoDrift (https://github.com/stereoDrift/stereoDrift.github.io).
 *
 * Core Logic:
 * - Real-time FFT spectrum decomposition via Web Audio AnalyserNode.
 * - Dynamic adaptive kick-drum threshold detection.
 * - Harmonic multi-wave trajectory orbits (Lissajous & Perlin wave curves).
 * - Multi-layer radial mesh gradients with bass-responsive radial expansion and energy glow.
 */
export class StereoDriftEngine {
  private readonly freqData = new Uint8Array(64);
  private runningBassAvg = 0.2;
  private beatPulse = 0;

  // Active interpolated palette
  private currentColor1: StereoDriftColor = { r: 250, g: 35, b: 59 };
  private currentColor2: StereoDriftColor = { r: 168, g: 85, b: 247 };
  private currentColor3: StereoDriftColor = { r: 30, g: 45, b: 70 };

  private targetColor1: StereoDriftColor = { r: 250, g: 35, b: 59 };
  private targetColor2: StereoDriftColor = { r: 168, g: 85, b: 247 };
  private targetColor3: StereoDriftColor = { r: 30, g: 45, b: 70 };

  // Simulation time
  private simTime = 0;

  /** Update target colors from album art accent palette with smooth interpolation */
  setAccent(accent: ArtworkAccent) {
    this.targetColor1 = parseColor(accent.glow || accent.primary);
    this.targetColor2 = parseColor(accent.secondary);
    this.targetColor3 = parseColor(accent.darkBg || '#1e142b');
  }

  /** Read real-time frequency bands and detect beat drops */
  analyzeAudio(isPlaying: boolean): StereoDriftAudioMetrics {
    const analyser = getAudioAnalyser();
    if (!analyser || !isPlaying) {
      this.beatPulse *= 0.88;
      return {
        bass: 0,
        mids: 0,
        treble: 0,
        energy: 0,
        beatPulse: this.beatPulse,
      };
    }

    analyser.getByteFrequencyData(this.freqData);

    // 1. Sub-bass & kick drum: bins 0 to 6 (~20 Hz - 140 Hz)
    let bassSum = 0;
    for (let i = 0; i < 7; i++) {
      bassSum += this.freqData[i]!;
    }
    const bass = bassSum / (7 * 255);

    // 2. Mid frequencies: bins 10 to 35 (~250 Hz - 1 kHz)
    let midSum = 0;
    for (let i = 10; i < 35; i++) {
      midSum += this.freqData[i]!;
    }
    const mids = midSum / (25 * 255);

    // 3. Treble & presence: bins 36 to 58 (~1.5 kHz - 8 kHz)
    let trebleSum = 0;
    for (let i = 36; i < 58; i++) {
      trebleSum += this.freqData[i]!;
    }
    const treble = trebleSum / (22 * 255);

    const energy = bass * 0.5 + mids * 0.35 + treble * 0.15;

    // Adaptive transient beat detection (StereoDrift kick strike)
    this.runningBassAvg = this.runningBassAvg * 0.94 + bass * 0.06;
    if (bass > this.runningBassAvg * 1.22 && bass > 0.18) {
      const delta = (bass - this.runningBassAvg) * 3.8;
      this.beatPulse = Math.max(this.beatPulse, Math.min(1.0, delta));
    }

    this.beatPulse *= 0.91; // smooth release envelope

    return {
      bass,
      mids,
      treble,
      energy,
      beatPulse: this.beatPulse,
    };
  }

  /**
   * Render StereoDrift fluid reactive gradient to canvas
   * @param ctx 2D Canvas rendering context
   * @param width Canvas width
   * @param height Canvas height
   * @param dt Elapsed seconds
   * @param isPlaying Audio play state
   */
  render(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    dt: number,
    isPlaying: boolean,
  ) {
    const metrics = this.analyzeAudio(isPlaying);

    // Smooth color palette morphing
    this.currentColor1 = lerpColor(this.currentColor1, this.targetColor1, dt * 2.5);
    this.currentColor2 = lerpColor(this.currentColor2, this.targetColor2, dt * 2.5);
    this.currentColor3 = lerpColor(this.currentColor3, this.targetColor3, dt * 2.5);

    // Audio-reactive momentum: faster motion during drops and energetic sections
    const speed = isPlaying ? 0.35 + metrics.bass * 0.45 + metrics.beatPulse * 0.3 : 0.15;
    this.simTime += dt * speed;
    const t = this.simTime;

    // Clear background
    ctx.fillStyle = '#08090d';
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    ctx.globalCompositeOperation = 'screen';

    // StereoDrift Harmonic Orbs Configuration
    // Orb 1: Primary glow orb (top-right drifting center)
    const orb1X = width * 0.65 + Math.sin(t * 0.8) * width * 0.18 + Math.cos(t * 0.5) * width * 0.05;
    const orb1Y = height * 0.3 + Math.cos(t * 0.7) * height * 0.16 + metrics.beatPulse * 15;
    const orb1Radius =
      Math.min(width, height) * (0.45 + metrics.bass * 0.22 + metrics.beatPulse * 0.28);
    const alpha1 = Math.min(0.85, 0.42 + metrics.energy * 0.35 + metrics.beatPulse * 0.18);

    const grad1 = ctx.createRadialGradient(orb1X, orb1Y, 0, orb1X, orb1Y, orb1Radius);
    grad1.addColorStop(
      0,
      `rgba(${this.currentColor1.r}, ${this.currentColor1.g}, ${this.currentColor1.b}, ${alpha1.toFixed(3)})`,
    );
    grad1.addColorStop(
      0.65,
      `rgba(${this.currentColor1.r}, ${this.currentColor1.g}, ${this.currentColor1.b}, ${(alpha1 * 0.35).toFixed(3)})`,
    );
    grad1.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = grad1;
    ctx.beginPath();
    ctx.arc(orb1X, orb1Y, orb1Radius, 0, Math.PI * 2);
    ctx.fill();

    // Orb 2: Secondary wave orb (bottom-left harmonic sweep)
    const orb2X = width * 0.28 + Math.cos(t * 0.65) * width * 0.16 - Math.sin(t * 0.3) * width * 0.06;
    const orb2Y = height * 0.72 + Math.sin(t * 0.85) * height * 0.15 - metrics.beatPulse * 12;
    const orb2Radius =
      Math.min(width, height) * (0.5 + metrics.mids * 0.25 + metrics.beatPulse * 0.2);
    const alpha2 = Math.min(0.75, 0.36 + metrics.mids * 0.28 + metrics.beatPulse * 0.15);

    const grad2 = ctx.createRadialGradient(orb2X, orb2Y, 0, orb2X, orb2Y, orb2Radius);
    grad2.addColorStop(
      0,
      `rgba(${this.currentColor2.r}, ${this.currentColor2.g}, ${this.currentColor2.b}, ${alpha2.toFixed(3)})`,
    );
    grad2.addColorStop(
      0.6,
      `rgba(${this.currentColor2.r}, ${this.currentColor2.g}, ${this.currentColor2.b}, ${(alpha2 * 0.3).toFixed(3)})`,
    );
    grad2.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = grad2;
    ctx.beginPath();
    ctx.arc(orb2X, orb2Y, orb2Radius, 0, Math.PI * 2);
    ctx.fill();

    // Orb 3: Deep atmospheric bass anchor (center/bottom pulse)
    const orb3X = width * 0.48 + Math.sin(t * 0.45) * width * 0.12;
    const orb3Y = height * 0.52 + Math.cos(t * 0.55) * height * 0.14;
    const orb3Radius =
      Math.min(width, height) * (0.65 + metrics.bass * 0.35 + metrics.beatPulse * 0.3);
    const alpha3 = Math.min(0.65, 0.28 + metrics.bass * 0.3);

    const grad3 = ctx.createRadialGradient(orb3X, orb3Y, 0, orb3X, orb3Y, orb3Radius);
    grad3.addColorStop(
      0,
      `rgba(${this.currentColor3.r}, ${this.currentColor3.g}, ${this.currentColor3.b}, ${alpha3.toFixed(3)})`,
    );
    grad3.addColorStop(
      0.7,
      `rgba(${this.currentColor3.r}, ${this.currentColor3.g}, ${this.currentColor3.b}, ${(alpha3 * 0.2).toFixed(3)})`,
    );
    grad3.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = grad3;
    ctx.beginPath();
    ctx.arc(orb3X, orb3Y, orb3Radius, 0, Math.PI * 2);
    ctx.fill();

    // Orb 4: High-frequency shimmer highlight (reactive to vocals & cymbals)
    if (metrics.treble > 0.08 || metrics.beatPulse > 0.1) {
      const orb4X = width * 0.5 + Math.cos(t * 1.1) * width * 0.22;
      const orb4Y = height * 0.4 + Math.sin(t * 1.2) * height * 0.18;
      const orb4Radius = Math.min(width, height) * (0.28 + metrics.treble * 0.2);
      const alpha4 = Math.min(0.5, metrics.treble * 0.4 + metrics.beatPulse * 0.15);

      const grad4 = ctx.createRadialGradient(orb4X, orb4Y, 0, orb4X, orb4Y, orb4Radius);
      grad4.addColorStop(0, `rgba(255, 255, 255, ${alpha4.toFixed(3)})`);
      grad4.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.fillStyle = grad4;
      ctx.beginPath();
      ctx.arc(orb4X, orb4Y, orb4Radius, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }
}
