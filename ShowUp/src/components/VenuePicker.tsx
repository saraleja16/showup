import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { getVenues, type Venue } from '@/src/api';
import { colors, radii, spacing, typography } from '@/src/constants/theme';

interface VenuePickerProps {
  sport: string;
  venueId: number | undefined;
  venueName: string | undefined;
  onSelect: (venueId: number, venueName: string) => void;
}

export function VenuePicker({ sport, venueId, venueName, onSelect }: VenuePickerProps) {
  const [venues, setVenues] = useState<Venue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getVenues(sport)
      .then((data) => {
        if (!cancelled) {
          setVenues(data);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError('Could not load venues.');
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [sport]);

  const filtered = query.trim()
    ? venues.filter(
        (v) =>
          v.name.toLowerCase().includes(query.toLowerCase()) ||
          v.address.toLowerCase().includes(query.toLowerCase())
      )
    : venues;

  return (
    <View>
      <Text style={styles.label}>Venue</Text>

      <Pressable
        accessibilityRole="button"
        onPress={() => setExpanded((prev) => !prev)}
        style={({ pressed }) => [
          styles.trigger,
          venueId != null && styles.triggerSelected,
          pressed && styles.pressed,
        ]}
      >
        <Ionicons
          name="location-outline"
          size={18}
          color={venueId ? colors.accent : colors.textMuted}
        />
        <Text
          style={[
            styles.triggerText,
            venueId ? styles.triggerTextSelected : styles.triggerTextPlaceholder,
          ]}
          numberOfLines={1}
        >
          {venueName ?? 'Select a venue…'}
        </Text>
        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={16}
          color={colors.textMuted}
        />
      </Pressable>

      {expanded && (
        <View style={styles.dropdown}>
          <TextInput
            style={styles.search}
            placeholder="Search venues…"
            placeholderTextColor={colors.textMuted}
            value={query}
            onChangeText={setQuery}
            autoFocus
          />

          {loading ? (
            <ActivityIndicator color={colors.accent} style={styles.center} />
          ) : error ? (
            <Text style={styles.stateText}>{error}</Text>
          ) : filtered.length === 0 ? (
            <Text style={styles.stateText}>
              {venues.length === 0
                ? 'No venues available yet for this sport.'
                : 'No venues match your search.'}
            </Text>
          ) : (
            <ScrollView
              keyboardShouldPersistTaps="handled"
              scrollEnabled={false}
            >
              {filtered.map((item) => {
                const selected = item.id === venueId;
                return (
                  <Pressable
                    key={item.id}
                    accessibilityRole="button"
                    onPress={() => {
                      onSelect(item.id, item.name);
                      setExpanded(false);
                      setQuery('');
                    }}
                    style={({ pressed }) => [
                      styles.venueRow,
                      selected && styles.venueRowSelected,
                      pressed && styles.pressed,
                    ]}
                  >
                    <View style={styles.venueMeta}>
                      <Text
                        style={[styles.venueName, selected && styles.venueNameSelected]}
                      >
                        {item.name}
                      </Text>
                      <Text style={styles.venueAddress} numberOfLines={1}>
                        {item.address}
                      </Text>
                    </View>
                    {selected && (
                      <Ionicons name="checkmark-circle" size={18} color={colors.accent} />
                    )}
                  </Pressable>
                );
              })}
            </ScrollView>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    color: colors.textSecondary,
    marginBottom: spacing.sm,
    ...typography.label,
  },
  trigger: {
    alignItems: 'center',
    backgroundColor: colors.surfaceElevated,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: 54,
    paddingHorizontal: spacing.lg,
  },
  triggerSelected: {
    borderColor: colors.accent,
  },
  triggerText: {
    flex: 1,
    ...typography.body,
  },
  triggerTextSelected: {
    color: colors.textPrimary,
  },
  triggerTextPlaceholder: {
    color: colors.textMuted,
  },
  pressed: {
    opacity: 0.78,
  },
  dropdown: {
    backgroundColor: colors.surfaceElevated,
    borderColor: colors.borderStrong,
    borderRadius: radii.md,
    borderWidth: 1,
    marginTop: spacing.sm,
    overflow: 'hidden',
  },
  search: {
    backgroundColor: colors.surface,
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    color: colors.textPrimary,
    fontSize: 14,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  center: {
    marginVertical: spacing.xl,
  },
  stateText: {
    color: colors.textMuted,
    fontSize: 13,
    padding: spacing.lg,
    textAlign: 'center',
  },
  venueRow: {
    alignItems: 'center',
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  venueRowSelected: {
    backgroundColor: colors.accentSoft,
  },
  venueMeta: {
    flex: 1,
  },
  venueName: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 2,
  },
  venueNameSelected: {
    color: colors.accent,
  },
  venueAddress: {
    color: colors.textMuted,
    fontSize: 12,
  },
});
