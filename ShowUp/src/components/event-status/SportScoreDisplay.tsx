import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { EventResultSummary } from '@/src/api';
import { normalizeSportKey } from '@/lib/sport-match';

function parseLines(summary: string): { a: number; b: number }[] {
  const head = summary.split('(')[0] ?? summary;
  return head
    .split(',')
    .map((part) => part.trim())
    .map((part) => {
      const m = part.match(/^(\d+)\s*[-–—]\s*(\d+)$/);
      if (!m) return null;
      return { a: Number(m[1]), b: Number(m[2]) };
    })
    .filter((x): x is { a: number; b: number } => x != null);
}

function lineLabel(sport: string, index: number): string {
  const key = normalizeSportKey(sport);
  if (key === 'pickleball') return `Game ${index + 1}`;
  if (key === 'soccer') return 'Final';
  return `Set ${index + 1}`;
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

function normalizeStatus(status?: string | null): string {
  return (status ?? '').replace(/[\s_-]/g, '').toLowerCase();
}

function scoreRows(result: EventResultSummary, sportKey: string): { a: number; b: number }[] {
  const fromArrays =
    sportKey === 'pickleball'
      ? result.games?.length
        ? result.games
        : result.sets
      : result.sets?.length
        ? result.sets
        : result.games;
  if (fromArrays?.length) {
    return fromArrays.map((row) => ({ a: row.sideA, b: row.sideB }));
  }
  return parseLines(result.summary ?? '');
}

type Props = {
  sport: string;
  result: EventResultSummary | null | undefined;
  sideAName?: string | null;
  sideBName?: string | null;
  showBreakdownDefault?: boolean;
};

export function SportScoreDisplay({
  sport,
  result,
  sideAName,
  sideBName,
  showBreakdownDefault = true,
}: Props) {
  const [open, setOpen] = useState(showBreakdownDefault);

  if (!result) {
    return <Text style={styles.pending}>Result pending</Text>;
  }

  const score = finalScore(result);
  const key = normalizeSportKey(sport || result.sport);
  const lines = scoreRows(result, key);
  const aName = (sideAName || result.sideALabel || 'Side A').trim();
  const bName = (sideBName || result.sideBLabel || 'Side B').trim();
  const status = normalizeStatus(result.status);
  const confirmed = status === 'confirmed';
  const disputed = status === 'disputed';

  return (
    <View style={styles.wrap}>
      {confirmed ? <Text style={styles.finalBadge}>✓ FINAL RESULT</Text> : null}
      {!confirmed && disputed ? <Text style={styles.disputedBadge}>RESULT DISPUTED</Text> : null}
      {!confirmed && !disputed ? <Text style={styles.submittedBadge}>RESULT SUBMITTED</Text> : null}
      <View style={styles.scoreRow}>
        <Text style={styles.side} numberOfLines={1}>
          {aName}
        </Text>
        <Text style={styles.score}>{score ? `${score.a} — ${score.b}` : '—'}</Text>
        <Text style={styles.side} numberOfLines={1}>
          {bName}
        </Text>
      </View>
      {key !== 'soccer' && lines.length > 0 ? (
        <>
          <Pressable onPress={() => setOpen((v) => !v)} style={styles.toggle}>
            <Text style={styles.toggleText}>{open ? 'Hide sets' : 'View sets'}</Text>
          </Pressable>
          {open
            ? lines.map((line, i) => (
                <Text key={`${line.a}-${line.b}-${i}`} style={styles.line}>
                  {lineLabel(key, i)} {line.a} — {line.b}
                </Text>
              ))
            : null}
        </>
      ) : null}
      {!confirmed ? (
        <Text style={styles.statusHint}>
          {disputed ? 'Result disputed' : 'Waiting for confirmation'}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 8, gap: 6, alignItems: 'center' },
  finalBadge: { color: '#a8ff3e', fontSize: 11, fontWeight: '900', letterSpacing: 1 },
  submittedBadge: { color: '#f59e0b', fontSize: 11, fontWeight: '900', letterSpacing: 1 },
  disputedBadge: { color: '#f87171', fontSize: 11, fontWeight: '900', letterSpacing: 1 },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    width: '100%',
  },
  side: { flex: 1, color: '#c5c5d4', fontSize: 13, fontWeight: '700', textAlign: 'center' },
  score: { color: '#a8ff3e', fontSize: 22, fontWeight: '900' },
  toggle: { paddingVertical: 4 },
  toggleText: { color: '#a8ff3e', fontSize: 12, fontWeight: '700' },
  line: { color: '#c5c5d4', fontSize: 12, fontWeight: '600' },
  statusHint: { color: '#8a8aa0', fontSize: 12, fontWeight: '600' },
  pending: { color: '#8a8aa0', fontSize: 13, fontWeight: '600', textAlign: 'center', marginTop: 8 },
});
