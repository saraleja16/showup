import type { ComponentProps } from 'react';
import { FontAwesome6, MaterialCommunityIcons } from '@expo/vector-icons';
import { normalizeSportKey } from '@/lib/sport-match';

/** Visual / booking source for a map pin — derived from real Event/Venue fields. */
export type MarkerSource = 'sport_event' | 'centre_booked' | 'centre_available';

export type MarkerVisualStyle = {
  source: MarkerSource;
  backgroundColor: string;
  borderColor: string;
  glowColor: string;
  iconColor: string;
  statusLabel: string;
  statusShort: string;
  size: number;
  badge?: 'booked' | 'open' | null;
};

export const MARKER_COLORS = {
  navy: '#0b1220',
  lime: '#a8ff3e',
  bookedGreen: '#047857',
  bookedGreenBorder: '#a7f3d0',
  availableBlue: '#1d4ed8',
  availableBlueBorder: '#93c5fd',
  iconOnDark: '#ffffff',
  iconOnLime: '#0b1220',
} as const;

type FaName = ComponentProps<typeof FontAwesome6>['name'];
type MciName = ComponentProps<typeof MaterialCommunityIcons>['name'];

export type SportIconSpec =
  | { family: 'emoji'; value: string }
  | { family: 'fa6'; name: FaName }
  | { family: 'mci'; name: MciName }
  | { family: 'pickleball' };

export function sportIconSpec(sportId?: string | null): SportIconSpec {
  const key = normalizeSportKey(sportId);
  switch (key) {
    case 'tennis':
      return { family: 'mci', name: 'tennis-ball' };
    case 'soccer':
      return { family: 'mci', name: 'soccer' };
    case 'volleyball':
      return { family: 'mci', name: 'volleyball' };
    case 'pickleball':
      return { family: 'pickleball' };
    default:
      return { family: 'mci', name: 'map-marker' };
  }
}

export function resolveMarkerStyle(source: MarkerSource, sportId?: string | null): MarkerVisualStyle {
  if (source === 'centre_booked') {
    return {
      source,
      backgroundColor: MARKER_COLORS.bookedGreen,
      borderColor: MARKER_COLORS.bookedGreenBorder,
      glowColor: MARKER_COLORS.bookedGreen,
      iconColor: MARKER_COLORS.iconOnDark,
      statusLabel: 'Created / booked',
      statusShort: 'Booked',
      size: 36,
      badge: 'booked',
    };
  }

  if (source === 'centre_available') {
    return {
      source,
      backgroundColor: MARKER_COLORS.availableBlue,
      borderColor: MARKER_COLORS.availableBlueBorder,
      glowColor: MARKER_COLORS.availableBlue,
      iconColor: MARKER_COLORS.iconOnDark,
      statusLabel: 'Available event centre',
      statusShort: 'Available',
      size: 34,
      badge: 'open',
    };
  }

  return {
    source: 'sport_event',
    backgroundColor: MARKER_COLORS.navy,
    borderColor: MARKER_COLORS.lime,
    glowColor: MARKER_COLORS.lime,
    iconColor: MARKER_COLORS.lime,
    statusLabel: 'Sport event',
    statusShort: 'Event',
    size: 36,
    badge: null,
  };
}
