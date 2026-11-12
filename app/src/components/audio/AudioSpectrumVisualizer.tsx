import { useEffect, useRef } from 'react';
import { getAudioAnalyser, usePlayer } from '@/state/player';

interface AudioSpectrumProps {
  className?: string;
  bars?: number;
  height?: number;
}

export function AudioSpectrumVisualizer({ className = 'h-6 w-28', bars = 16, height = 24 }: AudioSpectrumProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isPlaying = usePlayer((s) => s.status === 'playing');

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    const analyser = getAudioAnalyser();
    const dataArray = analyser ? new Uint8Array(analyser.frequencyBinCount) : new Uint8Array(bars);

    const render = () => {
      if (!isPlaying) {
        // Flat line/low resting state when paused
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const barWidth = canvas.width / bars - 2;
        for (let i = 0; i < bars; i++) {
          const x = i * (barWidth + 2);
          ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
          ctx.beginPath();
          ctx.roundRect(x, canvas.height - 2, barWidth, 2, 1);
          ctx.fill();
        }
        return;
      }

      if (analyser) {
        analyser.getByteFrequencyData(dataArray);
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const barWidth = Math.max(2, canvas.width / bars - 2);

      // Sample logarithmic frequencies for visually pleasing musical distribution
      const step = Math.max(1, Math.floor(dataArray.length / (bars * 2)));

      for (let i = 0; i < bars; i++) {
        const val = dataArray[i * step] || 0;
        const normalized = val / 255;
        const barHeight = Math.max(2, normalized * (canvas.height - 2));
        const x = i * (barWidth + 2);
        const y = canvas.height - barHeight;

        // Gradient bar
        const grad = ctx.createLinearGradient(0, canvas.height, 0, 0);
        grad.addColorStop(0, 'rgba(255, 255, 255, 0.35)');
        grad.addColorStop(0.7, 'rgba(255, 255, 255, 0.85)');
        grad.addColorStop(1, '#ffffff');

        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.roundRect(x, y, barWidth, barHeight, 2);
        ctx.fill();
      }

      animId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animId);
    };
  }, [isPlaying, bars, height]);

  return (
    <canvas
      ref={canvasRef}
      width={bars * 6}
      height={height}
      className={className}
      aria-hidden="true"
    />
  );
}

