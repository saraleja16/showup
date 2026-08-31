import type React from 'react';

import type { PendingClaim } from '@/src/components/PositionPicker';

/** One match format for a sport, e.g. Singles (capacity 2) or Doubles (capacity 4) */
export interface SportFormat {
  id: string;
  label: string;
  capacity: number;
}

/**
 * Props injected into every sport's CreateEventSection component.
 * The parent screen owns date, time, and title; the section owns everything else.
 */
export interface SportSectionProps {
  value: SportDetails;
  onChange: (details: SportDetails) => void;
  /**
   * Called whenever the section has enough information to suggest a title.
   * The parent accepts it only if the user has not yet typed their own title.
   */
  onTitleSuggestion?: (title: string) => void;
}

/**
 * Bag of sport-specific event details sent in `sportDetails` on the create payload
 * and received back on event DTOs. Each sport only reads/writes its own keys.
 */
export interface SportDetails {
  format?: string;
  sessionType?: string;
  skillLevel?: string;
  venueId?: number;
  venueName?: string;
  durationMinutes?: number;
  bringingBall?: boolean;
  maxPlayers?: number;
  notes?: string;
  /**
   * Soccer-only: organizer's pre-filled slot claims, keyed by slotId.
   * Extracted and converted to `initialClaims[]` at submit; never sent inside sportDetails.
   */
  pendingClaims?: Record<string, PendingClaim>;
}

/**
 * Full configuration for one sport.
 *
 * To add a new sport:
 *   1. Create src/sports/<sport>.tsx exporting a SportConfig object.
 *   2. Register it in src/sports/registry.ts.
 *   No screen code changes required.
 */
export interface SportConfig {
  /** Unique identifier used as the `sport` field in API payloads, e.g. 'tennis' */
  id: string;
  /** Human-readable label, e.g. 'Tennis' */
  label: string;
  /** Ionicons glyph name used for icon rendering in cards and headers */
  icon: string;
  /** Emoji used in text-only contexts such as registration chips and profile pills */
  emoji: string;
  /** When true, a VenuePicker is required; the Create button is disabled without a venue */
  venueRequired: boolean;
  /** All playable formats and their server-derived player capacities */
  formats: SportFormat[];
  /**
   * The sport-specific form section rendered inside the Create Game screen.
   * It receives the current SportDetails value and an onChange handler.
   */
  CreateEventSection: React.ComponentType<SportSectionProps>;
  /**
   * Optional court/field silhouette rendered inside the PositionPicker.
   * Receives the current picker container width so dynamic shapes (e.g. a
   * center circle) can scale correctly. Omit for sports without a picker.
   */
  silhouette?: React.ComponentType<{ width: number }>;
  /**
   * Returns a compact summary line for event cards.
   * @example "Doubles · Match · Intermediate · Balls provided"
   */
  eventCardMeta: (sportDetails: SportDetails | null | undefined) => string;
}
