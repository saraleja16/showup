import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import {
  confirmEventResult,
  disputeEventResult,
  getApiErrorMessage,
  getEventLive,
  type EventItem,
  type EventResultSummary,
  type LiveParticipant,
} from '@/src/api';
import { normalizeSportKey, sportLabel } from '@/lib/sport-match';

export type OutcomeLabel = 'WIN' | 'LOSS' | 'DRAW' | 'PENDING' | null;

function parseSummaryLines(summary: string): { label: string; a: number; b: number }[] {
  // e.g. "6-4, 3-6, 6-2 (2-1 sets)" or "11-7, 8-11, 11-9 (2-1 games)"
  const head = summary.split('(')[0] ?? summary;
  return head
    .split(',')
    .map((part) => part.trim())
    .map((part, index) => {
      const m = part.match(/^(\d+)\s*[-–—]\s*(\d+)$/);
      if (!m) return null;
      return { label: `Line ${index + 1}`, a: Number(m[1]), b: Number(m[2]) };
    })
    .filter((x): x is { label: string; a: number; b: number } => x != null);
}

function lineLabels(sport: string, count: number): string[] {
  const key = normalizeSportKey(sport);
  if (key === 'pickleball') return Array.from({ length: count }, (_, i) => `Game ${i + 1}`);
  if (key === 'soccer') return ['Final'];
  return Array.from({ length: count }, (_, i) => `Set ${i + 1}`);
}

function finalScore(result: EventResultSummary): { a: number; b: number } | null {
  if (result.unitsWonA != null && result.unitsWonB != null) {
    return { a: result.unitsWonA, b: result.unitsWonB };
  }
  if (result.scoreA != null && result.scoreB != null) {
    return { a: result.scoreA, b: result.scoreB };
  }
  return null;
}

export function deriveOutcome(
  result: EventResultSummary | null | undefined,
  userDisplayName: string | null | undefined
): OutcomeLabel {
  if (!result) return null;
  const status = result.status.toLowerCase();
  if (status !== 'confirmed') return 'PENDING';

  const score = finalScore(result);
  if (!score) return 'PENDING';
  if (score.a === score.b) return 'DRAW';

  const name = (userDisplayName ?? '').trim().toLowerCase();
  const a = (result.sideALabel ?? '').trim().toLowerCase();
  const b = (result.sideBLabel ?? '').trim().toLowerCase();
  if (!name || (!a && !b)) return null;

  if (a && name === a) return score.a > score.b ? 'WIN' : 'LOSS';
  if (b && name === b) return score.b > score.a ? 'WIN' : 'LOSS';
  return null;
}

function Avatar({ uri, name }: { uri: string | null; name: string }) {
  const initial = (name.trim()[0] || '?').toUpperCase();
  return (
    <View style={styles.avatar}>
      {uri ? <Image source={{ uri }} style={styles.avatarImage} /> : <Text style={styles.avatarInitial}>{initial}</Text>}
    </View>
  );
}

type Props = {
  event: EventItem;
  userId: string;
  userDisplayName?: string | null;
  mode?: 'history' | 'hosted';
  onChanged?: () => void;
};

export function ResultSummaryCard({
  event,
  userId,
  userDisplayName,
  mode = 'history',
  onChanged,
}: Props) {
  const router = useRouter();
  const [participants, setParticipants] = useState<LiveParticipant[]>([]);
  const [busy, setBusy] = useState(false);
  const [localResult, setLocalResult] = useState<EventResultSummary | null>(
    event.resultSummary ?? null
  );

  const result = localResult ?? event.resultSummary ?? null;
  const sport = sportLabel(event.sport).toUpperCase();
  const statusRaw = (result?.status ?? '').toString();
  const statusNorm = statusRaw.replace(/[\s_-]/g, '').toLowerCase();
  const confirmed = statusNorm === 'confirmed';
  const pending = statusNorm === 'pendingconfirmation' || statusNorm === 'disputed';
  const disputed = statusNorm === 'disputed';

  useEffect(() => {
    let cancelled = false;
    getEventLive(event.id)
      .then((live) => {
        if (cancelled) return;
        setParticipants(live.participants ?? []);
        if (live.resultSummary) setLocalResult(live.resultSummary);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [event.id]);

  const sideAName =
    result?.sideALabel?.trim() ||
    participants[0]?.displayName ||
    'Side A';
  const sideBName =
    result?.sideBLabel?.trim() ||
    participants[1]?.displayName ||
    (participants.length > 2 ? 'Team B' : participants[1]?.displayName) ||
    'Side B';

  const sideAAvatar =
    participants.find((p) => p.displayName.trim().toLowerCase() === sideAName.toLowerCase())
      ?.avatarUrl ??
    participants[0]?.avatarUrl ??
    null;
  const sideBAvatar =
    participants.find((p) => p.displayName.trim().toLowerCase() === sideBName.toLowerCase())
      ?.avatarUrl ??
    participants[1]?.avatarUrl ??
    null;

  const score = result ? finalScore(result) : null;
  const rawLines = (() => {
    if (!result) return [] as { label: string; a: number; b: number }[];
    const key = normalizeSportKey(event.sport ?? result.sport);
    const fromArrays =
      key === 'pickleball'
        ? result.games?.length
          ? result.games
          : result.sets
        : result.sets?.length
          ? result.sets
          : result.games;
    if (fromArrays?.length) {
      return fromArrays.map((row, i) => ({
        label: lineLabels(event.sport ?? result.sport ?? '', fromArrays.length)[i] ?? `Line ${i + 1}`,
        a: row.sideA,
        b: row.sideB,
      }));
    }
    return parseSummaryLines(result.summary).map((line, i) => ({
      ...line,
      label: lineLabels(event.sport ?? result.sport ?? '', 99)[i] ?? line.label,
    }));
  })();
  const lines = rawLines;
  const outcome = deriveOutcome(result, userDisplayName);
  const canRespond =
    pending &&
    !disputed &&
    result != null &&
    Boolean(result.submittedByUserId) &&
    result.submittedByUserId !== userId &&
    !confirmed;

  const presentCount = event.presentCount ?? participants.filter((p) => p.attendanceStatus === 'Present').length;
  const totalActive = event.participantCount || participants.length;

  const onConfirm = useCallback(async () => {
    setBusy(true);
    try {
      const next = await confirmEventResult(event.id, userId);
      setLocalResult(next);
      onChanged?.();
    } catch (err) {
      Alert.alert('Result', getApiErrorMessage(err, 'Could not confirm result.'));
    } finally {
      setBusy(false);
    }
  }, [event.id, onChanged, userId]);

  const onDispute = useCallback(async () => {
    setBusy(true);
    try {
      const next = await disputeEventResult(event.id, userId);
      setLocalResult(next);
      onChanged?.();
    } catch (err) {
      Alert.alert('Result', getApiErrorMessage(err, 'Could not dispute result.'));
    } finally {
      setBusy(false);
    }
  }, [event.id, onChanged, userId]);

  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
      onPress={() => router.push({ pathname: '/event/[id]', params: { id: event.id } })}
    >
      <View style={styles.topRow}>
        <View style={styles.sportTag}>
          <Text style={styles.sportTagText}>{sport}</Text>
        </View>
        <View style={styles.badgeRow}>
          {mode === 'hosted' ? (
            <View style={styles.hostBadge}>
              <Text style={styles.hostBadgeText}>HOSTED</Text>
            </View>
          ) : null}
          {outcome === 'WIN' || outcome === 'LOSS' || outcome === 'DRAW' ? (
            <View style={[styles.outcomeBadge, outcome === 'WIN' && styles.outcomeWin]}>
              <Text style={styles.outcomeText}>{outcome}</Text>
            </View>
          ) : pending ? (
            <View style={styles.outcomeBadge}>
              <Text style={styles.outcomeText}>PENDING</Text>
            </View>
          ) : (
            <View style={styles.outcomeBadge}>
              <Text style={styles.outcomeText}>COMPLETED</Text>
            </View>
          )}
        </View>
      </View>

      <Text style={styles.title}>{event.title}</Text>

      <View style={styles.sidesRow}>
        <View style={styles.side}>
          <Avatar uri={sideAAvatar} name={sideAName} />
          <Text style={styles.sideName} numberOfLines={1}>
            {sideAName}
          </Text>
        </View>
        <Text style={styles.scoreMain}>
          {score ? `${score.a} — ${score.b}` : '—'}
        </Text>
        <View style={styles.side}>
          <Avatar uri={sideBAvatar} name={sideBName} />
          <Text style={styles.sideName} numberOfLines={1}>
            {sideBName}
          </Text>
        </View>
      </View>

      {lines.length > 0 && normalizeSportKey(event.sport) !== 'soccer' ? (
        <View style={styles.linesBlock}>
          {lines.map((line) => (
            <Text key={line.label} style={styles.lineText}>
              {line.label}  {line.a} — {line.b}
            </Text>
          ))}
        </View>
      ) : result?.summary && normalizeSportKey(event.sport) !== 'soccer' ? (
        <Text style={styles.summaryText}>{result.summary}</Text>
      ) : null}

      <Text style={styles.meta}>
        {confirmed ? '✓ Result Confirmed' : pending ? 'Result Pending' : 'Finished'}
        {mode === 'hosted' && totalActive > 0
          ? `  ·  ${presentCount} / ${totalActive} attendance`
          : ''}
      </Text>
      <View style={styles.venueRow}>
        <Ionicons name="location-outline" size={12} color="#9ca3af" />
        <Text style={styles.venue} numberOfLines={1}>{event.venueName ?? 'Venue TBC'}</Text>
      </View>
      <Text style={styles.when}>{formatWhen(event.scheduledAt)}</Text>

      {canRespond ? (
        <View style={styles.actions}>
          {busy ? <ActivityIndicator color="#a8ff3e" /> : null}
          <Pressable
            disabled={busy}
            onPress={(e) => {
              e.stopPropagation?.();
              void onConfirm();
            }}
            style={({ pressed }) => [styles.primaryBtn, pressed && styles.pressed]}
          >
            <Text style={styles.primaryBtnText}>Confirm</Text>
          </Pressable>
          <Pressable
            disabled={busy}
            onPress={(e) => {
              e.stopPropagation?.();
              void onDispute();
            }}
            style={({ pressed }) => [styles.secondaryBtn, pressed && styles.pressed]}
          >
            <Text style={styles.secondaryBtnText}>Dispute</Text>
          </Pressable>
        </View>
      ) : null}
    </Pressable>
  );
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('en-AU', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#111827',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(168, 255, 62, 0.28)',
    padding: 16,
    marginBottom: 12,
  },
  pressed: { opacity: 0.88 },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  sportTag: {
    backgroundColor: 'rgba(168, 255, 62, 0.15)',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: '#a8ff3e',
  },
  sportTagText: {
    color: '#a8ff3e',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
  },
  badgeRow: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  hostBadge: {
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: 'rgba(168, 255, 62, 0.5)',
  },
  hostBadgeText: { color: '#a8ff3e', fontSize: 10, fontWeight: '800', letterSpacing: 0.8 },
  outcomeBadge: {
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: '#1f2937',
  },
  outcomeWin: { backgroundColor: '#14532d' },
  outcomeText: { color: '#ecfdf5', fontSize: 10, fontWeight: '800', letterSpacing: 0.8 },
  title: { color: '#ffffff', fontSize: 16, fontWeight: '700', marginBottom: 12 },
  sidesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  side: { alignItems: 'center', flex: 1, gap: 4 },
  sideName: { color: '#ffffff', fontSize: 12, fontWeight: '700', maxWidth: 110, textAlign: 'center' },
  scoreMain: { color: '#a8ff3e', fontSize: 26, fontWeight: '900', marginHorizontal: 8 },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: 'rgba(168, 255, 62, 0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImage: { width: '100%', height: '100%' },
  avatarInitial: { color: '#a8ff3e', fontWeight: '800' },
  linesBlock: { marginBottom: 8, gap: 2 },
  lineText: { color: '#d1d5db', fontSize: 13 },
  summaryText: { color: '#9ca3af', fontSize: 12, marginBottom: 8 },
  meta: { color: '#a8ff3e', fontSize: 12, fontWeight: '700', marginBottom: 4 },
  venueRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 2 },
  venue: { color: '#9ca3af', fontSize: 12, flexShrink: 1 },
  when: { color: '#6b7280', fontSize: 12 },
  actions: { marginTop: 12, gap: 8 },
  primaryBtn: {
    backgroundColor: '#a8ff3e',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  primaryBtnText: { color: '#1a1a2e', fontWeight: '800' },
  secondaryBtn: {
    borderWidth: 1,
    borderColor: '#a8ff3e',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  secondaryBtnText: { color: '#a8ff3e', fontWeight: '800' },
});
