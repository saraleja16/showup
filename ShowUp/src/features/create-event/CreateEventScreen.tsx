import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { AppButton } from '@/src/components/AppButton';
import { AppCard } from '@/src/components/AppCard';
import { AppInput } from '@/src/components/AppInput';
import { SectionTitle } from '@/src/components/SectionTitle';
import { colors, radii, spacing, typography } from '@/src/constants/theme';
import { DatePickerField } from '@/src/features/create-event/components/DatePickerField';
import { EventSchedulePickers } from '@/src/features/create-event/components/EventSchedulePickers';
import { SportSelector } from '@/src/features/create-event/components/SportSelector';
import { TimePickerField } from '@/src/features/create-event/components/TimePickerField';
import { useSession } from '@/src/auth';
import { createEvent, getEventById, inviteToEvent, getApiErrorMessage } from '@/src/api';
import { ENABLED_SPORTS, SPORTS } from '@/src/sports/registry';
import type { SportDetails } from '@/src/sports/types';

type SchedulePickerMode = 'date' | 'time' | null;

function formatEventDate(date: Date): string {
  return date.toLocaleDateString('en-AU', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function formatEventTime(date: Date): string {
  return date
    .toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    })
    .toUpperCase();
}


export function CreateEventScreen() {
  const { user } = useSession();
  const router = useRouter();
  const { templateEventId } = useLocalSearchParams<{ templateEventId?: string }>();

  const [sport, setSport] = useState<string>(ENABLED_SPORTS[0]);
  const [sportDetails, setSportDetails] = useState<SportDetails>({});
  const [title, setTitle] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [date, setDate] = useState<Date>(new Date());
  const [pickerMode, setPickerMode] = useState<SchedulePickerMode>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loadingTemplate, setLoadingTemplate] = useState(Boolean(templateEventId));

  // Track whether the user has manually typed a title so we don't clobber it
  const titleWasManuallySet = useRef(false);

  // Quick create: prefill sport/venue/format/title/privacy from the referenced
  // event so the user only has to set date, time, and invite friends. Slot
  // claims never carry over — those get redone fresh for the new event.
  useEffect(() => {
    if (!templateEventId) return;
    let cancelled = false;

    async function loadTemplate() {
      try {
        const source = await getEventById(templateEventId!, user?.id);
        if (cancelled) return;
        const nextSport = source.sport ?? ENABLED_SPORTS[0];
        setSport(nextSport);
        setSportDetails({
          ...source.sportDetails,
          venueId: source.venueId,
          venueName: source.venueName,
        });
        setTitle(source.title);
        titleWasManuallySet.current = true;
        setIsPrivate(Boolean(source.isPrivate));
      } catch {
        // Template couldn't load — user just falls back to a blank form.
      } finally {
        if (!cancelled) setLoadingTemplate(false);
      }
    }

    loadTemplate();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateEventId]);

  function handleTitleChange(text: string) {
    titleWasManuallySet.current = text.length > 0;
    setTitle(text);
  }

  function handleTitleSuggestion(suggestion: string) {
    if (!titleWasManuallySet.current) {
      setTitle(suggestion);
    }
  }

  function handleSportChange(newSport: string) {
    setSport(newSport);
    setSportDetails({});
    titleWasManuallySet.current = false;
    setTitle('');
  }

  const sportConfig = SPORTS[sport];
  const venueRequired = sportConfig?.venueRequired ?? false;
  const venueSelected = !venueRequired || !!sportDetails.venueId;

  // Any format with capacity > 0 has defined player positions and requires the organizer
  // to claim their own slot before creating. Formats with capacity: 0 (e.g. soccer custom)
  // have no formation, so the gate does not apply.
  const currentFormat = sportConfig?.formats.find((f) => f.id === sportDetails.format);
  const requiresHostSlot = (currentFormat?.capacity ?? 0) > 0;
  const hasHostSlot = Object.values(sportDetails.pendingClaims ?? {}).some(
    (c) => c.type === 'self'
  );
  const slotGatePassed = !requiresHostSlot || hasHostSlot;

  const canCreate = !isSubmitting && title.trim().length > 0 && venueSelected && slotGatePassed;

  const handleCreate = async () => {
    if (!title.trim()) {
      Alert.alert('Missing title', 'Please enter an event title.');
      return;
    }
    if (venueRequired && !sportDetails.venueId) {
      Alert.alert('Venue required', 'Please select a venue before creating the event.');
      return;
    }
    if (!user) {
      Alert.alert('Not signed in', 'Please sign in to create an event.');
      return;
    }
    if (date <= new Date()) {
      Alert.alert('Invalid schedule', 'Please choose a future date and time.');
      return;
    }

    setIsSubmitting(true);
    try {
      // Convert pending slot claims → initialClaims array for the API.
      // 'self' claims carry the organizer's userId; 'friend' claims carry a display name.
      // 'match' claims aren't sent as initialClaims — they require the real event id, so
      // they're turned into invitations (with an accept/reject step) after creation below.
      const rawClaims = sportDetails.pendingClaims ?? {};
      const initialClaims = Object.entries(rawClaims)
        .filter(([, claim]) => claim.type !== 'match')
        .map(([slotId, claim]) =>
          claim.type === 'self'
            ? { slotId, friendUserId: user.id }
            : { slotId, friendName: claim.type === 'friend' ? claim.friendName : undefined }
        );
      const matchInvites = Object.entries(rawClaims)
        .filter(
          (entry): entry is [string, Extract<typeof entry[1], { type: 'match' }>] =>
            entry[1].type === 'match'
        )
        .map(([slotId, claim]) => ({ slotId, matchUserId: claim.matchUserId, matchName: claim.matchName }));

      const newEvent = await createEvent({
        creatorId: user.id,
        sport,
        venueId: sportDetails.venueId!,
        title: title.trim(),
        scheduledAt: date.toISOString(),
        // Strip UI-only fields (venueId/venueName used at top level; pendingClaims converted above)
        sportDetails: (({ venueId, venueName, pendingClaims, ...rest }) => rest)(sportDetails),
        ...(initialClaims.length > 0 ? { initialClaims } : {}),
        isPrivate,
      });

      let inviteFailures: string[] = [];
      if (matchInvites.length > 0) {
        const results = await Promise.allSettled(
          matchInvites.map((inv) => inviteToEvent(newEvent.id, inv.matchUserId, inv.slotId))
        );
        inviteFailures = results
          .map((r, i) => (r.status === 'rejected' ? matchInvites[i].matchName : null))
          .filter((name): name is string => name !== null);
      }

      const inviteNote =
        matchInvites.length > 0 && inviteFailures.length === 0
          ? ` Invitations sent to ${matchInvites.map((i) => i.matchName).join(', ')}.`
          : inviteFailures.length > 0
          ? ` Could not send an invitation to: ${inviteFailures.join(', ')}.`
          : '';

      Alert.alert('Event Created', `Your event has been created successfully!${inviteNote}`, [
        { text: 'OK', onPress: () => router.replace('/(tabs)/create') },
      ]);
    } catch (err) {
      Alert.alert('Error', getApiErrorMessage(err, 'Could not create event. Please try again.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const { CreateEventSection } = sportConfig ?? {};

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor={colors.background} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Header />

          <View style={styles.intro}>
            <Text style={styles.title}>Create a game</Text>
            <Text style={styles.subtitle}>
              {templateEventId
                ? 'Reused your last setup — update the date, time, and invite friends.'
                : 'Set up your event in under a minute'}
            </Text>
          </View>

          {loadingTemplate ? (
            <ActivityIndicator color={colors.accent} style={styles.templateLoader} />
          ) : null}

          <AppCard style={styles.formCard}>
            <SectionTitle eyebrow="NEW EVENT" title="Game details" />
            <View style={styles.formGap}>
              {/* Sport selector — driven by ENABLED_SPORTS in registry */}
              <SportSelector selectedSport={sport} onSelectSport={handleSportChange} />

              {/* Title — auto-populated from sport section, editable */}
              <AppInput
                icon="sparkles-outline"
                label="Event title"
                onChangeText={handleTitleChange}
                placeholder="Doubles at Sydney Olympic Park"
                value={title}
              />

              {/* Visibility — public (anyone can request to join) vs private (matches only) */}
              <View style={styles.visibilityWrap}>
                <Text style={styles.visibilityLabel}>Who can join</Text>
                <View style={styles.visibilityRow}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Public event — anyone can request to join"
                    onPress={() => setIsPrivate(false)}
                    style={[styles.visibilityPill, !isPrivate && styles.visibilityPillActive]}
                  >
                    <Ionicons
                      name="globe-outline"
                      size={16}
                      color={!isPrivate ? colors.background : colors.textSecondary}
                    />
                    <Text style={[styles.visibilityPillText, !isPrivate && styles.visibilityPillTextActive]}>
                      Public
                    </Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Private event — only your matches can join"
                    onPress={() => setIsPrivate(true)}
                    style={[styles.visibilityPill, isPrivate && styles.visibilityPillActive]}
                  >
                    <Ionicons
                      name="lock-closed-outline"
                      size={16}
                      color={isPrivate ? colors.background : colors.textSecondary}
                    />
                    <Text style={[styles.visibilityPillText, isPrivate && styles.visibilityPillTextActive]}>
                      Private
                    </Text>
                  </Pressable>
                </View>
                <Text style={styles.visibilityHint}>
                  {isPrivate
                    ? 'Only people you’ve matched with can see and request to join this event.'
                    : 'Anyone browsing ShowUp can see and request to join this event.'}
                </Text>
              </View>

              {/* Date + Time */}
              <View style={styles.twoColumn}>
                <DatePickerField
                  label="Date"
                  value={formatEventDate(date)}
                  onPress={() => setPickerMode('date')}
                />
                <TimePickerField
                  label="Time"
                  value={formatEventTime(date)}
                  onPress={() => setPickerMode('time')}
                />
              </View>

              {/* Sport-specific fields */}
              {CreateEventSection && (
                <CreateEventSection
                  value={sportDetails}
                  onChange={setSportDetails}
                  onTitleSuggestion={handleTitleSuggestion}
                />
              )}
            </View>
          </AppCard>

          <View style={styles.footer}>
            <AppButton
              icon="checkmark-circle"
              label={isSubmitting ? 'Creating…' : 'Create Event'}
              onPress={handleCreate}
              disabled={!canCreate}
            />
            {venueRequired && !sportDetails.venueId && (
              <Text style={styles.venueHint}>Select a venue above to enable Create</Text>
            )}
            {requiresHostSlot && !hasHostSlot && (
              <Text style={styles.venueHint}>Pick your position above to enable Create</Text>
            )}
          </View>
        </ScrollView>

        <EventSchedulePickers
          mode={pickerMode}
          value={date}
          onChange={setDate}
          onClose={() => setPickerMode(null)}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Header() {
  return (
    <View style={styles.header}>
      <View>
        <View style={styles.logoRow}>
          <Text style={styles.logoWhite}>SHOW</Text>
          <Text style={styles.logoBlue}>UP</Text>
        </View>
        <Text style={styles.headerCaption}>Sydney pickup sports</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingBottom: 118,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
  },
  flex: {
    flex: 1,
  },
  footer: {
    marginTop: spacing.xl,
    gap: spacing.sm,
  },
  formCard: {
    borderColor: colors.borderStrong,
  },
  formGap: {
    gap: spacing.xl,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.xxxl,
  },
  headerCaption: {
    color: colors.textMuted,
    marginTop: spacing.xs,
    ...typography.small,
  },
  intro: {
    marginBottom: spacing.xxl,
  },
  logoBlue: {
    color: colors.accent,
    fontSize: 27,
    fontWeight: '900',
  },
  logoRow: {
    alignItems: 'baseline',
    flexDirection: 'row',
  },
  logoWhite: {
    color: colors.textPrimary,
    fontSize: 27,
    fontWeight: '900',
  },
  safe: {
    backgroundColor: colors.background,
    flex: 1,
  },
  subtitle: {
    color: colors.textSecondary,
    marginTop: spacing.sm,
    ...typography.body,
  },
  templateLoader: {
    marginBottom: spacing.lg,
  },
  title: {
    color: colors.textPrimary,
    ...typography.title,
  },
  twoColumn: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  venueHint: {
    color: colors.textMuted,
    fontSize: 12,
    textAlign: 'center',
  },
  visibilityWrap: {
    gap: spacing.sm,
  },
  visibilityLabel: {
    color: colors.textSecondary,
    ...typography.label,
  },
  visibilityRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  visibilityPill: {
    alignItems: 'center',
    backgroundColor: colors.surfaceElevated,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    flex: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'center',
    minHeight: 48,
  },
  visibilityPillActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  visibilityPillText: {
    color: colors.textSecondary,
    ...typography.label,
  },
  visibilityPillTextActive: {
    color: colors.background,
    fontWeight: '900',
  },
  visibilityHint: {
    color: colors.textMuted,
    ...typography.small,
  },
});
