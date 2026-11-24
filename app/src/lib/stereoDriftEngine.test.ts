import { describe, it, expect } from 'vitest';
import { perlin, StereoDriftAnalyzer, StereoDriftGradientEngine, STEREODRIFT_PALETTES } from './stereoDriftEngine';

describe('StereoDrift Engine', () => {
  it('generates consistent continuous Perlin noise values', () => {
    const val1 = perlin.get(1.5, 2.5);
    const val2 = perlin.get(1.5, 2.5);
    expect(val1).toBe(val2);
    expect(val1).toBeGreaterThanOrEqual(-1);
    expect(val1).toBeLessThanOrEqual(1);

    // Nearby point should have close value (smoothness)
    const valNearby = perlin.get(1.51, 2.51);
    expect(Math.abs(val1 - valNearby)).toBeLessThan(0.1);
  });

  it('exposes curated StereoDrift palettes', () => {
    expect(STEREODRIFT_PALETTES.vapor).toBeDefined();
    expect(STEREODRIFT_PALETTES.vapor.primary).toBe('#f72585');
    expect(STEREODRIFT_PALETTES.analog).toBeDefined();
    expect(STEREODRIFT_PALETTES.emerald).toBeDefined();
  });

  it('handles null analyser gracefully in analyzer and gradient engine', () => {
    const analyzer = new StereoDriftAnalyzer();
    const dynamics = analyzer.analyze(null, false);
    expect(dynamics.bass).toBe(0);
    expect(dynamics.mid).toBe(0);
    expect(dynamics.treble).toBe(0);
    expect(dynamics.beatHit).toBe(0);

    const engine = new StereoDriftGradientEngine();
    const result = engine.update(null, false, 0.016, {
      primary: '#ff0033',
      secondary: '#9333ea',
    });

    expect(result.background).toContain('radial-gradient');
    expect(result.opacity).toBeGreaterThan(0);
    expect(result.scale).toBeGreaterThanOrEqual(1.0);
  });
});
