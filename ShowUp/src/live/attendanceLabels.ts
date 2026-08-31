import type { LiveParticipant } from '@/src/api';

export type AttendanceVerificationKind = 'auto' | 'host' | 'participant' | null;

export function parseVerificationMethod(
  method?: string | null
): AttendanceVerificationKind {
  const m = (method ?? '').replace(/[\s_-]/g, '').toLowerCase();
  if (!m) return null;
  if (m.includes('automatic') || m.includes('location') || m === 'auto') return 'auto';
  if (m.includes('host')) return 'host';
  if (m.includes('participant') || m.includes('peer')) return 'participant';
  return null;
}

/** Display badge for a participant's attendance + verification method from backend. */
export function attendanceVerificationBadge(params: {
  attendanceStatus: string;
  verificationMethod?: string | null;
  /** Optional confirmer display name for "Confirmed by X" when known. */
  confirmedByName?: string | null;
}): string {
  const status = (params.attendanceStatus ?? '').toLowerCase();
  const kind = parseVerificationMethod(params.verificationMethod);

  if (status === 'present' || status === 'attended') {
    if (kind === 'auto') return '✓ Auto Verified';
    if (kind === 'host') {
      return params.confirmedByName
        ? `✓ Confirmed by ${params.confirmedByName}`
        : '✓ Host Confirmed';
    }
    if (kind === 'participant') {
      return params.confirmedByName
        ? `✓ Confirmed by ${params.confirmedByName}`
        : '✓ Participant Confirmed';
    }
    return '✓ Confirmed';
  }

  if (status === 'absent' || status === 'noshow') return '✕ Absent';
  if (status === 'excused') return '✕ Absent';
  return '○ Pending';
}

export function mapLiveAttendanceToStatus(
  attendanceStatus?: string | null
): 'Attended' | 'Registered' | 'NoShow' | 'Unknown' {
  const attendance = (attendanceStatus ?? '').toLowerCase();
  if (attendance === 'present' || attendance === 'attended') return 'Attended';
  if (attendance === 'pending' || attendance === 'registered') return 'Registered';
  if (attendance === 'absent' || attendance === 'noshow' || attendance === 'excused') {
    return 'NoShow';
  }
  return 'Unknown';
}

export function formatAttendanceSummary(present: number, pending: number, total: number): string {
  if (total <= 0) return 'Attendance pending';
  if (pending > 0) return `${present} SHOWED UP • ${pending} PENDING`;
  return `${present} / ${total} HERE`;
}

export function countAttendance(participants: LiveParticipant[]): {
  present: number;
  pending: number;
  absent: number;
  total: number;
} {
  let present = 0;
  let pending = 0;
  let absent = 0;
  for (const p of participants) {
    const s = (p.attendanceStatus ?? '').toLowerCase();
    if (s === 'present' || s === 'attended') present += 1;
    else if (s === 'absent' || s === 'noshow' || s === 'excused') absent += 1;
    else pending += 1;
  }
  return { present, pending, absent, total: participants.length };
}
