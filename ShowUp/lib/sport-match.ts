import { SPORTS } from '@/src/sports/registry';
import type { EventItem } from '@/src/api';

/** Alias map → canonical sport id used by ENABLED_SPORTS */
const SPORT_ALIASES: Record<string, string> = {
  tennis: 'tennis',
  soccer: 'soccer',
  football: 'soccer',
  futbol: 'soccer',
  'foot ball': 'soccer',
  pickleball: 'pickleball',
  'pickle ball': 'pickleball',
  pickle: 'pickleball',
  volleyball: 'volleyball',
  'volley ball': 'volleyball',
};

export function normalizeSportKey(raw?: string | null): string {
  if (!raw) return '';
  const key = String(raw).trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');
  return SPORT_ALIASES[key] ?? key.replace(/\s+/g, '');
}

export function matchesSport(raw: string | null | undefined, filter: string): boolean {
  const a = normalizeSportKey(raw);
  const b = normalizeSportKey(filter);
  if (!a || !b) return false;
  return a === b;
}

export function sportLabel(sportId?: string | null): string {
  const key = normalizeSportKey(sportId);
  if (!key) return 'Sport';
  return SPORTS[key]?.label ?? (sportId?.trim() || 'Sport');
}

/** Text-only fallbacks for sports other than pickleball. Pickleball never uses emoji. */
export function sportIconEmoji(sportId?: string | null): string {
  const key = normalizeSportKey(sportId);
  switch (key) {
    case 'tennis':
      return '🎾';
    case 'soccer':
      return '⚽';
    case 'volleyball':
      return '🏐';
    case 'pickleball':
      return ''; // render PickleballIcon / SVG instead
    default:
      return '📍';
  }
}

/**
 * Filter events by sport. Events with a matching sport field are kept.
 * Does not require venue / source / booking fields.
 */
export function filterEventsBySport(events: EventItem[], sportFilter: string): EventItem[] {
  if (!sportFilter) return events;
  return events.filter((e) => matchesSport(e.sport, sportFilter));
}
