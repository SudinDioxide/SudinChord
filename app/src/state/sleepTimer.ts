import { create } from 'zustand';
import { usePlayer, getAudio } from './player';

export type SleepTimerMode = 'off' | '15m' | '30m' | '45m' | '60m' | 'end-of-track';

interface SleepTimerState {
  mode: SleepTimerMode;
  expiresAt: number | null;
  remainingSec: number | null;
  setTimer: (mode: SleepTimerMode) => void;
  cancelTimer: () => void;
}

let intervalTimer: ReturnType<typeof setInterval> | null = null;
let unsubscribePlayer: (() => void) | null = null;
let targetVideoId: string | null = null;
let preFadeVolume: number | null = null;

const FADE_OUT_DURATION_SEC = 15;

function stopPlayback() {
  const p = usePlayer.getState();
  if (p.status === 'playing' || p.status === 'buffering') {
    p.togglePlay();
  } else {
    getAudio()?.pause();
  }
}

function stopActiveTimers() {
  if (intervalTimer) {
    clearInterval(intervalTimer);
    intervalTimer = null;
  }
  if (unsubscribePlayer) {
    unsubscribePlayer();
    unsubscribePlayer = null;
  }
  targetVideoId = null;
  if (preFadeVolume !== null) {
    usePlayer.getState().setVolume(preFadeVolume);
    preFadeVolume = null;
  }
}

export const useSleepTimer = create<SleepTimerState>((set, get) => ({
  mode: 'off',
  expiresAt: null,
  remainingSec: null,

  setTimer: (mode: SleepTimerMode) => {
    stopActiveTimers();

    if (mode === 'off') {
      set({ mode: 'off', expiresAt: null, remainingSec: null });
      return;
    }

    if (mode === 'end-of-track') {
      const nowPlaying = usePlayer.getState().nowPlaying;
      targetVideoId = nowPlaying?.videoId || null;

      // Listen for track end or song change
      unsubscribePlayer = usePlayer.subscribe((state) => {
        const currentId = state.nowPlaying?.videoId;
        const isTrackChangedOrEnded =
          state.status === 'paused' ||
          state.status === 'idle' ||
          (Boolean(targetVideoId && currentId && currentId !== targetVideoId));

        if (isTrackChangedOrEnded && targetVideoId) {
          stopPlayback();
          get().cancelTimer();
        }
      });

      set({ mode: 'end-of-track', expiresAt: null, remainingSec: null });
      return;
    }

    const durationMinutes = mode === '15m' ? 15 : mode === '30m' ? 30 : mode === '45m' ? 45 : 60;
    const expiresAt = Date.now() + durationMinutes * 60 * 1000;
    const initialRemainingSec = durationMinutes * 60;

    set({
      mode,
      expiresAt,
      remainingSec: initialRemainingSec,
    });

    intervalTimer = setInterval(() => {
      const remaining = Math.max(0, Math.round((expiresAt - Date.now()) / 1000));
      set({ remainingSec: remaining });

      // Gentle fade-out in final 15 seconds
      if (remaining <= FADE_OUT_DURATION_SEC && remaining > 0) {
        if (preFadeVolume === null) {
          preFadeVolume = usePlayer.getState().volume;
        }
        const factor = remaining / FADE_OUT_DURATION_SEC;
        usePlayer.getState().setVolume(preFadeVolume * factor);
      }

      if (remaining <= 0) {
        stopPlayback();
        get().cancelTimer();
      }
    }, 1000);
  },

  cancelTimer: () => {
    stopActiveTimers();
    set({ mode: 'off', expiresAt: null, remainingSec: null });
  },
}));

export function formatSleepRemaining(sec: number | null): string {
  if (sec === null || sec < 0) return '';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m > 0) {
    return `${m}m ${s > 0 ? `${s}s` : ''}`.trim();
  }
  return `${s}s`;
}
