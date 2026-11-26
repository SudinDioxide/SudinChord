// Adapted from reszkovy/gr4dient (https://github.com/reszkovy/gr4dient)
// MIT License, Copyright (c) 2026 reszkovy
//
// Animated gradient generator that loops on the beat:
// - 4 modes: Field (mesh), Current (flow), Fold (silk), Beam (rays)
// - Colors blended in Oklab color space (zero muddy gray transitions)
// - Beat-synchronized animation phase (bars * 240 / bpm)
// - Single-pass film grain, living grain, and Bayer matrix dither

export type Oklab = [number, number, number]; // [L, a, b]
export type Rgb = [number, number, number]; // [r, g, b] 0-255

export type Gr4dientMode = 0 | 1 | 2 | 3;
export const GR4DIENT_MODES = [
  { id: 0 as const, name: 'Field', description: 'Liquid Mesh' },
  { id: 1 as const, name: 'Current', description: 'Wave Flow' },
  { id: 2 as const, name: 'Fold', description: 'Billowing Silk' },
  { id: 3 as const, name: 'Beam', description: 'Radiant Rays' },
] as const;

export function srgbToOklab(r255: number, g255: number, b255: number): Oklab {
  const c = [r255 / 255, g255 / 255, b255 / 255].map((v) =>
    v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4),
  );
  const l = Math.cbrt(0.4122214708 * c[0]! + 0.5363325363 * c[1]! + 0.0514459929 * c[2]!);
  const m = Math.cbrt(0.2119034982 * c[0]! + 0.6806995451 * c[1]! + 0.1073969566 * c[2]!);
  const s = Math.cbrt(0.0883024619 * c[0]! + 0.2817188376 * c[1]! + 0.6299787005 * c[2]!);
  return [
    0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s,
  ];
}

export function mixOklab(from: Oklab, to: Oklab, t: number): Oklab {
  return [
    from[0] + (to[0] - from[0]) * t,
    from[1] + (to[1] - from[1]) * t,
    from[2] + (to[2] - from[2]) * t,
  ];
}

/** Extracts 5 harmonic, well-spaced Oklab colors from the 16 artwork mesh cells. */
export function extractGr4dientColors(cells: Rgb[]): Oklab[] {
  if (!cells || cells.length === 0) {
    return [
      srgbToOklab(25, 25, 30),
      srgbToOklab(45, 35, 55),
      srgbToOklab(30, 45, 60),
      srgbToOklab(55, 30, 40),
      srgbToOklab(20, 20, 25),
    ];
  }
  // Pick distinct cells: corners and key focal regions
  const indices = [0, 3, 5, 10, 15];
  return indices.map((idx) => {
    const [r, g, b] = cells[idx] ?? cells[0] ?? [30, 30, 35];
    return srgbToOklab(r, g, b);
  });
}

const VERTEX_SHADER = `
attribute vec2 p;
void main() {
  gl_Position = vec4(p, 0.0, 1.0);
}
`;

const FRAGMENT_SHADER = `
precision highp float;
uniform vec2 uRes;
uniform float uPhase;
uniform int uMode;
uniform int uCount;
uniform vec3 uCol[5];
uniform vec2 uPts[5];
uniform vec2 uFocus;
uniform float uSeed;
uniform float uScale;
uniform float uWarp;
uniform float uSoft;
uniform float uAngle;
uniform float uMotion;
uniform float uGrain;
uniform float uGrainSize;
uniform float uGrainAnim;
uniform float uDither;
uniform float uLevels;
uniform float uPixel;
uniform float uContrast;
uniform float uSat;
uniform float uBright;
uniform float uVignette;

#define TAU 6.28318530718

// hash12: Dave Hoskins (MIT License)
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

vec3 permute(vec3 x) {
  return mod(((x * 34.0) + 1.0) * x, 289.0);
}

// snoise: Ashima Arts / Stefan Gustavson (MIT License)
float snoise(vec2 v) {
  const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
  vec2 i = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod(i, 289.0);
  vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
  m = m * m;
  m = m * m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
  vec3 g;
  g.x = a0.x * x0.x + h.x * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}

float fbm(vec2 p) {
  float s = 0.0, a = 0.5;
  mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
  for (int i = 0; i < 4; i++) {
    s += a * snoise(p);
    p = m * p;
    a *= 0.5;
  }
  return s;
}

float fbm2(vec2 p) {
  return 0.62 * snoise(p) + 0.24 * snoise(mat2(1.6, 1.2, -1.2, 1.6) * p + 3.7);
}

float bayer2(vec2 a) {
  a = floor(a);
  return fract(dot(a, vec2(0.5, a.y * 0.75)));
}

float bayer4(vec2 a) {
  return bayer2(0.5 * a) * 0.25 + bayer2(a);
}

float bayer8(vec2 a) {
  return bayer4(0.5 * a) * 0.25 + bayer2(a);
}

vec2 SO;

vec2 lp(float r) {
  float a = uPhase * TAU;
  return vec2(cos(a), sin(a)) * r * uMotion;
}

vec3 pal(int i) {
  vec3 c = uCol[0];
  for (int j = 1; j < 5; j++) {
    if (j == i) c = uCol[j];
  }
  return c;
}

vec3 ramp(float t) {
  t = clamp(t, 0.0, 1.0);
  float x = t * float(uCount - 1);
  float fi = floor(x);
  float f = x - fi;
  f = mix(f, smoothstep(0.0, 1.0, f), 0.6);
  int i = int(fi);
  return mix(pal(i), pal(i + 1), f);
}

vec3 oklab2srgb(vec3 c) {
  float l_ = c.x + 0.3963377774 * c.y + 0.2158037573 * c.z;
  float m_ = c.x - 0.1055613458 * c.y - 0.0638541728 * c.z;
  float s_ = c.x - 0.0894841775 * c.y - 1.2914855480 * c.z;
  float l = l_ * l_ * l_;
  float m = m_ * m_ * m_;
  float s = s_ * s_ * s_;
  vec3 lin = vec3(
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
  );
  lin = clamp(lin, 0.0, 1.0);
  return mix(12.92 * lin, 1.055 * pow(lin, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, lin));
}

// MESH: colour points blended by inverse distance, domain-warped by noise
vec3 mesh(vec2 uv) {
  vec2 q = uv * uScale * 0.8 + SO;
  vec2 w = vec2(fbm2(q + lp(0.6)), fbm2(q + vec2(5.2, 1.3) + lp(0.6)));
  vec2 p = uv + w * uWarp * 0.3;
  float pw = mix(5.0, 2.0, uSoft);
  vec3 acc = vec3(0.0);
  float ws = 0.0;
  float a = uPhase * TAU;
  for (int j = 0; j < 5; j++) {
    if (j < uCount) {
      float fj = float(j);
      vec2 c = uPts[j] + uMotion * 0.12 * vec2(sin(a * (1.0 + mod(fj, 2.0)) + fj * 1.7), cos(a * (1.0 + mod(fj + 1.0, 2.0)) + fj * 2.3));
      float d = length(p - c);
      float wt = 1.0 / pow(d * d + 0.0015, pw * 0.5);
      acc += uCol[j] * wt;
      ws += wt;
    }
  }
  return acc / ws;
}

// FLOW: two levels of domain warping mapped onto the palette ramp
vec3 flow(vec2 uv) {
  vec2 p = uv * uScale * 0.5 + SO;
  vec2 q = vec2(fbm2(p + lp(0.45)), fbm2(p + vec2(5.2, 1.3) - lp(0.45)));
  vec2 r = vec2(fbm2(p + q * uWarp * 1.2 + vec2(1.7, 9.2) + lp(0.3)), fbm2(p + q * uWarp * 1.2 + vec2(8.3, 2.8)));
  float f = fbm2(p + r * uWarp * 1.2);
  return ramp(f * mix(1.3, 0.8, uSoft) + 0.5);
}

// SILK: a height field lit like folded fabric
float silkH(vec2 p) {
  vec2 q = p;
  q.y += snoise(p * 0.35 + SO + lp(0.4)) * uWarp * 0.8;
  return sin(q.y * 1.6 + snoise(q * 0.45 + SO + lp(0.25)) * 2.2);
}

vec3 silk(vec2 uv) {
  vec2 p = uv * uScale * 1.2;
  float e = 0.004;
  float h = silkH(p);
  float hx = silkH(p + vec2(e, 0.0));
  float hy = silkH(p + vec2(0.0, e));
  vec3 n = normalize(vec3(-(hx - h) / e, -(hy - h) / e, mix(2.2, 6.0, uSoft)));
  vec3 L = normalize(vec3(-0.5, 0.6, 0.8));
  float dif = clamp(dot(n, L), 0.0, 1.0);
  float spec = pow(clamp(dot(reflect(-L, n), vec3(0.0, 0.0, 1.0)), 0.0, 1.0), 24.0);
  vec3 c = ramp(h * 0.5 + 0.5);
  c.x *= mix(0.6, 1.08, dif);
  c.x += spec * 0.16 * (1.0 - uSoft * 0.5);
  return c;
}

// RAYS: light beams from a focus point
vec3 rays(vec2 uv) {
  vec2 d = uv - uFocus;
  float r = length(d);
  vec2 dir = d / (r + 1e-4);
  float n = fbm(dir * uScale * 2.0 + SO + lp(0.35));
  float n2 = fbm(dir * uScale * 5.0 + SO * 1.3 - lp(0.25));
  float beams = smoothstep(-0.3, 0.8, n * 0.8 + n2 * 0.4);
  float wr = r + fbm(uv * 1.5 + SO + lp(0.3)) * uWarp * 0.2;
  float t = exp(-wr * mix(2.6, 1.1, uSoft)) * (0.35 + 0.9 * beams) + 0.3 * exp(-r * r * 18.0);
  return ramp(t);
}

void main() {
  SO = vec2(sin(uSeed * 1.3), cos(uSeed * 1.7)) * 40.0;
  float unit = min(uRes.x, uRes.y) / 1080.0;
  float px = max(1.0, floor(uPixel * unit + 0.5));
  vec2 fc = gl_FragCoord.xy;
  if (uDither > 0.5) fc = (floor(fc / px) + 0.5) * px;
  vec2 uv = (fc - 0.5 * uRes) / min(uRes.x, uRes.y);
  float ca = cos(uAngle), sa = sin(uAngle);
  uv = mat2(ca, -sa, sa, ca) * uv;
  vec3 lab;
  if (uMode == 0) lab = mesh(uv);
  else if (uMode == 1) lab = flow(uv);
  else if (uMode == 2) lab = silk(uv);
  else lab = rays(uv);
  vec3 col = oklab2srgb(lab);
  col += uBright;
  col = (col - 0.5) * uContrast + 0.5;
  float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(vec3(lum), col, uSat);
  vec2 vu = (gl_FragCoord.xy - 0.5 * uRes) / max(uRes.x, uRes.y);
  col *= 1.0 - uVignette * smoothstep(0.15, 0.75, length(vu) * 1.4);
  float gs = max(1.0, uGrainSize * unit);
  vec2 gp = floor(gl_FragCoord.xy / gs);
  float gt = uGrainAnim > 0.5 ? floor(uPhase * 240.0) : 0.0;
  float g = hash12(gp + gt * 17.13) + hash12(gp * 1.37 + 11.1 + gt * 3.7) - 1.0;
  col += g * uGrain * 0.5;
  if (uDither > 0.5) {
    float L = uLevels - 1.0;
    col = floor(clamp(col, 0.0, 1.0) * L + bayer8(floor(gl_FragCoord.xy / px))) / L;
  }
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;

const DEFAULT_POINTS: [number, number][] = [
  [-0.45, 0.35],
  [0.45, 0.25],
  [0.0, -0.05],
  [-0.35, -0.38],
  [0.45, -0.35],
];

export interface AudioPulse {
  bass: number; // 0.0 to 1.0 (continuous sub-bass & kick energy)
  mid: number; // 0.0 to 1.0 (vocals & snare energy)
  treble?: number; // 0.0 to 1.0 (shimmer & high frequencies)
  beatHit: number; // 0.0 to 1.0 (transient kick drum impulse)
}

export interface Gr4dientRenderer {
  render: (colors: Oklab[], phase: number, mode: Gr4dientMode, pulse?: AudioPulse) => void;
  dispose: () => void;
}

export function createGr4dientRenderer(canvas: HTMLCanvasElement): Gr4dientRenderer | null {
  const gl = canvas.getContext('webgl', {
    alpha: false,
    antialias: false,
    depth: false,
    powerPreference: 'low-power',
    preserveDrawingBuffer: false,
  });
  if (!gl) return null;

  function compile(type: number, src: string): WebGLShader | null {
    const s = gl!.createShader(type);
    if (!s) return null;
    gl!.shaderSource(s, src);
    gl!.compileShader(s);
    if (!gl!.getShaderParameter(s, gl!.COMPILE_STATUS)) {
      console.warn('gr4dient shader compile failed:', gl!.getShaderInfoLog(s));
      gl!.deleteShader(s);
      return null;
    }
    return s;
  }

  const vs = compile(gl.VERTEX_SHADER, VERTEX_SHADER);
  const fs = compile(gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
  if (!vs || !fs) return null;

  const pr = gl.createProgram();
  if (!pr) return null;
  gl.attachShader(pr, vs);
  gl.attachShader(pr, fs);
  gl.linkProgram(pr);
  if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) {
    console.warn('gr4dient link failed:', gl.getProgramInfoLog(pr));
    return null;
  }
  gl.useProgram(pr);

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(pr, 'p');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

  const U: Record<string, WebGLUniformLocation | null> = {};
  const uniformNames = [
    'uRes',
    'uPhase',
    'uMode',
    'uCount',
    'uCol',
    'uPts',
    'uFocus',
    'uSeed',
    'uScale',
    'uWarp',
    'uSoft',
    'uAngle',
    'uMotion',
    'uGrain',
    'uGrainSize',
    'uGrainAnim',
    'uDither',
    'uLevels',
    'uPixel',
    'uContrast',
    'uSat',
    'uBright',
    'uVignette',
  ];
  for (const k of uniformNames) {
    U[k] = gl.getUniformLocation(pr, k);
  }

  // Pre-flatten default points
  const flatPts = new Float32Array(10);
  for (let i = 0; i < 5; i++) {
    flatPts[i * 2] = DEFAULT_POINTS[i]![0];
    flatPts[i * 2 + 1] = DEFAULT_POINTS[i]![1];
  }

  const flatCols = new Float32Array(15);

  return {
    render(colors: Oklab[], phase: number, mode: Gr4dientMode, pulse?: AudioPulse) {
      const scale = Math.min(window.devicePixelRatio || 1, 1.2);
      const width = Math.max(1, Math.round(canvas.clientWidth * scale));
      const height = Math.max(1, Math.round(canvas.clientHeight * scale));

      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      gl.viewport(0, 0, width, height);

      const count = Math.min(5, Math.max(2, colors.length));
      for (let i = 0; i < 5; i++) {
        const c = colors[Math.min(i, count - 1)]!;
        flatCols[i * 3] = c[0];
        flatCols[i * 3 + 1] = c[1];
        flatCols[i * 3 + 2] = c[2];
      }

      const bass = pulse ? pulse.bass : 0;
      const mid = pulse ? pulse.mid : 0;
      const treble = pulse?.treble ?? (bass * 0.3 + mid * 0.4);
      const beat = pulse ? pulse.beatHit : 0;

      // Harmonic Lissajous Orbs physics (high sensitivity)
      // Phase t advances seamlessly in sync with musical downbeats
      const t = phase * Math.PI * 2;

      // Orb 0 (Top Left [-0.45, 0.35] - Bass harmonic 2:3 ratio)
      const r0x = 0.15 + bass * 0.22 + beat * 0.20;
      const r0y = 0.12 + bass * 0.18 + beat * 0.16;
      flatPts[0] = DEFAULT_POINTS[0]![0] + Math.sin(t * 2.0 + Math.PI * 0.25) * r0x;
      flatPts[1] = DEFAULT_POINTS[0]![1] + Math.cos(t * 3.0) * r0y;

      // Orb 1 (Top Right [0.45, 0.25] - Mid/Vocal counter-phase 3:4 ratio)
      const r1x = 0.14 + mid * 0.25;
      const r1y = 0.13 + mid * 0.22;
      flatPts[2] = DEFAULT_POINTS[1]![0] + Math.sin(t * 3.0 + Math.PI * 0.5) * r1x;
      flatPts[3] = DEFAULT_POINTS[1]![1] + Math.cos(t * 4.0) * r1y;

      // Orb 2 (Center [0.0, -0.05] - Sub-bass kick dilated Lissajous 1:2 figure-8 knot)
      const r2x = 0.18 + bass * 0.28 + beat * 0.36;
      const r2y = 0.14 + bass * 0.22 + beat * 0.30;
      flatPts[4] = DEFAULT_POINTS[2]![0] + Math.sin(t * 1.0) * r2x;
      flatPts[5] = DEFAULT_POINTS[2]![1] + Math.cos(t * 2.0) * r2y;

      // Orb 3 (Bottom Left [-0.35, -0.38] - Treble shimmer harmonic 3:5 ratio)
      const r3x = 0.13 + treble * 0.24;
      const r3y = 0.14 + treble * 0.22;
      flatPts[6] = DEFAULT_POINTS[3]![0] + Math.sin(t * 3.0 + Math.PI * 0.75) * r3x;
      flatPts[7] = DEFAULT_POINTS[3]![1] + Math.cos(t * 5.0) * r3y;

      // Orb 4 (Bottom Right [0.45, -0.35] - Transient beat surge 4:5 ratio)
      const r4x = 0.15 + beat * 0.32 + bass * 0.18;
      const r4y = 0.13 + beat * 0.28 + bass * 0.15;
      flatPts[8] = DEFAULT_POINTS[4]![0] + Math.sin(t * 4.0 + Math.PI) * r4x;
      flatPts[9] = DEFAULT_POINTS[4]![1] + Math.cos(t * 5.0) * r4y;

      // Harmonic Focus for Beam/Rays mode
      const focusX = 0.0 + Math.sin(t * 1.5) * (0.16 + beat * 0.18);
      const focusY = 0.38 + Math.cos(t * 2.0 + 0.5) * (0.12 + bass * 0.14);

      // Dynamic physical reaction to music beat & bass drops
      const baseScale = mode === 1 ? 0.7 : mode === 2 ? 0.9 : 1.1;
      const dynamicScale = baseScale * (1.0 + beat * 0.22 + bass * 0.10);

      const baseWarp = mode === 2 ? 0.9 : 0.75;
      const dynamicWarp = baseWarp + bass * 0.75 + beat * 0.45;

      const dynamicMotion = 0.9 + bass * 1.1 + beat * 0.8;
      const dynamicBright = -0.04 + beat * 0.12 + bass * 0.05;
      const dynamicSat = 1.05 + beat * 0.35 + bass * 0.20;

      gl.uniform2f(U.uRes!, width, height);
      gl.uniform1f(U.uPhase!, phase);
      gl.uniform1i(U.uMode!, mode);
      gl.uniform1i(U.uCount!, count);
      gl.uniform3fv(U.uCol!, flatCols);
      gl.uniform2fv(U.uPts!, flatPts);
      gl.uniform2f(U.uFocus!, focusX, focusY);
      gl.uniform1f(U.uSeed!, 3.14);
      gl.uniform1f(U.uScale!, dynamicScale);
      gl.uniform1f(U.uWarp!, dynamicWarp);
      gl.uniform1f(U.uSoft!, 0.55);
      gl.uniform1f(U.uAngle!, 0.0);
      gl.uniform1f(U.uMotion!, dynamicMotion);
      gl.uniform1f(U.uGrain!, 0.12);
      gl.uniform1f(U.uGrainSize!, 1.4);
      gl.uniform1f(U.uGrainAnim!, 1.0);
      gl.uniform1f(U.uDither!, 0.0);
      gl.uniform1f(U.uLevels!, 4.0);
      gl.uniform1f(U.uPixel!, 1.0);
      gl.uniform1f(U.uContrast!, 1.0);
      gl.uniform1f(U.uSat!, dynamicSat);
      gl.uniform1f(U.uBright!, dynamicBright);
      gl.uniform1f(U.uVignette!, 0.35);

      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
    dispose() {
      gl.deleteBuffer(buf);
      gl.deleteProgram(pr);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
    },
  };
}
