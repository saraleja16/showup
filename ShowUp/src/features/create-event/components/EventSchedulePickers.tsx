import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { createElement, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { colors, radii, spacing, typography } from '@/src/constants/theme';

type PickerMode = 'date' | 'time' | null;

interface EventSchedulePickersProps {
  mode: PickerMode;
  value: Date;
  onChange: (date: Date) => void;
  onClose: () => void;
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function startOfDay(date: Date): Date {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

type TimeSlot = {
  key: string;
  label: string;
  hours: number;
  minutes: number;
  disabled: boolean;
};

type Meridiem = 'am' | 'pm';

type ParsedTimeInput = {
  hours: number;
  minutes: number;
  meridiem: Meridiem;
};

const TIME_INTERVAL_MINUTES = 15;

function formatTimeLabel(date: Date): string {
  return date
    .toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    })
    .toUpperCase();
}

function getMeridiem(hours: number): Meridiem {
  return hours >= 12 ? 'pm' : 'am';
}

function formatTimeInputValue(hours: number, minutes: number): string {
  const displayHour = hours % 12 === 0 ? 12 : hours % 12;
  return `${displayHour}:${String(minutes).padStart(2, '0')}`;
}

function normalizeMeridiem(value: string): Meridiem | null {
  const match = value.toLowerCase().match(/(am|pm|a|p)$/);
  if (!match) return null;
  return match[1].startsWith('a') ? 'am' : 'pm';
}

function parseTimeInput(input: string, fallbackMeridiem: Meridiem): ParsedTimeInput | null {
  const value = input.trim().toLowerCase().replace(/\s+/g, '');
  if (!value) return null;

  const explicitMeridiem = normalizeMeridiem(value);
  const numericValue = value.replace(/[ap]m?$/, '');
  const leadingZeroHour = /^0\d(?::?\d{2})?$/.test(numericValue);
  let hours: number;
  let minutes = 0;

  if (numericValue.includes(':')) {
    const parts = numericValue.split(':');
    if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
    hours = Number(parts[0]);
    minutes = Number(parts[1]);
  } else {
    if (!/^\d{1,4}$/.test(numericValue)) return null;
    if (numericValue.length <= 2) {
      hours = Number(numericValue);
    } else {
      hours = Number(numericValue.slice(0, -2));
      minutes = Number(numericValue.slice(-2));
    }
  }

  if (!Number.isInteger(hours) || !Number.isInteger(minutes) || minutes < 0 || minutes > 59) {
    return null;
  }

  if (explicitMeridiem) {
    if (hours < 1 || hours > 12) return null;
    if (hours === 12) {
      hours = explicitMeridiem === 'am' ? 0 : 12;
    } else if (explicitMeridiem === 'pm') {
      hours += 12;
    }
  } else if (hours >= 0 && hours <= 23) {
    if (hours === 0 || leadingZeroHour) {
      hours = hours === 12 ? 0 : hours;
    } else if (hours >= 1 && hours <= 12) {
      if (hours === 12) {
        hours = fallbackMeridiem === 'am' ? 0 : 12;
      } else if (fallbackMeridiem === 'pm') {
        hours += 12;
      }
    }
  } else {
    return null;
  }

  return { hours, minutes, meridiem: getMeridiem(hours) };
}

function buildTimeSlots(forDate: Date): TimeSlot[] {
  const now = new Date();
  const isToday = isSameDay(forDate, now);
  const slots: TimeSlot[] = [];

  for (let totalMinutes = 0; totalMinutes < 24 * 60; totalMinutes += TIME_INTERVAL_MINUTES) {
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    const slot = new Date(forDate);
    slot.setHours(hours, minutes, 0, 0);

    slots.push({
      key: `${hours}-${minutes}`,
      label: formatTimeLabel(slot),
      hours,
      minutes,
      disabled: isToday && slot <= now,
    });
  }

  return slots;
}

function mergeDatePart(base: Date, selected: Date): Date {
  const merged = new Date(base);
  merged.setFullYear(selected.getFullYear(), selected.getMonth(), selected.getDate());
  return merged;
}

function mergeTimePart(base: Date, hours: number, minutes: number): Date {
  const merged = new Date(base);
  merged.setHours(hours, minutes, 0, 0);
  return merged;
}

function formatDateForWebInput(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function EventSchedulePickers({ mode, value, onChange, onClose }: EventSchedulePickersProps) {
  const visible = mode !== null;
  const sheetAnim = useRef(new Animated.Value(0)).current;
  const backdropAnim = useRef(new Animated.Value(0)).current;
  const [pickerDate, setPickerDate] = useState(value);
  const [timeInput, setTimeInput] = useState(formatTimeInputValue(value.getHours(), value.getMinutes()));
  const [timeMeridiem, setTimeMeridiem] = useState<Meridiem>(getMeridiem(value.getHours()));
  const [timeError, setTimeError] = useState<string | null>(null);
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  useEffect(() => {
    if (visible && mode === 'date') {
      setPickerDate(value);
    }
    if (visible && mode === 'time') {
      setTimeInput(formatTimeInputValue(value.getHours(), value.getMinutes()));
      setTimeMeridiem(getMeridiem(value.getHours()));
      setTimeError(null);
    }
  }, [visible, mode, value]);

  useEffect(() => {
    if (!visible) {
      sheetAnim.setValue(0);
      backdropAnim.setValue(0);
      return;
    }

    Animated.parallel([
      Animated.timing(backdropAnim, {
        toValue: 1,
        duration: 220,
        useNativeDriver: true,
      }),
      Animated.spring(sheetAnim, {
        toValue: 1,
        damping: 22,
        stiffness: 220,
        mass: 0.9,
        useNativeDriver: true,
      }),
    ]).start();
  }, [visible, backdropAnim, sheetAnim]);

  useEffect(() => {
    const showSub = Keyboard.addListener('keyboardDidShow', () => setKeyboardVisible(true));
    const hideSub = Keyboard.addListener('keyboardDidHide', () => setKeyboardVisible(false));

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  function animateClose(onFinished?: () => void) {
    Animated.parallel([
      Animated.timing(backdropAnim, {
        toValue: 0,
        duration: 180,
        useNativeDriver: true,
      }),
      Animated.timing(sheetAnim, {
        toValue: 0,
        duration: 180,
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (finished) {
        onClose();
        onFinished?.();
      }
    });
  }

  function handleBackdropPress() {
    if (mode === 'time' && keyboardVisible) {
      Keyboard.dismiss();
      return;
    }

    animateClose();
  }

  function confirmDate(selected: Date) {
    let merged = mergeDatePart(value, selected);
    const now = new Date();

    if (merged <= now) {
      const slots = buildTimeSlots(merged);
      const firstAvailable = slots.find((slot) => !slot.disabled);
      if (firstAvailable) {
        merged = mergeTimePart(merged, firstAvailable.hours, firstAvailable.minutes);
      } else {
        const tomorrow = new Date(selected);
        tomorrow.setDate(tomorrow.getDate() + 1);
        merged = mergeDatePart(value, tomorrow);
        merged.setHours(9, 0, 0, 0);
      }
    }

    onChange(merged);
    animateClose();
  }

  function handleTimeInputChange(text: string) {
    setTimeError(null);

    const parsed = parseTimeInput(text, timeMeridiem);
    const isCompleteNumeric = /^\d{3,4}$/.test(text.trim());
    const isCompleteClockTime = /^\d{1,2}:\d{2}$/i.test(text.trim());
    const hasMeridiem = /[ap]m?$/i.test(text.trim());

    if (parsed && (isCompleteNumeric || isCompleteClockTime || hasMeridiem)) {
      setTimeMeridiem(parsed.meridiem);
      setTimeInput(formatTimeInputValue(parsed.hours, parsed.minutes));
      return;
    }

    setTimeInput(text);
  }

  function handleMeridiemSelect(nextMeridiem: Meridiem) {
    setTimeError(null);
    setTimeMeridiem(nextMeridiem);

    const parsed = parseTimeInput(timeInput, nextMeridiem);
    if (parsed) {
      setTimeInput(formatTimeInputValue(parsed.hours, parsed.minutes));
    }
  }

  function confirmTime() {
    const parsed = parseTimeInput(timeInput, timeMeridiem);
    if (!parsed) {
      setTimeError('Enter a valid time, such as 7:30 PM.');
      return;
    }

    const merged = mergeTimePart(value, parsed.hours, parsed.minutes);
    if (isSameDay(merged, new Date()) && merged <= new Date()) {
      setTimeError('Choose a future time.');
      return;
    }

    Keyboard.dismiss();
    onChange(merged);
    animateClose();
  }

  if (!visible || mode === null) {
    return null;
  }

  const minimumDate = startOfDay(new Date());

  return (
    <Modal visible transparent animationType="none" onRequestClose={() => animateClose()}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : Platform.OS === 'android' ? 'height' : undefined}
        keyboardVerticalOffset={0}
        style={styles.root}
      >
        <Pressable style={styles.backdropPressable} onPress={handleBackdropPress}>
          <Animated.View style={[styles.backdrop, { opacity: backdropAnim }]} />
        </Pressable>

        <Animated.View
          style={[
            styles.sheet,
            mode === 'time' && styles.timeSheet,
            {
              transform: [
                {
                  translateY: sheetAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [mode === 'time' ? 420 : 380, 0],
                  }),
                },
              ],
            },
          ]}
        >
          <View style={styles.handle} />
          <Text style={styles.sheetTitle}>{mode === 'date' ? 'SELECT DATE' : 'SELECT TIME'}</Text>

          {mode === 'date' ? (
            <>
              {Platform.OS === 'web' ? (
                <View style={styles.webDateWrap}>
                  {createElement('input', {
                    type: 'date',
                    value: formatDateForWebInput(pickerDate),
                    min: formatDateForWebInput(minimumDate),
                    onChange: (event: { target: { value: string } }) => {
                      const nextValue = event.target.value;
                      if (!nextValue) {
                        return;
                      }
                      const [year, month, day] = nextValue.split('-').map(Number);
                      setPickerDate(new Date(year, month - 1, day));
                    },
                    style: {
                      backgroundColor: colors.surfaceElevated,
                      color: colors.textPrimary,
                      borderRadius: radii.md,
                      padding: '14px 16px',
                      fontSize: 16,
                      border: `1px solid ${colors.border}`,
                      width: '100%',
                      boxSizing: 'border-box',
                      colorScheme: 'dark',
                    },
                  })}
                </View>
              ) : (
                <DateTimePicker
                  value={pickerDate}
                  mode="date"
                  display={Platform.OS === 'ios' ? 'inline' : 'calendar'}
                  minimumDate={minimumDate}
                  themeVariant="dark"
                  onChange={(_, selected) => {
                    if (selected) {
                      setPickerDate(selected);
                    }
                  }}
                />
              )}
              <TouchableOpacity
                style={styles.doneButton}
                onPress={() => confirmDate(pickerDate)}
                activeOpacity={0.85}
              >
                <Text style={styles.doneText}>Done</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <View style={styles.timeInputWrap}>
                <View style={[styles.timeInputShell, timeError && styles.timeInputShellError]}>
                  <Ionicons name="time-outline" size={20} color={colors.accent} />
                  <TextInput
                    autoCapitalize="characters"
                    autoCorrect={false}
                    keyboardType="numbers-and-punctuation"
                    onChangeText={handleTimeInputChange}
                    onSubmitEditing={confirmTime}
                    placeholder="HH:MM"
                    placeholderTextColor={colors.textMuted}
                    returnKeyType="done"
                    selectTextOnFocus
                    style={styles.timeInput}
                    value={timeInput}
                  />
                  <View style={styles.meridiemToggle}>
                    {(['am', 'pm'] as const).map((option) => {
                      const selected = timeMeridiem === option;
                      return (
                        <Pressable
                          key={option}
                          onPress={() => handleMeridiemSelect(option)}
                          style={[styles.meridiemOption, selected && styles.meridiemOptionSelected]}
                        >
                          <Text
                            style={[
                              styles.meridiemOptionText,
                              selected && styles.meridiemOptionTextSelected,
                            ]}
                          >
                            {option.toUpperCase()}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
                {timeError ? <Text style={styles.timeErrorText}>{timeError}</Text> : null}
                <Text style={styles.timeHintText}>Try 7, 730, 7am, 19:30, or use AM/PM</Text>
              </View>
              <TouchableOpacity
                style={styles.doneButton}
                onPress={confirmTime}
                activeOpacity={0.85}
              >
                <Text style={styles.doneText}>Done</Text>
              </TouchableOpacity>
            </>
          )}
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
  },
  backdropPressable: {
    ...StyleSheet.absoluteFillObject,
  },
  doneButton: {
    alignItems: 'center',
    borderTopColor: colors.border,
    borderTopWidth: 1,
    marginTop: spacing.sm,
    paddingVertical: spacing.lg,
  },
  doneText: {
    color: colors.accent,
    fontSize: 16,
    fontWeight: '700',
  },
  emptyTimeText: {
    color: colors.textSecondary,
    paddingVertical: spacing.xl,
    textAlign: 'center',
    ...typography.body,
  },
  handle: {
    alignSelf: 'center',
    backgroundColor: colors.border,
    borderRadius: 3,
    height: 4,
    marginBottom: spacing.md,
    width: 42,
  },
  pressed: {
    opacity: 0.8,
  },
  root: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopColor: colors.borderStrong,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    borderTopWidth: 1,
    maxHeight: '78%',
    paddingBottom: Platform.OS === 'ios' ? spacing.xxxl : spacing.xl,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  sheetTitle: {
    ...typography.label,
    color: colors.accent,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 2,
    marginBottom: spacing.md,
    textAlign: 'center',
  },
  timeList: {
    maxHeight: 360,
  },
  timeListContent: {
    gap: spacing.sm,
    paddingBottom: spacing.md,
  },
  timeOption: {
    backgroundColor: colors.surfaceElevated,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  timeOptionSelected: {
    backgroundColor: colors.accentSoft,
    borderColor: colors.accent,
  },
  timeOptionDisabled: {
    opacity: 0.35,
  },
  timeOptionText: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  timeOptionTextSelected: {
    color: colors.accent,
  },
  timeOptionTextDisabled: {
    color: colors.textMuted,
  },
  timeSheet: {
    maxHeight: '46%',
  },
  timeInputWrap: {
    gap: spacing.sm,
    paddingBottom: spacing.md,
  },
  timeInputShell: {
    alignItems: 'center',
    backgroundColor: colors.surfaceElevated,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: 56,
    paddingHorizontal: spacing.lg,
  },
  timeInputShellError: {
    borderColor: colors.danger,
  },
  timeInput: {
    color: colors.textPrimary,
    flex: 1,
    fontSize: 18,
    fontWeight: '700',
    minWidth: 0,
    paddingVertical: Platform.OS === 'web' ? spacing.md : 0,
  },
  meridiemToggle: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.sm,
    borderWidth: 1,
    flexDirection: 'row',
    overflow: 'hidden',
  },
  meridiemOption: {
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 44,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  meridiemOptionSelected: {
    backgroundColor: colors.accent,
  },
  meridiemOptionText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '800',
  },
  meridiemOptionTextSelected: {
    color: colors.background,
  },
  timeErrorText: {
    color: colors.danger,
    ...typography.small,
  },
  timeHintText: {
    color: colors.textMuted,
    ...typography.small,
  },
  webDateWrap: {
    paddingVertical: spacing.sm,
  },
});
