import { useEffect } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { AppInput } from '@/src/components/AppInput';
import { PositionPicker } from '@/src/components/PositionPicker';
import { VenuePicker } from '@/src/components/VenuePicker';
import { SkillSelector, type SkillLevel } from '@/src/features/create-event/components/SkillSelector';
import { colors, radii, spacing, typography } from '@/src/constants/theme';

import type { SportConfig, SportDetails, SportSectionProps } from './types';
import { VolleyballCourt } from './silhouettes/VolleyballCourt';

const VOLLEYBALL_FORMATS = [
  { id: '2v2-beach', label: '2v2 Beach', capacity: 4 },
  { id: '4v4', label: '4v4', capacity: 8 },
  { id: '6v6', label: '6v6', capacity: 12 },
] as const;

const SESSION_TYPES = [
  { id: 'match', label: 'Match' },
  { id: 'casual', label: 'Casual' },
  { id: 'training', label: 'Training' },
] as const;

const DURATIONS = [
  { id: 60, label: '1h' },
  { id: 90, label: '1.5h' },
  { id: 120, label: '2h' },
] as const;

const DEFAULT_DETAILS: SportDetails = {
  format: '6v6',
  sessionType: 'match',
  skillLevel: 'Intermediate',
  durationMinutes: 60,
  bringingBall: false,
  notes: '',
};

function buildSuggestion(details: SportDetails): string | null {
  const format = VOLLEYBALL_FORMATS.find((f) => f.id === details.format);
  if (!format || !details.venueName) return null;
  return `${format.label} at ${details.venueName}`;
}

interface SegmentedProps {
  options: readonly { id: string | number; label: string }[];
  selected: string | number;
  onSelect: (id: string | number) => void;
}

function Segmented({ options, selected, onSelect }: SegmentedProps) {
  return (
    <View style={seg.row}>
      {options.map((opt) => {
        const active = opt.id === selected;
        return (
          <Pressable
            key={String(opt.id)}
            accessibilityRole="button"
            onPress={() => onSelect(opt.id)}
            style={({ pressed }) => [seg.option, active && seg.optionActive, pressed && seg.pressed]}
          >
            <Text style={[seg.text, active && seg.textActive]}>{opt.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const seg = StyleSheet.create({
  row: {
    backgroundColor: colors.surfaceElevated,
    borderColor: colors.border,
    borderRadius: radii.lg,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.xs,
    padding: spacing.xs,
  },
  option: {
    alignItems: 'center',
    borderRadius: radii.md,
    flex: 1,
    justifyContent: 'center',
    minHeight: 42,
    paddingHorizontal: spacing.sm,
  },
  optionActive: {
    backgroundColor: colors.accent,
  },
  text: {
    color: colors.textMuted,
    ...typography.small,
  },
  textActive: {
    color: colors.background,
    fontWeight: '900',
  },
  pressed: {
    opacity: 0.78,
  },
});

function VolleyballSection({ value, onChange, onTitleSuggestion }: SportSectionProps) {
  const details = { ...DEFAULT_DETAILS, ...value };

  useEffect(() => {
    onChange({ ...DEFAULT_DETAILS, ...value });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function update(patch: Partial<SportDetails>) {
    const next = { ...details, ...patch };
    onChange(next);
    const suggestion = buildSuggestion(next);
    if (suggestion) onTitleSuggestion?.(suggestion);
  }

  return (
    <View style={styles.container}>
      {/* Format + position picker */}
      <View>
        <Text style={styles.label}>Format</Text>
        <Segmented
          options={VOLLEYBALL_FORMATS}
          selected={details.format ?? DEFAULT_DETAILS.format!}
          onSelect={(formatId) => update({ format: String(formatId) })}
        />
        <PositionPicker
          mode="create"
          sport="volleyball"
          silhouette={VolleyballCourt}
          format={details.format ?? DEFAULT_DETAILS.format!}
          onClaimsChange={(claims) => update({ pendingClaims: claims })}
        />
      </View>

      <View>
        <Text style={styles.label}>Session type</Text>
        <Segmented
          options={SESSION_TYPES}
          selected={details.sessionType ?? DEFAULT_DETAILS.sessionType!}
          onSelect={(sessionTypeId) => update({ sessionType: String(sessionTypeId) })}
        />
      </View>

      <SkillSelector
        selectedSkill={details.skillLevel as SkillLevel}
        onSelectSkill={(skill) => update({ skillLevel: skill })}
      />

      <VenuePicker
        sport="volleyball"
        venueId={details.venueId}
        venueName={details.venueName}
        onSelect={(venueId, venueName) => update({ venueId, venueName })}
      />

      <View>
        <Text style={styles.label}>Duration</Text>
        <Segmented
          options={DURATIONS}
          selected={details.durationMinutes ?? DEFAULT_DETAILS.durationMinutes!}
          onSelect={(duration) => update({ durationMinutes: Number(duration) })}
        />
      </View>

      <View style={styles.toggleRow}>
        <View style={styles.toggleLabel}>
          <Text style={styles.label}>{"I'm bringing a volleyball"}</Text>
          <Text style={styles.toggleHint}>Let others know equipment is covered</Text>
        </View>
        <Switch
          value={details.bringingBall === true}
          onValueChange={(v) => update({ bringingBall: v })}
          trackColor={{ false: colors.surfaceElevated, true: colors.accentSoft }}
          thumbColor={details.bringingBall === true ? colors.accent : colors.textMuted}
        />
      </View>

      <AppInput
        icon="document-text-outline"
        label="Notes (optional)"
        multiline
        maxLength={500}
        onChangeText={(text) => update({ notes: text })}
        placeholder="Court number, parking, gear needed..."
        value={details.notes}
      />
      {(details.notes?.length ?? 0) > 0 && (
        <Text style={styles.charCount}>{details.notes!.length}/500</Text>
      )}
    </View>
  );
}

export const volleyballConfig: SportConfig = {
  id: 'volleyball',
  label: 'Volleyball',
  icon: 'ellipse-outline',
  emoji: '🏐',
  venueRequired: true,
  formats: [...VOLLEYBALL_FORMATS],
  silhouette: VolleyballCourt,

  CreateEventSection: VolleyballSection,

  eventCardMeta(details) {
    if (!details) return '';
    const parts: string[] = [];
    const fmt = VOLLEYBALL_FORMATS.find((f) => f.id === details.format);
    if (fmt) parts.push(fmt.label);
    if (details.sessionType) parts.push(details.sessionType);
    if (details.skillLevel) parts.push(details.skillLevel);
    if (details.bringingBall) parts.push('Ball provided');
    return parts.join(' · ');
  },
};

const styles = StyleSheet.create({
  container: {
    gap: spacing.xl,
  },
  label: {
    color: colors.textSecondary,
    marginBottom: spacing.sm,
    ...typography.label,
  },
  toggleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  toggleLabel: {
    flex: 1,
    marginRight: spacing.md,
  },
  toggleHint: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  charCount: {
    color: colors.textMuted,
    fontSize: 11,
    marginTop: -spacing.md,
    textAlign: 'right',
  },
});
