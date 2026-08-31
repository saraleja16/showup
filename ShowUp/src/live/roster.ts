import {
  getEventLive,
  getEventPositions,
  getParticipantStatus,
  getUserById,
  type EventItem,
  type ParticipantStatus,
} from '@/src/api';
import {
  mapLiveAttendanceToStatus,
  parseVerificationMethod,
  type AttendanceVerificationKind,
} from '@/src/live/attendanceLabels';

export type RosterMember = {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  team: string | null;
  status: ParticipantStatus['status'] | 'Unknown';
  statusUpdatedAt: string | null;
  verification: AttendanceVerificationKind;
  verificationMethod?: string | null;
};

export async function loadEventRoster(
  event: EventItem,
  viewerUserId: string
): Promise<RosterMember[]> {
  // Prefer live endpoint — includes real display names + avatars for all participants.
  try {
    const live = await getEventLive(event.id, viewerUserId);
    if (live.participants?.length) {
      return live.participants.map((p) => {
        const status = mapLiveAttendanceToStatus(p.attendanceStatus);
        const verification =
          status === 'Attended' ? parseVerificationMethod(p.verificationMethod) ?? 'auto' : null;

        return {
          userId: p.userId,
          displayName: p.displayName?.trim() || 'Player',
          avatarUrl: p.avatarUrl ?? null,
          team: null,
          status,
          statusUpdatedAt: null,
          verification,
          verificationMethod: p.verificationMethod ?? null,
        };
      });
    }
  } catch {
    // Fall through to positions + user lookups.
  }

  const positions = await getEventPositions(event.id, viewerUserId).catch(() => []);
  const ids = new Set<string>();
  ids.add(event.creatorId);
  ids.add(viewerUserId);

  const teamByUser = new Map<string, string | null>();
  for (const slot of positions) {
    if (slot.claimedByUserId) {
      ids.add(slot.claimedByUserId);
      teamByUser.set(slot.claimedByUserId, slot.team || null);
    }
  }

  const members = await Promise.all(
    Array.from(ids).map(async (userId) => {
      const [user, status] = await Promise.all([
        getUserById(userId).catch(() => null),
        getParticipantStatus(event.id, userId).catch(() => null),
      ]);

      const displayName =
        user?.displayName?.trim() ||
        [user?.firstName, user?.lastName].filter(Boolean).join(' ').trim() ||
        positions.find((p) => p.claimedByUserId === userId)?.claimedByDisplayName ||
        'Player';

      let verification: RosterMember['verification'] = null;
      if (status?.status === 'Attended') {
        verification = 'auto';
      }

      return {
        userId,
        displayName,
        avatarUrl: user?.avatarUrl ?? null,
        team: teamByUser.get(userId) ?? null,
        status: status?.status ?? 'Unknown',
        statusUpdatedAt: status?.statusUpdatedAt ?? null,
        verification,
        verificationMethod: null,
      } satisfies RosterMember;
    })
  );

  return members.sort((a, b) => a.displayName.localeCompare(b.displayName));
}

export function splitSides(members: RosterMember[]): {
  sideA: RosterMember[];
  sideB: RosterMember[];
  sideAName: string;
  sideBName: string;
} {
  const withTeam = members.filter((m) => m.team);
  if (withTeam.length >= 2) {
    const teams = Array.from(new Set(withTeam.map((m) => m.team).filter(Boolean))) as string[];
    const aTeam = teams[0] ?? 'Team A';
    const bTeam = teams[1] ?? 'Team B';
    const sideA = members.filter((m) => m.team === aTeam);
    const sideB = members.filter((m) => m.team === bTeam);
    return {
      sideA: sideA.length ? sideA : members.slice(0, 1),
      sideB: sideB.length ? sideB : members.slice(1, 2),
      sideAName: aTeam,
      sideBName: bTeam,
    };
  }

  const eligible = members.filter(
    (m) => m.status !== 'CancelledEarly' && m.status !== 'CancelledLate'
  );
  const sideA = eligible.slice(0, 1);
  const sideB = eligible.slice(1, 2);
  return {
    sideA,
    sideB,
    sideAName: sideA[0]?.displayName ?? 'Side A',
    sideBName: sideB[0]?.displayName ?? 'Side B',
  };
}
