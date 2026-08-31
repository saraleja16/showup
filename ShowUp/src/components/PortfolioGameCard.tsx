import { useEffect, useMemo, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import type { PortfolioGame } from '@/src/api';
import { SPORTS } from '@/src/sports/registry';
import { formatCountdown } from '@/src/live/gamePhase';

export type PortfolioCardMode = 'played' | 'hosted' | 'upcoming';

function formatScheduledAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const date = d.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' });
  const time = d
    .toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
    .toUpperCase();
  return `${date} · ${time}`;
}

function Avatar({ uri, name }: { uri: string | null; name: string }) {
  const initial = (name.trim()[0] || '?').toUpperCase();
  return (
    <View style={styles.avatar}>
      {uri ? (
        <Image source={{ uri }} style={styles.avatarImage} />
      ) : (
        <Text style={styles.avatarInitial}>{initial}</Text>
      )}
    </View>
  );
}

function statusLabel(status: string, mode: PortfolioCardMode): string {
  const s = status.toLowerCase();
  if (s === 'live') return 'LIVE';
  if (s === 'startingsoon') return 'STARTING SOON';
  if (s === 'resultpending') return 'RESULT PENDING';
  if (s === 'finished') return 'FINISHED';
  if (s === 'completed') return 'COMPLETED';
  if (mode === 'hosted') {
    if (s === 'upcoming') return 'UPCOMING';
    return status.toUpperCase() || 'UPCOMING';
  }
  return 'UPCOMING';
}

function resultStatusLabel(game: PortfolioGame): string {
  const outcome = (game.userOutcome ?? '').toString();
  if (outcome === 'Win' || outcome === 'Loss' || outcome === 'Draw') return outcome.toUpperCase();
  const rs = (game.result?.status ?? '').toLowerCase();
  if (rs === 'confirmed') return 'CONFIRMED';
  if (rs === 'pendingconfirmation' || rs === 'disputed' || outcome === 'Pending') return 'PENDING';
  if (game.eventStatus.toLowerCase() === 'completed') return 'COMPLETED';
  return 'PENDING';
}

function scoreText(game: PortfolioGame): string {
  const r = game.result;
  if (!r) return '—';
  if (r.sideAWins != null && r.sideBWins != null && (r.sets?.length || r.games?.length)) {
    return `${r.sideAWins} — ${r.sideBWins}`;
  }
  if (r.scoreA != null && r.scoreB != null) return `${r.scoreA} — ${r.scoreB}`;
  if (r.summary?.trim()) return r.summary.trim();
  return '—';
}

export function PortfolioGameCard({
  game,
  mode,
}: {
  game: PortfolioGame;
  mode: PortfolioCardMode;
}) {
  const router = useRouter();
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (mode !== 'upcoming') return;
    const id = setInterval(() => setNowMs(Date.now()), 30_000);
    return () => clearInterval(id);
  }, [mode]);

  const sportConfig = SPORTS[game.sport];
  const sportLabel = sportConfig ? sportConfig.label.toUpperCase() : game.sport.toUpperCase();
  const location = game.venueName ?? 'Venue TBC';
  const status = statusLabel(game.eventStatus, mode);
  const isLive = game.eventStatus.toLowerCase() === 'live';

  const countdown = useMemo(() => {
    if (mode !== 'upcoming') return null;
    const start = new Date(game.scheduledStart).getTime();
    if (!Number.isFinite(start)) return null;
    if (isLive) {
      const end = new Date(game.scheduledEnd).getTime();
      if (Number.isFinite(end) && end > nowMs) {
        return `${formatCountdown(end - nowMs)} left`;
      }
      return 'In progress';
    }
    if (start > nowMs) return `Starts in ${formatCountdown(start - nowMs)}`;
    return null;
  }, [game.scheduledEnd, game.scheduledStart, isLive, mode, nowMs]);

  const sideAName =
    game.sideA?.label?.trim() ||
    game.sideA?.participants[0]?.displayName ||
    game.participants[0]?.displayName ||
    'Side A';
  const sideBName =
    game.sideB?.label?.trim() ||
    game.sideB?.participants[0]?.displayName ||
    game.participants[1]?.displayName ||
    'Side B';
  const sideAAvatar =
    game.sideA?.participants[0]?.avatarUrl ?? game.participants[0]?.avatarUrl ?? null;
  const sideBAvatar =
    game.sideB?.participants[0]?.avatarUrl ?? game.participants[1]?.avatarUrl ?? null;

  const resultBadge = resultStatusLabel(game);
  const outcome = (game.userOutcome ?? '').toString();

  return (
    <Pressable
      accessibilityRole="button"
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
      onPress={() => router.push({ pathname: '/event/[id]', params: { id: game.eventId } })}
    >
      <View style={styles.topRow}>
        <View style={styles.topLeft}>
          <View style={styles.sportTag}>
            <Text style={styles.sportTagText}>{sportLabel}</Text>
          </View>
          {game.isHost ? (
            <View style={styles.hostBadge}>
              <Text style={styles.hostBadgeText}>HOST</Text>
            </View>
          ) : null}
        </View>
        {mode === 'upcoming' ? (
          <View style={[styles.statusPill, isLive && styles.statusPillLive]}>
            {isLive ? <View style={styles.liveDot} /> : null}
            <Text style={[styles.statusPillText, isLive && styles.statusPillTextLive]}>
              {isLive ? 'LIVE' : status}
            </Text>
          </View>
        ) : mode === 'hosted' ? (
          <View
            style={[
              styles.statusPill,
              isLive && styles.statusPillLive,
              status === 'COMPLETED' && styles.statusPillCompleted,
            ]}
          >
            {isLive ? <View style={styles.liveDot} /> : null}
            <Text style={[styles.statusPillText, isLive && styles.statusPillTextLive]}>{status}</Text>
          </View>
        ) : (
          <View
            style={[
              styles.outcomeBadge,
              outcome === 'Win' && styles.outcomeWin,
              resultBadge === 'PENDING' && styles.outcomePending,
            ]}
          >
            <Text style={styles.outcomeText}>{resultBadge}</Text>
          </View>
        )}
      </View>

      <Text style={styles.title}>{game.title}</Text>
      <View style={styles.locationRow}>
        <Ionicons name="location-outline" size={13} color="#8a8aa0" />
        <Text style={styles.location} numberOfLines={1}>{location}</Text>
      </View>
      <Text style={styles.when}>{formatScheduledAt(game.scheduledStart)}</Text>

      {mode === 'played' ? (
        <>
          <View style={styles.sidesRow}>
            <View style={styles.side}>
              <Avatar uri={sideAAvatar} name={sideAName} />
              <Text style={styles.sideName} numberOfLines={1}>
                {sideAName}
              </Text>
            </View>
            <Text style={styles.scoreMain}>{scoreText(game)}</Text>
            <View style={styles.side}>
              <Avatar uri={sideBAvatar} name={sideBName} />
              <Text style={styles.sideName} numberOfLines={1}>
                {sideBName}
              </Text>
            </View>
          </View>
          <Text style={styles.meta}>
            {resultBadge === 'CONFIRMED' || outcome === 'Win' || outcome === 'Loss' || outcome === 'Draw'
              ? '✓ Result Confirmed'
              : resultBadge === 'PENDING'
                ? 'Result Pending'
                : 'Completed'}
          </Text>
        </>
      ) : null}

      {mode === 'hosted' ? (
        <>
          <View style={styles.metaRow}>
            <View style={styles.metaBadge}>
              <Ionicons name="people-outline" size={13} color="#c5c5d4" />
              <Text style={styles.metaText}>{game.participantCount} players</Text>
            </View>
            {game.presentCount > 0 || game.pendingCount > 0 ? (
              <Text style={styles.metaMuted}>
                {game.presentCount} present · {game.pendingCount} pending
              </Text>
            ) : null}
          </View>
          {game.result?.summary ? (
            <Text style={styles.summary} numberOfLines={2}>
              {game.result.summary}
            </Text>
          ) : game.result && game.result.scoreA != null && game.result.scoreB != null ? (
            <Text style={styles.summary}>
              Final {game.result.scoreA} — {game.result.scoreB}
            </Text>
          ) : null}
        </>
      ) : null}

      {mode === 'upcoming' ? (
        <View style={styles.metaRow}>
          <View style={styles.metaBadge}>
            <Ionicons name="people-outline" size={13} color="#c5c5d4" />
            <Text style={styles.metaText}>{game.participantCount} players</Text>
          </View>
          {countdown ? <Text style={[styles.countdown, isLive && styles.countdownLive]}>{countdown}</Text> : null}
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#162033',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(168, 255, 62, 0.18)',
    padding: 16,
    marginBottom: 12,
  },
  pressed: { opacity: 0.85 },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    gap: 8,
  },
  topLeft: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
  sportTag: {
    backgroundColor: 'rgba(168, 255, 62, 0.15)',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: 'rgba(168, 255, 62, 0.4)',
  },
  sportTagText: { color: '#a8ff3e', fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  hostBadge: {
    backgroundColor: 'rgba(168, 255, 62, 0.2)',
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  hostBadgeText: { color: '#a8ff3e', fontSize: 10, fontWeight: '800', letterSpacing: 0.6 },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(138, 138, 160, 0.18)',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  statusPillLive: { backgroundColor: 'rgba(239, 68, 68, 0.2)' },
  statusPillCompleted: { backgroundColor: 'rgba(168, 255, 62, 0.15)' },
  statusPillText: { color: '#c5c5d4', fontSize: 11, fontWeight: '800', letterSpacing: 0.4 },
  statusPillTextLive: { color: '#fca5a5' },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#ef4444' },
  outcomeBadge: {
    backgroundColor: 'rgba(138, 138, 160, 0.2)',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  outcomeWin: { backgroundColor: 'rgba(168, 255, 62, 0.22)' },
  outcomePending: { backgroundColor: 'rgba(245, 158, 11, 0.2)' },
  outcomeText: { color: '#ffffff', fontSize: 11, fontWeight: '800', letterSpacing: 0.4 },
  title: { color: '#ffffff', fontSize: 17, fontWeight: '800', marginBottom: 6 },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 4 },
  location: { color: '#8a8aa0', fontSize: 13, flexShrink: 1 },
  when: { color: '#c5c5d4', fontSize: 12, fontWeight: '600', marginBottom: 10 },
  sidesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 8,
  },
  side: { flex: 1, alignItems: 'center', gap: 4 },
  sideName: { color: '#c5c5d4', fontSize: 12, fontWeight: '600', maxWidth: '100%' },
  scoreMain: { color: '#a8ff3e', fontSize: 20, fontWeight: '900' },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#1a1a2e',
    borderWidth: 1,
    borderColor: 'rgba(168, 255, 62, 0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImage: { width: '100%', height: '100%' },
  avatarInitial: { color: '#a8ff3e', fontSize: 14, fontWeight: '800' },
  meta: { color: '#8a8aa0', fontSize: 12, fontWeight: '600' },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    flexWrap: 'wrap',
  },
  metaBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(168, 255, 62, 0.1)',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  metaText: { color: '#c5c5d4', fontSize: 12, fontWeight: '600' },
  metaMuted: { color: '#8a8aa0', fontSize: 12 },
  summary: { color: '#c5c5d4', fontSize: 13, marginTop: 8 },
  countdown: { color: '#a8ff3e', fontSize: 12, fontWeight: '700' },
  countdownLive: { color: '#fca5a5' },
});
