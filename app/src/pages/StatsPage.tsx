import { useState } from 'react';
import { useListeningStats } from '@/state/listeningStats';
import { playTrack } from '@/components/music/play';
import { sizedArtwork } from '@/lib/artwork';
import { Play, Flame, Clock, Music2, Users, Sun, Sunset, Moon, Sparkles, BarChart2 } from 'lucide-react';

export function StatsPage() {
  const [range, setRange] = useState<'all' | '30d' | '7d'>('all');
  const stats = useListeningStats((s) => s.getStats(range));

  const hours = Math.floor(stats.totalListeningMinutes / 60);
  const minutes = stats.totalListeningMinutes % 60;

  const totalTimeSlots =
    stats.timeOfDay.morning + stats.timeOfDay.afternoon + stats.timeOfDay.evening + stats.timeOfDay.night || 1;

  const morningPct = Math.round((stats.timeOfDay.morning / totalTimeSlots) * 100);
  const afternoonPct = Math.round((stats.timeOfDay.afternoon / totalTimeSlots) * 100);
  const eveningPct = Math.round((stats.timeOfDay.evening / totalTimeSlots) * 100);
  const nightPct = Math.round((stats.timeOfDay.night / totalTimeSlots) * 100);

  return (
    <div className="flex-1 overflow-y-auto px-8 py-8 custom-scrollbar">
      {/* Header & Range Selector */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-6">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="flex size-9 items-center justify-center rounded-2xl bg-gradient-to-tr from-[#fa233b] to-purple-600 text-white shadow-lg">
              <Sparkles size={18} />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-white">Listening Stats</h1>
          </div>
          <p className="mt-1 text-xs text-white/50">Your personal listening habits, top tracks, and artists</p>
        </div>

        <div className="inline-flex rounded-xl bg-white/[0.06] p-1 border border-white/10">
          {(['7d', '30d', 'all'] as const).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRange(r)}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                range === r
                  ? 'bg-white text-black shadow-md'
                  : 'text-white/60 hover:text-white hover:bg-white/[0.04]'
              }`}
            >
              {r === '7d' ? 'Last 7 Days' : r === '30d' ? 'Last 30 Days' : 'All Time'}
            </button>
          ))}
        </div>
      </div>

      {stats.totalPlays === 0 ? (
        <div className="mt-20 flex flex-col items-center justify-center text-center">
          <div className="flex size-16 items-center justify-center rounded-3xl bg-white/5 text-white/40 border border-white/10 mb-4">
            <Music2 size={32} />
          </div>
          <h3 className="text-lg font-semibold text-white">No Listening Activity Yet</h3>
          <p className="text-xs text-white/50 mt-1 max-w-sm">
            Play your favorite tracks for at least 15 seconds to begin generating your personal stats and Wrapped summary!
          </p>
        </div>
      ) : (
        <div className="mt-6 space-y-6">
          {/* Key Metric Highlights Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Total Time */}
            <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.06] to-white/[0.02] p-5 shadow-xl">
              <div className="flex items-center justify-between text-white/50 text-xs font-semibold uppercase tracking-wider">
                <span>Listening Time</span>
                <Clock size={16} className="text-[#fa233b]" />
              </div>
              <div className="mt-3 flex items-baseline gap-1.5">
                <span className="text-3xl font-extrabold text-white tracking-tight">
                  {hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`}
                </span>
              </div>
              <p className="mt-1 text-[11px] text-white/40">{stats.totalPlays} total tracks played</p>
            </div>

            {/* Daily Streak */}
            <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.06] to-white/[0.02] p-5 shadow-xl">
              <div className="flex items-center justify-between text-white/50 text-xs font-semibold uppercase tracking-wider">
                <span>Active Streak</span>
                <Flame size={16} className="text-amber-400" />
              </div>
              <div className="mt-3 flex items-baseline gap-1.5">
                <span className="text-3xl font-extrabold text-white tracking-tight">{stats.streakDays}</span>
                <span className="text-sm font-semibold text-white/60">Days in a row</span>
              </div>
              <p className="mt-1 text-[11px] text-white/40">Keep playing daily to grow your streak</p>
            </div>

            {/* Top Habit / Prime Time */}
            <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.06] to-white/[0.02] p-5 shadow-xl">
              <div className="flex items-center justify-between text-white/50 text-xs font-semibold uppercase tracking-wider">
                <span>Peak Rhythm</span>
                <BarChart2 size={16} className="text-indigo-400" />
              </div>
              <div className="mt-3 flex items-baseline gap-1.5">
                <span className="text-3xl font-extrabold text-white tracking-tight capitalize">
                  {morningPct >= afternoonPct && morningPct >= eveningPct && morningPct >= nightPct
                    ? 'Morning'
                    : afternoonPct >= eveningPct && afternoonPct >= nightPct
                    ? 'Afternoon'
                    : eveningPct >= nightPct
                    ? 'Evening'
                    : 'Night Owl'}
                </span>
              </div>
              <p className="mt-1 text-[11px] text-white/40">Your most active listening hours</p>
            </div>
          </div>

          {/* Top Tracks Leaderboard */}
          <div className="rounded-2xl border border-white/10 bg-[#14161f]/80 p-5 shadow-xl">
            <div className="flex items-center gap-2 mb-4">
              <Music2 size={18} className="text-[#fa233b]" />
              <h2 className="text-base font-semibold text-white">Top Tracks</h2>
            </div>

            <div className="space-y-2">
              {stats.topTracks.map((t, idx) => (
                <div
                  key={t.videoId}
                  className="group flex items-center justify-between rounded-xl p-2.5 hover:bg-white/[0.06] transition-colors"
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <span
                      className={`w-5 text-center text-xs font-bold font-mono ${
                        idx === 0
                          ? 'text-amber-300'
                          : idx === 1
                          ? 'text-slate-300'
                          : idx === 2
                          ? 'text-amber-600'
                          : 'text-white/40'
                      }`}
                    >
                      {idx + 1}
                    </span>

                    {/* Artwork thumbnail with play button overlay */}
                    <div
                      onClick={() =>
                        playTrack({
                          videoId: t.videoId,
                          title: t.title,
                          artists: [{ name: t.artist, id: null }],
                          thumbnail: t.artworkUrl ?? null,
                          album: t.album ? { name: t.album, id: null } : null,
                          durationSec: null,
                          explicit: false,
                          index: null,
                          plays: null,
                        })
                      }
                      className="relative size-10 flex-none rounded-lg overflow-hidden bg-black/40 border border-white/10 cursor-pointer shadow-sm group-hover:scale-105 transition-transform"
                    >
                      {t.artworkUrl ? (
                        <img src={sizedArtwork(t.artworkUrl, 100)} alt="" className="size-full object-cover" />
                      ) : (
                        <div className="size-full flex items-center justify-center text-white/30">
                          <Music2 size={16} />
                        </div>
                      )}
                      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                        <Play size={14} className="text-white fill-white ml-0.5" />
                      </div>
                    </div>

                    <div className="min-w-0 flex flex-col">
                      <span className="truncate text-xs font-semibold text-white">{t.title}</span>
                      <span className="truncate text-[11px] text-white/50">{t.artist}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 text-right flex-none pl-3">
                    <span className="text-xs font-mono font-medium text-white/70">{t.plays} plays</span>
                    <span className="text-[11px] font-mono text-white/40 w-14 text-right">{t.minutes}m</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Top Artists & Time of Day Split */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Top Artists */}
            <div className="rounded-2xl border border-white/10 bg-[#14161f]/80 p-5 shadow-xl">
              <div className="flex items-center gap-2 mb-4">
                <Users size={18} className="text-purple-400" />
                <h2 className="text-base font-semibold text-white">Top Artists</h2>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {stats.topArtists.map((a, i) => (
                  <div
                    key={a.name}
                    className="flex items-center justify-between p-3 rounded-xl bg-white/[0.04] border border-white/5"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="size-7 rounded-full bg-gradient-to-tr from-purple-500/30 to-pink-500/30 border border-white/10 flex items-center justify-center text-xs font-bold text-white font-mono">
                        {i + 1}
                      </div>
                      <span className="truncate text-xs font-semibold text-white">{a.name}</span>
                    </div>
                    <span className="text-[11px] font-mono text-white/50 pl-2">{a.plays} plays</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Time of Day Distribution */}
            <div className="rounded-2xl border border-white/10 bg-[#14161f]/80 p-5 shadow-xl flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <Sun size={18} className="text-amber-400" />
                  <h2 className="text-base font-semibold text-white">Daily Listening Distribution</h2>
                </div>

                <div className="space-y-3.5">
                  <div>
                    <div className="flex justify-between text-xs font-medium text-white/70 mb-1">
                      <div className="flex items-center gap-1.5">
                        <Sun size={13} className="text-amber-300" />
                        <span>Morning (6am - 12pm)</span>
                      </div>
                      <span className="font-mono text-white">{morningPct}%</span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-white/10 overflow-hidden">
                      <div className="h-full bg-amber-400 rounded-full transition-all duration-500" style={{ width: `${morningPct}%` }} />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-xs font-medium text-white/70 mb-1">
                      <div className="flex items-center gap-1.5">
                        <Sun size={13} className="text-orange-400" />
                        <span>Afternoon (12pm - 5pm)</span>
                      </div>
                      <span className="font-mono text-white">{afternoonPct}%</span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-white/10 overflow-hidden">
                      <div className="h-full bg-orange-500 rounded-full transition-all duration-500" style={{ width: `${afternoonPct}%` }} />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-xs font-medium text-white/70 mb-1">
                      <div className="flex items-center gap-1.5">
                        <Sunset size={13} className="text-purple-400" />
                        <span>Evening (5pm - 10pm)</span>
                      </div>
                      <span className="font-mono text-white">{eveningPct}%</span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-white/10 overflow-hidden">
                      <div className="h-full bg-purple-500 rounded-full transition-all duration-500" style={{ width: `${eveningPct}%` }} />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-xs font-medium text-white/70 mb-1">
                      <div className="flex items-center gap-1.5">
                        <Moon size={13} className="text-indigo-400" />
                        <span>Night (10pm - 6am)</span>
                      </div>
                      <span className="font-mono text-white">{nightPct}%</span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-white/10 overflow-hidden">
                      <div className="h-full bg-indigo-500 rounded-full transition-all duration-500" style={{ width: `${nightPct}%` }} />
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-white/10 text-right">
                <button
                  type="button"
                  onClick={() => {
                    if (confirm('Clear your listening history? This cannot be undone.')) {
                      useListeningStats.getState().clearHistory();
                    }
                  }}
                  className="text-[11px] text-white/30 hover:text-red-400 transition-colors cursor-pointer"
                >
                  Clear Stats History
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
