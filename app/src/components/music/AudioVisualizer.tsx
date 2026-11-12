import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { useEffect, useRef } from 'react';
import { getAudioAnalyser, usePlayer } from '@/state/player';
import { useArtworkAccent } from '@/lib/artworkAccent';

export type VisualizerMode = 'bars' | 'wave';

interface VisualizerStore {
  enabled: boolean;
  mode: VisualizerMode;
  toggleEnabled: () => void;
  cycleMode: () => void;
  setMode: (mode: VisualizerMode) => void;
}

export const useVisualizerStore = create<VisualizerStore>()(
  persist(
    (set) => ({
      enabled: true,
      mode: 'bars',
      toggleEnabled: () => set((s) => ({ enabled: !s.enabled })),
      cycleMode: () => set((s) => ({ mode: s.mode === 'bars' ? 'wave' : 'bars' })),
      setMode: (mode) => set({ mode }),
    }),
    { name: 'sudinchord-visualizer' },
  ),
);

interface AudioVisualizerProps {
  className?: string;
  height?: number;
  barCount?: number;
}

export function AudioVisualizer({ className = '', height = 48, barCount = 36 }: AudioVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const enabled = useVisualizerStore((s) => s.enabled);
  const mode = useVisualizerStore((s) => s.mode);
  const playing = usePlayer((s) => s.status === 'playing' || s.status === 'buffering');
  const artworkUrl = usePlayer((s) => s.nowPlaying?.artworkUrl);
  const accent = useArtworkAccent(artworkUrl);
  const colorsRef = useRef(accent);
  colorsRef.current = accent;

  useEffect(() => {
    if (!enabled) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    const peaks = new Float32Array(barCount);
    const smoothedBars = new Float32Array(barCount);

    const render = () => {
      animId = requestAnimationFrame(render);

      const dpr = window.devicePixelRatio || 1;
      const width = canvas.clientWidth;
      const h = canvas.clientHeight || height;

      if (canvas.width !== width * dpr || canvas.height !== h * dpr) {
        canvas.width = width * dpr;
        canvas.height = h * dpr;
      }

      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, width, h);

      const analyser = getAudioAnalyser();
      const colors = colorsRef.current;

      if (mode === 'bars') {
        // Frequency bars
        const freqData = new Uint8Array(analyser ? analyser.frequencyBinCount : 64);
        let hasSignal = false;
        if (analyser && playing) {
          analyser.getByteFrequencyData(freqData);
          for (let k = 0; k < freqData.length; k++) {
            if ((freqData[k] ?? 0) > 8) {
              hasSignal = true;
              break;
            }
          }
        }

        const totalBars = barCount;
        const gap = 3;
        const barWidth = Math.max(2, (width - gap * (totalBars - 1)) / totalBars);
        const binStep = Math.max(1, Math.floor((freqData.length * 0.75) / totalBars));
        const nowSec = performance.now() / 1000;

        for (let i = 0; i < totalBars; i++) {
          let rawValue = 0;
          if (playing) {
            if (hasSignal) {
              const binIndex = Math.min(freqData.length - 1, i * binStep);
              rawValue = (freqData[binIndex] ?? 0) / 255;
            } else {
              // Rhythmic fallback simulation when hardware analyser is unrouted/muted
              const beat = (nowSec * 2.1 + (i / totalBars) * 0.8) % 1.0;
              const env = Math.exp(-beat * 3.5);
              const freqTilt = 1.0 - (i / totalBars) * 0.45;
              rawValue = Math.max(0, env * freqTilt * (0.4 + 0.5 * Math.sin(nowSec * 3.5 + i)));
            }
          }

          // Smooth animation
          const currentSmoothed = smoothedBars[i] ?? 0;
          const nextSmoothed = currentSmoothed * 0.8 + rawValue * 0.2;
          smoothedBars[i] = nextSmoothed;

          const barHeight = Math.max(3, nextSmoothed * (h - 8));
          const currentPeak = peaks[i] ?? 0;

          // Peaks
          let nextPeak = currentPeak;
          if (barHeight > currentPeak) {
            nextPeak = barHeight;
          } else {
            nextPeak = Math.max(3, currentPeak - 0.7);
          }
          peaks[i] = nextPeak;

          const x = i * (barWidth + gap);
          const y = h - barHeight;

          // Gradient bar styled with dynamic album artwork colors
          const gradient = ctx.createLinearGradient(0, y, 0, h);
          gradient.addColorStop(0, colors.primary);
          gradient.addColorStop(0.5, colors.secondary);
          gradient.addColorStop(1, colors.baseAlpha);

          ctx.fillStyle = gradient;
          ctx.beginPath();
          const r = Math.min(barWidth / 2, 3);
          ctx.roundRect(x, y, barWidth, barHeight, [r, r, 0, 0]);
          ctx.fill();

          // Peak cap
          if (nextPeak > 6) {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
            const peakY = Math.max(0, h - nextPeak - 2);
            ctx.beginPath();
            ctx.roundRect(x, peakY, barWidth, 1.5, 1);
            ctx.fill();
          }
        }
      } else {
        // Liquid Oscilloscope Waveform
        const waveData = new Uint8Array(analyser ? analyser.fftSize : 128);
        let hasSignal = false;
        if (analyser && playing) {
          analyser.getByteTimeDomainData(waveData);
          for (let k = 0; k < waveData.length; k++) {
            if (Math.abs((waveData[k] ?? 128) - 128) > 3) {
              hasSignal = true;
              break;
            }
          }
        } else {
          waveData.fill(128);
        }

        const nowSec = performance.now() / 1000;
        ctx.beginPath();
        const sliceWidth = width / (waveData.length - 1);
        let x = 0;

        for (let i = 0; i < waveData.length; i++) {
          let v = 0;
          if (playing) {
            if (hasSignal) {
              const rawByte = waveData[i] ?? 128;
              v = (rawByte - 128) / 128; // -1 to 1
            } else {
              v = 0.5 * Math.sin(nowSec * 5.0 + (i / waveData.length) * Math.PI * 4.0) * Math.cos(nowSec * 2.0);
            }
          }
          const y = h / 2 + v * (h * 0.42);

          if (i === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
          x += sliceWidth;
        }

        ctx.strokeStyle = colors.primary;
        ctx.lineWidth = 2.4;
        ctx.shadowColor = colors.glow;
        ctx.shadowBlur = 10;
        ctx.stroke();

        // Soft gradient under wave
        ctx.lineTo(width, h);
        ctx.lineTo(0, h);
        ctx.closePath();
        const fillGrad = ctx.createLinearGradient(0, h / 2, 0, h);
        fillGrad.addColorStop(0, colors.baseAlpha);
        fillGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = fillGrad;
        ctx.fill();
      }

      ctx.restore();
    };

    render();

    return () => {
      cancelAnimationFrame(animId);
    };
  }, [enabled, mode, playing, height, barCount]);

  if (!enabled) return null;

  return (
    <div className={`relative w-full overflow-hidden ${className}`} style={{ height }}>
      <canvas ref={canvasRef} className="block size-full" />
    </div>
  );
}
