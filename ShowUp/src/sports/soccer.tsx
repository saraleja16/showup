import { Ionicons } from '@expo/vector-icons';
import { useEffect } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { AppInput } from '@/src/components/AppInput';
import { VenuePicker } from '@/src/components/VenuePicker';
import { SkillSelector, type SkillLevel } from '@/src/features/create-event/components/SkillSelector';
import { colors, radii, spacing, typography } from '@/src/constants/theme';
import { PositionPicker } from '@/src/components/PositionPicker';
import { SoccerField } from './silhouettes/SoccerField';

import type { SportConfig, SportDetails, SportSectionProps } from './types';

// ─── Constants ────────────────────────────────────────────────────────────────

const SOCCER_FORMATS = [
  { id: '5-a-side', label: '5-a-side', capacity: 10 },
  { id: '7-a-side', label: '7-a-side', capacity: 14 },
  { id: '11-a-side', label: '11-a-side', capacity: 22 },
  { id: 'custom', label: 'Custom', capacity: 0 },
] as const;

const CUSTOM_MAX_PLAYERS_DEFAULT = 10;
const CUSTOM_MAX_PLAYERS_MIN = 4;
const CUSTOM_MAX_PLAYERS_MAX = 30;

const DEFAULT_DETAILS: SportDetails = {
  format: '5-a-side',
  skillLevel: 'Intermediate',
  bringingBall: false,
  notes: '',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildSuggestion(details: SportDetails): string | null {
  const format = SOCCER_FORMATS.find((f) => f.id === details.format);
  if (!format || !details.venueName) return null;
  return `${format.label} at ${details.venueName}`;
}

// ─── Inline segmented control ─────────────────────────────────────────────────

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
    paddingHorizontal: spacing.xs,
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

// ─── Max Players Stepper (custom format only) ─────────────────────────────────
// MinPlayersSelector is not reused because its min is hardcoded to 2; soccer requires min 4.

function MaxPlayersStepper({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <View>
      <Text style={styles.label}>Max players</Text>
      <View style={stepper.shell}>
        <Pressable
          accessibilityRole="button"
          onPress={() => onChange(Math.max(CUSTOM_MAX_PLAYERS_MIN, value - 1))}
          style={({ pressed }) => [stepper.btn, pressed && stepper.pressed]}
        >
          <Ionicons name="remove" size={20} color={colors.textPrimary} />
        </Pressable>
        <View style={stepper.valueWrap}>
          <Text style={stepper.value}>{value}</Text>
          <Text style={stepper.caption}>players</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={() => onChange(Math.min(CUSTOM_MAX_PLAYERS_MAX, value + 1))}
          style={({ pressed }) => [stepper.btn, stepper.btnActive, pressed && stepper.pressed]}
        >
          <Ionicons name="add" size={20} color={colors.background} />
        </Pressable>
      </View>
    </View>
  );
}

const stepper = StyleSheet.create({
  shell: {
    alignItems: 'center',
    backgroundColor: colors.surfaceElevated,
    borderColor: colors.border,
    borderRadius: radii.lg,
    borderWidth: 1,
    flexDirection: 'row',
    minHeight: 64,
    padding: spacing.sm,
  },
  btn: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    height: 46,
    justifyContent: 'center',
    width: 46,
  },
  btnActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  value: {
    color: colors.textPrimary,
    fontSize: 24,
    fontWeight: '900',
    lineHeight: 28,
  },
  valueWrap: {
    alignItems: 'center',
    flex: 1,
  },
  caption: {
    color: colors.textMuted,
    ...typography.small,
  },
  pressed: {
    opacity: 0.78,
  },
});

// ─── Soccer CreateEventSection ────────────────────────────────────────────────

function SoccerSection({ value, onChange, onTitleSuggestion }: SportSectionProps) {
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

  const selectedFormat = SOCCER_FORMATS.find((f) => f.id === details.format) ?? SOCCER_FORMATS[0];
  const isCustom = selectedFormat.id === 'custom';

  function handleFormatSelect(id: string | number) {
    const fmt = SOCCER_FORMATS.find((f) => f.id === id);
    if (!fmt) return;
    // When switching to custom, seed maxPlayers with the default; clear it for fixed formats.
    if (fmt.id === 'custom') {
      update({ format: fmt.id, maxPlayers: details.maxPlayers ?? CUSTOM_MAX_PLAYERS_DEFAULT });
    } else {
      update({ format: fmt.id, maxPlayers: undefined });
    }
  }

  return (
    <View style={styles.container}>
      {/* Format */}
      <View>
        <Text style={styles.label}>Format</Text>
        <Segmented
          options={SOCCER_FORMATS}
          selected={details.format ?? DEFAULT_DETAILS.format!}
          onSelect={handleFormatSelect}
        />
        {!isCustom && (
          <PositionPicker
            mode="create"
            sport="soccer"
            silhouette={SoccerField}
            format={details.format ?? DEFAULT_DETAILS.format!}
            onClaimsChange={(claims) => update({ pendingClaims: claims })}
          />
        )}
      </View>

      {/* Max players stepper — custom format only */}
      {isCustom && (
        <MaxPlayersStepper
          value={details.maxPlayers ?? CUSTOM_MAX_PLAYERS_DEFAULT}
          onChange={(n) => update({ maxPlayers: n })}
        />
      )}

      {/* Skill level */}
      <SkillSelector
        selectedSkill={details.skillLevel as SkillLevel}
        onSelectSkill={(skill) => update({ skillLevel: skill })}
      />

      {/* Venue */}
      <VenuePicker
        sport="soccer"
        venueId={details.venueId}
        venueName={details.venueName}
        onSelect={(id, name) => update({ venueId: id, venueName: name })}
      />

      {/* Bringing a ball */}
      <View style={styles.toggleRow}>
        <View style={styles.toggleLabel}>
          <Text style={styles.label}>{"I'm bringing a ball"}</Text>
          <Text style={styles.toggleHint}>Let others know equipment is covered</Text>
        </View>
        <Switch
          value={details.bringingBall === true}
          onValueChange={(v) => update({ bringingBall: v })}
          trackColor={{ false: colors.surfaceElevated, true: colors.accentSoft }}
          thumbColor={details.bringingBall === true ? colors.accent : colors.textMuted}
        />
      </View>

      {/* Notes */}
      <AppInput
        icon="document-text-outline"
        label="Notes (optional)"
        multiline
        maxLength={500}
        onChangeText={(text) => update({ notes: text })}
        placeholder="Pitch number, parking, gear needed…"
        value={details.notes}
      />
      {(details.notes?.length ?? 0) > 0 && (
        <Text style={styles.charCount}>{details.notes!.length}/500</Text>
      )}
    </View>
  );
}

// ─── Soccer config ─────────────────────────────────────────────────────────────

export const soccerConfig: SportConfig = {
  id: 'soccer',
  label: 'Soccer',
  icon: 'football',
  emoji: '⚽',
  venueRequired: true,
  formats: [...SOCCER_FORMATS],
  silhouette: SoccerField,

  CreateEventSection: SoccerSection,

  eventCardMeta(details) {
    if (!details) return '';
    const parts: string[] = [];
    const fmt = SOCCER_FORMATS.find((f) => f.id === details.format);
    if (fmt) {
      parts.push(fmt.label);
      if (fmt.id === 'custom' && details.maxPlayers) {
        parts.push(`${details.maxPlayers} players`);
      }
    }
    if (details.skillLevel) parts.push(details.skillLevel);
    if (details.bringingBall) parts.push('Ball provided');
    return parts.join(' · ');
  },
};

// ─── Styles ───────────────────────────────────────────────────────────────────

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
