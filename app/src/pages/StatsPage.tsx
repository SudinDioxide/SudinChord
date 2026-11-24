import { useState, useMemo } from 'react';
import { useListeningStats } from '@/state/listeningStats';
import { playList, playTrack } from '@/components/music/play';
import { sizedArtwork } from '@/lib/artwork';
import {
  Play,
  Flame,
  Clock,
  Music2,
  Users,
  Sun,
  Sunset,
  Moon,
  Sparkles,
  BarChart2,
  Share2,
  Check,
  Disc,
  Trophy,
  Headphones,
  Compass,
} from 'lucide-react';
import type { Track } from '@/data/music/types';

export function StatsPage() {
  const [range, setRange] = useState<'all' | '30d' | '7d'>('all');
  const [copied, setCopied] = useState(false);
  const plays = useListeningStats((s) => s.plays);
  const stats = useMemo(() => useListeningStats.getState().getStats(range), [plays, range]);

  const hours = Math.floor(stats.totalListeningMinutes / 60);
  const minutes = stats.totalListeningMinutes % 60;

  const totalTimeSlots =
    stats.timeOfDay.morning + stats.timeOfDay.afternoon + stats.timeOfDay.evening + stats.timeOfDay.night || 1;

  const morningPct = Math.round((stats.timeOfDay.morning / totalTimeSlots) * 100);
  const afternoonPct = Math.round((stats.timeOfDay.afternoon / totalTimeSlots) * 100);
  const eveningPct = Math.round((stats.timeOfDay.evening / totalTimeSlots) * 100);
  const nightPct = Math.round((stats.timeOfDay.night / totalTimeSlots) * 100);

  // Peak Listening Vibe & Persona Archetype
  const archetype = useMemo(() => {
    if (stats.totalPlays === 0) return { title: 'New Listener', desc: 'Spin your first track to unlock your audio personality.' };
    if (nightPct >= 35) return { title: 'The Midnight Dreamer', desc: 'Your deepest inspiration and sonic journeys strike under the stars.' };
    if (morningPct >= 35) return { title: 'The Dawn Chaser', desc: 'Kickstarting each new day with uplifting rhythm and musical energy.' };
    if (afternoonPct >= 35) return { title: 'The Flow Voyager', desc: 'Powering through work, study, and daily focus with high-energy playback.' };
    return { title: 'The Twilight Devotee', desc: 'Unwinding with rich evening melodies and atmospheric soundscapes.' };
  }, [stats.totalPlays, morningPct, afternoonPct, eveningPct, nightPct]);

  // Hourly Activity Histogram
  const hourly = stats.hourly || new Array(24).fill(0);
  const maxHourlyCount = Math.max(1, ...hourly);

  // Share / Copy Replay Summary to Clipboard
  const handleShare = () => {
    const topTrack = stats.topTracks[0];
    const topArtist = stats.topArtists[0];
    const text = [
      `🎵 My SudinChord Replay (${range === '7d' ? 'Last 7 Days' : range === '30d' ? 'Last 30 Days' : 'All-Time'})`,
      `⏱️ Listening Time: ${hours > 0 ? `${hours}h ` : ''}${minutes}m across ${stats.totalPlays} tracks`,
      `🔥 Active Streak: ${stats.streakDays} days in a row`,
      `✨ Listening Archetype: ${archetype.title}`,
      topTrack ? `🏆 Top Track: "${topTrack.title}" by ${topTrack.artist} (${topTrack.plays} plays)` : '',
      topArtist ? `👑 Top Artist: ${topArtist.name} (${topArtist.plays} plays)` : '',
      `\nPlayed on SudinChord Desktop`,
    ]
      .filter(Boolean)
      .join('\n');

    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2400);
  };

  // Convert top tracks to playable Track items
  const playableTopTracks: Track[] = useMemo(() => {
    return stats.topTracks.map((t, idx) => ({
      videoId: t.videoId,
      title: t.title,
      artists: [{ name: t.artist, id: null }],
      album: t.album ? { name: t.album, id: null } : null,
      thumbnail: t.artworkUrl ?? null,
      durationSec: null,
      explicit: false,
      index: idx + 1,
      plays: `${t.plays} plays`,
    }));
  }, [stats.topTracks]);

  const topTrack = stats.topTracks[0];
  const topArtist = stats.topArtists[0];

  return (
    <div className="flex-1 overflow-y-auto px-6 sm:px-10 py-8 custom-scrollbar">
      {/* Replay Banner Header */}
      <div className="relative overflow-hidden rounded-[28px] border border-white/12 bg-gradient-to-br from-[#1e142b]/90 via-[#131522]/90 to-[#0d0e14]/95 p-6 sm:p-8 shadow-2xl backdrop-blur-2xl mb-8">
        {/* Glow ambient background lights */}
        <div className="pointer-events-none absolute -top-24 -left-20 size-72 rounded-full bg-[#fa233b]/25 blur-[90px]" />
        <div className="pointer-events-none absolute -bottom-24 -right-20 size-80 rounded-full bg-purple-600/25 blur-[100px]" />

        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3.5 py-1 text-xs font-semibold text-white/90 border border-white/10 backdrop-blur-md">
              <Sparkles size={14} className="text-[#fa233b]" />
              <span>SudinChord Personal Replay</span>
            </div>
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white">
              {archetype.title}
            </h1>
            <p className="text-xs sm:text-sm text-white/60 max-w-xl leading-relaxed">
              {archetype.desc}
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {/* Timeframe pill selector */}
            <div className="inline-flex rounded-2xl bg-white/[0.06] p-1 border border-white/10 backdrop-blur-md">
              {(['7d', '30d', 'all'] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRange(r)}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                    range === r
                      ? 'bg-white text-black shadow-lg scale-100'
                      : 'text-white/60 hover:text-white hover:bg-white/[0.05]'
                  }`}
                >
                  {r === '7d' ? '7 Days' : r === '30d' ? '30 Days' : 'All Time'}
                </button>
              ))}
            </div>

            {/* Share / Copy Summary button */}
            {stats.totalPlays > 0 && (
              <button
                type="button"
                onClick={handleShare}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-2xl bg-white/10 hover:bg-white/15 border border-white/10 text-xs font-semibold text-white transition-all cursor-pointer active:scale-95 shadow-sm"
                title="Copy shareable summary to clipboard"
              >
                {copied ? <Check size={14} className="text-emerald-400" /> : <Share2 size={14} />}
                <span>{copied ? 'Copied!' : 'Share'}</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {stats.totalPlays === 0 ? (
        <div className="mt-16 flex flex-col items-center justify-center text-center p-12 rounded-[28px] border border-white/10 bg-white/[0.02]">
          <div className="flex size-20 items-center justify-center rounded-3xl bg-gradient-to-tr from-[#fa233b]/20 to-purple-500/20 text-[#fa233b] border border-white/10 mb-4 shadow-xl">
            <Headphones size={36} />
          </div>
          <h3 className="text-xl font-bold text-white">No Listening Activity Yet</h3>
          <p className="text-xs text-white/50 mt-2 max-w-md leading-relaxed">
            Play music for at least 15 seconds from your local files, search, or albums. SudinChord will automatically compile your personal habits, streaks, top artists, and sound profile here!
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {/* 4-Stat Highlight Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Total Time */}
            <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.06] to-white/[0.02] p-5 shadow-lg">
              <div className="flex items-center justify-between text-white/50 text-[11px] font-semibold uppercase tracking-wider">
                <span>Listening Time</span>
                <Clock size={16} className="text-[#fa233b]" />
              </div>
              <div className="mt-3 flex items-baseline gap-1.5">
                <span className="text-3xl font-extrabold text-white tracking-tight">
                  {hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`}
                </span>
              </div>
              <p className="mt-1 text-[11px] text-white/40">{stats.totalPlays} total plays logged</p>
            </div>

            {/* Daily Streak */}
            <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.06] to-white/[0.02] p-5 shadow-lg">
              <div className="flex items-center justify-between text-white/50 text-[11px] font-semibold uppercase tracking-wider">
                <span>Active Streak</span>
                <Flame size={16} className="text-amber-400" />
              </div>
              <div className="mt-3 flex items-baseline gap-1.5">
                <span className="text-3xl font-extrabold text-white tracking-tight">{stats.streakDays}</span>
                <span className="text-xs font-semibold text-white/60">Days in a row</span>
              </div>
              <p className="mt-1 text-[11px] text-white/40">
                {stats.streakDays > 2 ? 'Great momentum!' : 'Keep listening daily!'}
              </p>
            </div>

            {/* Unique Tracks & Discovery */}
            <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.06] to-white/[0.02] p-5 shadow-lg">
              <div className="flex items-center justify-between text-white/50 text-[11px] font-semibold uppercase tracking-wider">
                <span>Repertoire</span>
                <Compass size={16} className="text-cyan-400" />
              </div>
              <div className="mt-3 flex items-baseline gap-1.5">
                <span className="text-3xl font-extrabold text-white tracking-tight">{stats.uniqueTracksCount}</span>
                <span className="text-xs font-semibold text-white/60">Tracks</span>
              </div>
              <p className="mt-1 text-[11px] text-white/40">Across {stats.uniqueArtistsCount} artists</p>
            </div>

            {/* Peak Rhythm */}
            <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.06] to-white/[0.02] p-5 shadow-lg">
              <div className="flex items-center justify-between text-white/50 text-[11px] font-semibold uppercase tracking-wider">
                <span>Peak Rhythm</span>
                <BarChart2 size={16} className="text-indigo-400" />
              </div>
              <div className="mt-3 flex items-baseline gap-1.5">
                <span className="text-2xl font-extrabold text-white tracking-tight capitalize">
                  {morningPct >= afternoonPct && morningPct >= eveningPct && morningPct >= nightPct
                    ? 'Morning'
                    : afternoonPct >= eveningPct && afternoonPct >= nightPct
                    ? 'Afternoon'
                    : eveningPct >= nightPct
                    ? 'Evening'
                    : 'Night Owl'}
                </span>
              </div>
              <p className="mt-1 text-[11px] text-white/40">Most active listening period</p>
            </div>
          </div>

          {/* Hero Spotlight: #1 Top Track & #1 Top Artist */}
          {(topTrack || topArtist) && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* #1 Track Spotlight */}
              {topTrack && (
                <div className="relative overflow-hidden rounded-2xl border border-amber-500/20 bg-gradient-to-br from-amber-500/10 via-[#181a24]/90 to-black/90 p-5 shadow-xl flex items-center gap-4">
                  <div className="relative size-24 flex-none rounded-xl overflow-hidden shadow-lg border border-white/15 bg-black">
                    {topTrack.artworkUrl ? (
                      <img src={sizedArtwork(topTrack.artworkUrl, 160)} alt="" className="size-full object-cover" />
                    ) : (
                      <div className="size-full grid place-items-center text-white/30"><Music2 size={32} /></div>
                    )}
                    <button
                      type="button"
                      onClick={() =>
                        playTrack({
                          videoId: topTrack.videoId,
                          title: topTrack.title,
                          artists: [{ name: topTrack.artist, id: null }],
                          thumbnail: topTrack.artworkUrl ?? null,
                          album: topTrack.album ? { name: topTrack.album, id: null } : null,
                          durationSec: null,
                          explicit: false,
                          index: null,
                          plays: null,
                        })
                      }
                      className="absolute inset-0 bg-black/40 opacity-0 hover:opacity-100 flex items-center justify-center transition-opacity cursor-pointer"
                      title="Play #1 Track"
                    >
                      <Play size={24} className="fill-white text-white ml-1" />
                    </button>
                    <div className="absolute top-1 left-1 flex size-5 items-center justify-center rounded-md bg-amber-400 text-black font-extrabold text-[10px]">
                      #1
                    </div>
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-amber-300">
                      <Trophy size={12} />
                      <span>Top Track</span>
                    </div>
                    <h3 className="truncate text-base font-bold text-white mt-1">{topTrack.title}</h3>
                    <p className="truncate text-xs text-white/60">{topTrack.artist}</p>
                    <div className="mt-2.5 flex items-center gap-3 text-xs text-white/50">
                      <span className="font-mono text-amber-400 font-semibold">{topTrack.plays} plays</span>
                      <span>·</span>
                      <span className="font-mono">{topTrack.minutes} mins</span>
                    </div>
                  </div>
                </div>
              )}

              {/* #1 Artist Spotlight */}
              {topArtist && (
                <div className="relative overflow-hidden rounded-2xl border border-purple-500/20 bg-gradient-to-br from-purple-500/10 via-[#181a24]/90 to-black/90 p-5 shadow-xl flex items-center gap-4">
                  <div className="size-24 flex-none rounded-2xl bg-gradient-to-tr from-purple-600 to-pink-500 p-0.5 shadow-lg">
                    <div className="size-full rounded-[14px] bg-[#12141c] flex flex-col items-center justify-center text-center p-2">
                      <Users size={28} className="text-purple-300 mb-1" />
                      <span className="text-[10px] font-extrabold uppercase text-purple-300 tracking-wider">Artist #1</span>
                    </div>
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-purple-300">
                      <Sparkles size={12} />
                      <span>Top Artist</span>
                    </div>
                    <h3 className="truncate text-lg font-bold text-white mt-1">{topArtist.name}</h3>
                    <p className="text-xs text-white/50 mt-1">Your most listened-to artist this period</p>
                    <div className="mt-2.5 flex items-center gap-3 text-xs text-white/50">
                      <span className="font-mono text-purple-400 font-semibold">{topArtist.plays} tracks played</span>
                      <span>·</span>
                      <span className="font-mono">{topArtist.minutes} mins</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 24-Hour Rhythm Intensity Histogram */}
          <div className="rounded-2xl border border-white/10 bg-[#12141c]/90 p-5 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <BarChart2 size={18} className="text-indigo-400" />
                <h2 className="text-base font-semibold text-white">24-Hour Rhythm Breakdown</h2>
              </div>
              <span className="text-xs text-white/40">Hourly Listening Concentration</span>
            </div>

            <div className="flex items-end gap-1.5 h-24 pt-4 border-b border-white/10">
              {hourly.map((count, hr) => {
                const heightPct = Math.max(8, Math.round((count / maxHourlyCount) * 100));
                const isNight = hr < 6 || hr >= 22;
                const isMorning = hr >= 6 && hr < 12;
                const isAfternoon = hr >= 12 && hr < 17;
                return (
                  <div
                    key={hr}
                    className="group relative flex-1 flex flex-col items-center justify-end h-full cursor-pointer"
                    title={`${hr}:00 - ${count} plays`}
                  >
                    <div
                      className={`w-full rounded-t-md transition-all duration-300 ${
                        count > 0
                          ? isNight
                            ? 'bg-indigo-500 hover:bg-indigo-400'
                            : isMorning
                            ? 'bg-amber-400 hover:bg-amber-300'
                            : isAfternoon
                            ? 'bg-orange-500 hover:bg-orange-400'
                            : 'bg-purple-500 hover:bg-purple-400'
                          : 'bg-white/5'
                      }`}
                      style={{ height: `${heightPct}%` }}
                    />
                    {/* Tooltip on hover */}
                    <div className="pointer-events-none absolute -top-8 hidden group-hover:flex flex-col items-center bg-black/90 text-white px-2 py-1 rounded text-[10px] font-mono z-20 whitespace-nowrap border border-white/15">
                      <span>{hr}:00</span>
                      <span className="text-white/60">{count} plays</span>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex justify-between text-[10px] text-white/40 font-mono mt-2 px-1">
              <span>12 AM</span>
              <span>6 AM</span>
              <span>12 PM</span>
              <span>6 PM</span>
              <span>11 PM</span>
            </div>
          </div>

          {/* Top 10 Tracks & Top Artists Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Top Tracks Leaderboard (2 Cols) */}
            <div className="lg:col-span-2 rounded-2xl border border-white/10 bg-[#12141c]/90 p-5 shadow-xl">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Music2 size={18} className="text-[#fa233b]" />
                  <h2 className="text-base font-semibold text-white">Top 10 Tracks</h2>
                </div>
                {playableTopTracks.length > 0 && (
                  <button
                    type="button"
                    onClick={() => playList(playableTopTracks, 0, { source: { title: 'SudinChord Top Tracks', type: 'playlist', id: 'top-stats' } })}
                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-semibold text-white transition-all cursor-pointer"
                  >
                    <Play size={12} className="fill-white" />
                    <span>Play All</span>
                  </button>
                )}
              </div>

              <div className="space-y-1.5">
                {stats.topTracks.map((t, idx) => {
                  const maxPlays = stats.topTracks[0]?.plays || 1;
                  const playPct = Math.round((t.plays / maxPlays) * 100);
                  return (
                    <div
                      key={t.videoId}
                      className="group relative overflow-hidden rounded-xl p-2.5 hover:bg-white/[0.06] transition-all flex items-center justify-between"
                    >
                      {/* Playback progress background accent */}
                      <div
                        className="pointer-events-none absolute inset-y-0 left-0 bg-white/[0.02] -z-0 transition-all"
                        style={{ width: `${playPct}%` }}
                      />

                      <div className="relative z-10 flex items-center gap-3.5 min-w-0">
                        <span
                          className={`w-5 text-center text-xs font-extrabold font-mono ${
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
                          <span className="truncate text-xs font-semibold text-white group-hover:text-key transition-colors">
                            {t.title}
                          </span>
                          <span className="truncate text-[11px] text-white/50">{t.artist}</span>
                        </div>
                      </div>

                      <div className="relative z-10 flex items-center gap-3 text-right flex-none pl-3">
                        <span className="text-xs font-mono font-medium text-white/70">{t.plays} plays</span>
                        <span className="text-[11px] font-mono text-white/40 w-12 text-right">{t.minutes}m</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Top Artists (1 Col) */}
            <div className="rounded-2xl border border-white/10 bg-[#12141c]/90 p-5 shadow-xl flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <Users size={18} className="text-purple-400" />
                  <h2 className="text-base font-semibold text-white">Top Artists</h2>
                </div>

                <div className="space-y-2">
                  {stats.topArtists.map((a, i) => (
                    <div
                      key={a.name}
                      className="flex items-center justify-between p-2.5 rounded-xl bg-white/[0.03] hover:bg-white/[0.06] border border-white/5 transition-all"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div
                          className={`size-6 rounded-full border border-white/15 flex items-center justify-center text-[10px] font-bold font-mono ${
                            i === 0
                              ? 'bg-amber-400 text-black'
                              : i === 1
                              ? 'bg-slate-300 text-black'
                              : i === 2
                              ? 'bg-amber-700 text-white'
                              : 'bg-white/10 text-white/70'
                          }`}
                        >
                          {i + 1}
                        </div>
                        <span className="truncate text-xs font-semibold text-white">{a.name}</span>
                      </div>
                      <span className="text-[11px] font-mono text-white/50 pl-2">{a.plays} plays</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Clear Stats Option */}
              <div className="mt-6 pt-3 border-t border-white/10 text-right">
                <button
                  type="button"
                  onClick={() => {
                    if (confirm('Clear your listening history? This will reset all your stats.')) {
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
