import type { EventSportDetails } from '@/src/api';
import { CHECK_IN_WINDOW_CLOSE_MS, CHECK_IN_WINDOW_OPEN_MS } from '@/src/constants/checkInWindow';
import { normalizeSportKey } from '@/lib/sport-match';

export type GamePhase =
  | 'upcoming'
  | 'starting_soon'
  | 'live'
  | 'finished'
  | 'result_pending'
  | 'completed';

export type ResultLifecycle = 'none' | 'submitted' | 'confirmed' | 'disputed';

const DEFAULT_DURATION_MINUTES: Record<string, number> = {
  tennis: 90,
  pickleball: 60,
  volleyball: 90,
  soccer: 90,
};

export function getEventDurationMinutes(
  sport: string | null | undefined,
  sportDetails?: EventSportDetails | null
): number {
  const fromDetails = sportDetails?.durationMinutes;
  if (typeof fromDetails === 'number' && Number.isFinite(fromDetails) && fromDetails > 0) {
    return fromDetails;
  }
  const key = normalizeSportKey(sport);
  return DEFAULT_DURATION_MINUTES[key] ?? 90;
}

export function getEventEndMs(
  scheduledAt: string,
  sport: string | null | undefined,
  sportDetails?: EventSportDetails | null
): number {
  const start = new Date(scheduledAt).getTime();
  if (!Number.isFinite(start)) return NaN;
  return start + getEventDurationMinutes(sport, sportDetails) * 60_000;
}

export function deriveGamePhase(params: {
  scheduledAt: string;
  sport?: string | null;
  sportDetails?: EventSportDetails | null;
  nowMs: number;
  resultLifecycle?: ResultLifecycle;
}): GamePhase {
  const { scheduledAt, sport, sportDetails, nowMs, resultLifecycle = 'none' } = params;

  if (resultLifecycle === 'confirmed') return 'completed';
  if (resultLifecycle === 'submitted' || resultLifecycle === 'disputed') return 'result_pending';

  const startMs = new Date(scheduledAt).getTime();
  if (!Number.isFinite(startMs)) return 'upcoming';

  const endMs = getEventEndMs(scheduledAt, sport, sportDetails);
  const startingSoonOpen = startMs - CHECK_IN_WINDOW_OPEN_MS;

  if (nowMs < startingSoonOpen) return 'upcoming';
  if (nowMs < startMs) return 'starting_soon';
  if (nowMs < endMs) return 'live';
  return 'finished';
}

export function formatElapsedSince(startMs: number, nowMs: number): string {
  const elapsed = Math.max(0, nowMs - startMs);
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 1) return 'Started just now';
  if (minutes === 1) return 'Started 1 min ago';
  if (minutes < 60) return `Started ${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  const rem = minutes % 60;
  if (rem === 0) return hours === 1 ? 'Started 1h ago' : `Started ${hours}h ago`;
  return `Started ${hours}h ${rem}m ago`;
}

export function formatCountdown(ms: number): string {
  if (ms <= 0) return '0m';
  const totalMinutes = Math.floor(ms / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours <= 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
}

/** Precise HH:MM:SS countdown / elapsed display (always zero-padded). */
export function formatHms(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const hh = String(hours).padStart(2, '0');
  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

export function parseServerStatus(status?: string | null): GamePhase | null {
  const s = (status ?? '').trim().toLowerCase();
  if (!s) return null;
  if (s === 'live') return 'live';
  if (s === 'startingsoon' || s === 'starting_soon') return 'starting_soon';
  if (s === 'upcoming') return 'upcoming';
  if (s === 'finished') return 'finished';
  if (s === 'resultpending' || s === 'result_pending' || s === 'pendingconfirmation') {
    return 'result_pending';
  }
  if (s === 'completed' || s === 'confirmed') return 'completed';
  if (s === 'disputed') return 'result_pending';
  return null;
}

/**
 * Prefer authoritative server lifecycle when present; otherwise derive from clock + result.
 */
export function resolveEventPhase(params: {
  scheduledAt: string;
  scheduledEnd?: string | null;
  sport?: string | null;
  sportDetails?: EventSportDetails | null;
  nowMs: number;
  serverStatus?: string | null;
  resultLifecycle?: ResultLifecycle;
}): GamePhase {
  const fromResult = params.resultLifecycle ?? 'none';
  if (fromResult === 'confirmed') return 'completed';
  if (fromResult === 'submitted' || fromResult === 'disputed') return 'result_pending';

  const fromServer = parseServerStatus(params.serverStatus);
  if (fromServer === 'result_pending') return 'result_pending';
  // Never show FINAL/completed from server alone — only after a confirmed result
  // (handled above via resultLifecycle). Server "Completed" without a confirmed
  // result must not unlock the FINAL RESULT chrome while scores are still editable.
  if (fromServer === 'finished' || fromServer === 'completed') return 'finished';

  // Time-based transitions so the UI flips automatically between refreshes.
  const startMs = new Date(params.scheduledAt).getTime();
  if (!Number.isFinite(startMs)) return fromServer ?? 'upcoming';

  let endMs = NaN;
  if (params.scheduledEnd) {
    endMs = new Date(params.scheduledEnd).getTime();
  }
  if (!Number.isFinite(endMs)) {
    endMs = getEventEndMs(params.scheduledAt, params.sport, params.sportDetails);
  }

  const startingSoonOpen = startMs - CHECK_IN_WINDOW_OPEN_MS;
  if (params.nowMs < startingSoonOpen) return 'upcoming';
  if (params.nowMs < startMs) return 'starting_soon';
  if (Number.isFinite(endMs) && params.nowMs < endMs) return 'live';
  // Server says live but client clock has passed scheduledEnd — trust the server
  // until it updates the status itself, rather than flipping to 'finished' early.
  if (fromServer === 'live' && Number.isFinite(endMs) && params.nowMs >= endMs) return 'live';
  return 'finished';
}

export function formatRemaining(endMs: number, nowMs: number): string | null {
  const left = endMs - nowMs;
  if (left <= 0) return null;
  return `${formatCountdown(left)} remaining`;
}

export function isWithinCheckInWindow(scheduledAt: string, nowMs: number): boolean {
  const startMs = new Date(scheduledAt).getTime();
  if (!Number.isFinite(startMs)) return false;
  return nowMs >= startMs - CHECK_IN_WINDOW_OPEN_MS && nowMs <= startMs + CHECK_IN_WINDOW_CLOSE_MS;
}

export function phaseStatusLabel(phase: GamePhase, role: 'hosting' | 'joined' | 'host' | 'none'): string {
  switch (phase) {
    case 'live':
      return 'LIVE';
    case 'finished':
      return 'FINISHED';
    case 'result_pending':
      return 'RESULT SUBMITTED';
    case 'completed':
      return '✓ FINAL RESULT';
    case 'starting_soon':
      return 'STARTING SOON';
    default:
      if (role === 'hosting' || role === 'host') return 'HOSTING';
      if (role === 'joined') return 'JOINED';
      return 'UPCOMING';
  }
}
