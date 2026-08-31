import AsyncStorage from '@react-native-async-storage/async-storage';

import type { MatchCandidate } from '@/src/api';

const SENT_KEY = (userId: string) => `@showup/match-sent/${userId}`;
const REJECTED_KEY = (userId: string) => `@showup/match-rejected/${userId}`;

export type MatchRequestStatus = 'pending' | 'accepted' | 'rejected';

export type MatchRequestItem = {
  userId: string;
  displayName: string;
  profileImageUrl: string | null;
  reliabilityScore: number;
  skillLevel: string;
  sharedSports: string[];
  primarySharedSport?: string;
  approximateDistanceKm?: number;
  status: MatchRequestStatus;
  /** ISO timestamp when we recorded the local action / last update */
  updatedAt: string;
  /** Backend MatchDecision id, present for items sourced from the real requests API. */
  requestId?: string;
};

function fromCandidate(
  candidate: MatchCandidate,
  status: MatchRequestStatus,
  updatedAt = new Date().toISOString()
): MatchRequestItem {
  return {
    userId: candidate.userId,
    displayName: candidate.displayName,
    profileImageUrl: candidate.profileImageUrl,
    reliabilityScore: candidate.reliabilityScore,
    skillLevel: candidate.skillLevel,
    sharedSports: candidate.sharedSports ?? [],
    primarySharedSport: candidate.primarySharedSport,
    approximateDistanceKm: candidate.approximateDistanceKm,
    status,
    updatedAt,
  };
}

async function readList(key: string): Promise<MatchRequestItem[]> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as MatchRequestItem[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeList(key: string, items: MatchRequestItem[]): Promise<void> {
  await AsyncStorage.setItem(key, JSON.stringify(items));
}

/** Persist a real outgoing connect (pending) from swipe/discovery. */
export async function recordSentMatchRequest(
  ownerUserId: string,
  candidate: MatchCandidate
): Promise<void> {
  if (!ownerUserId || !candidate?.userId) return;
  const key = SENT_KEY(ownerUserId);
  const prev = await readList(key);
  const nextItem = fromCandidate(candidate, 'pending');
  const without = prev.filter((x) => x.userId !== candidate.userId);
  await writeList(key, [nextItem, ...without]);
}

export async function markSentAccepted(ownerUserId: string, otherUserId: string): Promise<void> {
  const key = SENT_KEY(ownerUserId);
  const prev = await readList(key);
  const next = prev.map((item) =>
    item.userId === otherUserId
      ? { ...item, status: 'accepted' as const, updatedAt: new Date().toISOString() }
      : item
  );
  await writeList(key, next);
}

export async function removeSentRequest(ownerUserId: string, otherUserId: string): Promise<void> {
  const key = SENT_KEY(ownerUserId);
  const prev = await readList(key);
  await writeList(
    key,
    prev.filter((x) => x.userId !== otherUserId)
  );
}

export async function recordRejectedRequest(
  ownerUserId: string,
  item: MatchRequestItem
): Promise<void> {
  if (!ownerUserId || !item?.userId) return;
  const key = REJECTED_KEY(ownerUserId);
  const prev = await readList(key);
  const nextItem: MatchRequestItem = {
    ...item,
    status: 'rejected',
    updatedAt: new Date().toISOString(),
  };
  const without = prev.filter((x) => x.userId !== item.userId);
  await writeList(key, [nextItem, ...without]);
}

export async function loadStoredSent(ownerUserId: string): Promise<MatchRequestItem[]> {
  return readList(SENT_KEY(ownerUserId));
}

export async function loadStoredRejected(ownerUserId: string): Promise<MatchRequestItem[]> {
  return readList(REJECTED_KEY(ownerUserId));
}

export function candidateToRequestItem(
  candidate: MatchCandidate,
  status: MatchRequestStatus
): MatchRequestItem {
  return fromCandidate(candidate, status);
}
