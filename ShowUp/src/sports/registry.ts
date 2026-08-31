import { pickleballConfig } from './pickleball';
import { soccerConfig } from './soccer';
import { tennisConfig } from './tennis';
import { volleyballConfig } from './volleyball';
import type { SportConfig } from './types';

/**
 * Central registry of all sport configurations.
 * Keys are the sport IDs used in API payloads (e.g. 'tennis').
 *
 * To add a new sport:
 *   1. Create src/sports/<sport>.tsx and export a SportConfig.
 *   2. Import it here and add it to SPORTS.
 *   3. Add its id to ENABLED_SPORTS below.
 *   No screen or component code needs to change.
 */
export const SPORTS: Record<string, SportConfig> = {
  tennis: tennisConfig,
  soccer: soccerConfig,
  pickleball: pickleballConfig,
  volleyball: volleyballConfig,
};

/**
 * The subset of sports shown in the UI.
 * Toggling a sport on/off is a one-line change here.
 */
export const ENABLED_SPORTS = ['tennis', 'soccer', 'pickleball', 'volleyball'] as const;

export type EnabledSport = (typeof ENABLED_SPORTS)[number];
