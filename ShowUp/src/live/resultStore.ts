import AsyncStorage from '@react-native-async-storage/async-storage';

import { normalizeSportKey } from '@/lib/sport-match';
import type { ResultLifecycle } from '@/src/live/gamePhase';

/**
 * Score-line helpers for supported sports.
 * Persistence goes through backend POST/GET /events/{id}/results — not AsyncStorage.
 */
const STORAGE_PREFIX = '@showup/event-result/';

export type SupportedScoreSport = 'tennis' | 'soccer' | 'pickleball' | 'volleyball';

export type ScoreLine = {
  label: string;
  sideA: number;
  sideB: number;
};

export type EventResultRecord = {
  eventId: string;
  sport: SupportedScoreSport;
  sideAName: string;
  sideBName: string;
  sideAUserIds: string[];
  sideBUserIds: string[];
  lines: ScoreLine[];
  sideAWins: number;
  sideBWins: number;
  submittedByUserId: string;
  submittedAt: string;
  status: Exclude<ResultLifecycle, 'none'>;
  confirmedByUserId?: string | null;
  disputedByUserId?: string | null;
  note?: string | null;
};

export function isSupportedScoreSport(sport?: string | null): sport is SupportedScoreSport {
  const key = normalizeSportKey(sport);
  return key === 'tennis' || key === 'soccer' || key === 'pickleball' || key === 'volleyball';
}

export function computeSetWins(lines: ScoreLine[]): { sideAWins: number; sideBWins: number } {
  let sideAWins = 0;
  let sideBWins = 0;
  for (const line of lines) {
    if (line.sideA > line.sideB) sideAWins += 1;
    else if (line.sideB > line.sideA) sideBWins += 1;
  }
  return { sideAWins, sideBWins };
}

function storageKey(eventId: string): string {
  return `${STORAGE_PREFIX}${eventId}`;
}

export async function loadEventResult(eventId: string): Promise<EventResultRecord | null> {
  try {
    const raw = await AsyncStorage.getItem(storageKey(eventId));
    if (!raw) return null;
    return JSON.parse(raw) as EventResultRecord;
  } catch {
    return null;
  }
}

export async function saveEventResult(record: EventResultRecord): Promise<void> {
  await AsyncStorage.setItem(storageKey(record.eventId), JSON.stringify(record));
}

export async function clearEventResult(eventId: string): Promise<void> {
  await AsyncStorage.removeItem(storageKey(eventId));
}

export function defaultLinesForSport(sport: SupportedScoreSport): ScoreLine[] {
  switch (sport) {
    case 'soccer':
      return [{ label: 'Final', sideA: 0, sideB: 0 }];
    case 'tennis':
      return [
        { label: 'Set 1', sideA: 0, sideB: 0 },
        { label: 'Set 2', sideA: 0, sideB: 0 },
      ];
    case 'pickleball':
      return [
        { label: 'Game 1', sideA: 0, sideB: 0 },
        { label: 'Game 2', sideA: 0, sideB: 0 },
      ];
    case 'volleyball':
      return [
        { label: 'Set 1', sideA: 0, sideB: 0 },
        { label: 'Set 2', sideA: 0, sideB: 0 },
      ];
  }
}

export function nextLineLabel(sport: SupportedScoreSport, index: number): string {
  if (sport === 'pickleball') return `Game ${index + 1}`;
  if (sport === 'soccer') return 'Final';
  return `Set ${index + 1}`;
}
