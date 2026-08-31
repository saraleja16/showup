import DateTimePicker from '@react-native-community/datetimepicker';
import { createElement, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';

import { checkUsername, getApiErrorMessage, getApiErrorStatus, getRetryAfterSeconds, registerUser } from '@/src/api';
import { useSession } from '@/src/auth';
import { SportIcon } from '@/src/components/SportIcon';
import { ENABLED_SPORTS, SPORTS } from '@/src/sports/registry';

const MAX_DATE_OF_BIRTH = new Date();
const MIN_DATE_OF_BIRTH = new Date(
  MAX_DATE_OF_BIRTH.getFullYear() - 120,
  MAX_DATE_OF_BIRTH.getMonth(),
  MAX_DATE_OF_BIRTH.getDate()
);
const DEFAULT_DATE_OF_BIRTH = new Date(2000, 0, 1);

function formatDateForApi(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDateForDisplay(date: Date): string {
  return date.toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function isFutureDate(date: Date): boolean {
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  return date > today;
}

// Preferred sports are driven by the registry.
// Add a sport to ENABLED_SPORTS in src/sports/registry.ts to surface it here automatically.
const SPORT_OPTIONS = ENABLED_SPORTS.map((id) => ({
  id,
  emoji: SPORTS[id].emoji,
  label: SPORTS[id].label,
}));

const SEX_OPTIONS = ['Male', 'Female', 'Other'] as const;

type UsernameStatus = 'checking' | 'available' | 'taken' | 'error' | null;

export default function RegisterScreen() {
  const router = useRouter();
  const { signIn } = useSession();

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState<Date | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [pickerDate, setPickerDate] = useState(DEFAULT_DATE_OF_BIRTH);
  const sheetAnim = useRef(new Animated.Value(0)).current;
  const backdropAnim = useRef(new Animated.Value(0)).current;
  const [sex, setSex] = useState<(typeof SEX_OPTIONS)[number] | ''>('');
  const [preferredSports, setPreferredSports] = useState<string[]>([]);
  const [usernameStatus, setUsernameStatus] = useState<UsernameStatus>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [cooldownUntil, setCooldownUntil] = useState<number | null>(null);
  const [cooldownSecondsLeft, setCooldownSecondsLeft] = useState(0);

  useEffect(() => {
    const trimmed = username.trim();
    if (!trimmed) {
      setUsernameStatus(null);
      return;
    }

    setUsernameStatus('checking');
    const timer = setTimeout(async () => {
      try {
        const result = await checkUsername(trimmed);
        setUsernameStatus(result.available ? 'available' : 'taken');
      } catch {
        setUsernameStatus('error');
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [username]);

  useEffect(() => {
    if (!showDatePicker) {
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
  }, [showDatePicker, backdropAnim, sheetAnim]);

  function openDatePicker() {
    setPickerDate(dateOfBirth ?? DEFAULT_DATE_OF_BIRTH);
    setShowDatePicker(true);
  }

  function closeDatePicker() {
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
        setShowDatePicker(false);
      }
    });
  }

  function confirmDatePicker() {
    setDateOfBirth(pickerDate);
    closeDatePicker();
  }

  function toggleSport(id: string) {
    setPreferredSports((current) =>
      current.includes(id) ? current.filter((sport) => sport !== id) : [...current, id]
    );
  }


  useEffect(() => {
    if (!cooldownUntil) {
      setCooldownSecondsLeft(0);
      return;
    }

    const tick = () => {
      const left = Math.max(0, Math.ceil((cooldownUntil - Date.now()) / 1000));
      setCooldownSecondsLeft(left);
      if (left <= 0) {
        setCooldownUntil(null);
      }
    };

    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [cooldownUntil]);

  const isCoolingDown = cooldownSecondsLeft > 0;
  const submitDisabled = isSubmitting || isCoolingDown;

  async function handleRegister() {
    const trimmedUsername = username.trim();
    const trimmedEmail = email.trim();

    if (!firstName.trim() || !lastName.trim() || !trimmedUsername || !trimmedEmail || !password) {
      setError('Please fill in all required fields.');
      return;
    }

    if (!dateOfBirth) {
      setError('Date of birth is required.');
      return;
    }

    if (isFutureDate(dateOfBirth)) {
      setError('Date of birth cannot be in the future.');
      return;
    }

    if (!sex) {
      setError('Please select your sex.');
      return;
    }

    if (preferredSports.length === 0) {
      setError('Select at least one preferred sport.');
      return;
    }

    if (usernameStatus !== 'available') {
      setError('Please choose an available username.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const user = await registerUser({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        username: trimmedUsername,
        email: trimmedEmail,
        password,
        dateOfBirth: formatDateForApi(dateOfBirth),
        sex,
        preferredSports,
      });
      // No manual navigation here on purpose. Signing in flips the router guards in
      // app/_layout.tsx, which put unverified users on the verify-email screen and
      // everyone else into the tabs. Navigating manually would race with that and lose.
      await signIn(user);
    } catch (err) {
      const status = getApiErrorStatus(err);
      setError(
        getApiErrorMessage(err, 'Something went wrong. Please try again.', {
          rateLimitedFallback: 'Too many attempts. Please try again shortly.',
        })
      );

      // UX-only cooldown from backend Retry-After — not a security mechanism.
      if (status === 429) {
        const retryAfterSeconds = getRetryAfterSeconds(err);
        if (retryAfterSeconds != null) {
          setCooldownUntil(Date.now() + retryAfterSeconds * 1000);
        }
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.logoRow}>
            <Text style={styles.logoWhite}>SHOW</Text>
            <Text style={styles.logoGreen}>UP</Text>
          </View>

          <Text style={styles.tagline}>CREATE YOUR ACCOUNT</Text>

          <View style={styles.form}>
            <TextInput
              style={styles.input}
              placeholder="First name"
              placeholderTextColor="#6b7280"
              value={firstName}
              onChangeText={setFirstName}
              autoCapitalize="words"
            />
            <TextInput
              style={styles.input}
              placeholder="Last name"
              placeholderTextColor="#6b7280"
              value={lastName}
              onChangeText={setLastName}
              autoCapitalize="words"
            />

            <View>
              <TextInput
                style={styles.input}
                placeholder="Username"
                placeholderTextColor="#6b7280"
                value={username}
                onChangeText={setUsername}
                autoCapitalize="none"
                autoCorrect={false}
              />
              {usernameStatus === 'checking' ? (
                <Text style={styles.usernameHint}>Checking username…</Text>
              ) : null}
              {usernameStatus === 'available' ? (
                <Text style={styles.usernameAvailable}>Username available</Text>
              ) : null}
              {usernameStatus === 'taken' ? (
                <Text style={styles.usernameTaken}>Username not available</Text>
              ) : null}
              {usernameStatus === 'error' ? (
                <Text style={styles.usernameTaken}>Could not check username</Text>
              ) : null}
            </View>

            <TextInput
              style={styles.input}
              placeholder="Email / Gmail"
              placeholderTextColor="#6b7280"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TextInput
              style={styles.input}
              placeholder="Password"
              placeholderTextColor="#6b7280"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
            />
            <View>
              <Text style={styles.fieldLabel}>DATE OF BIRTH</Text>
              {Platform.OS === 'web' ? (
                createElement('input', {
                  type: 'date',
                  value: dateOfBirth ? formatDateForApi(dateOfBirth) : '',
                  max: formatDateForApi(MAX_DATE_OF_BIRTH),
                  min: formatDateForApi(MIN_DATE_OF_BIRTH),
                  onChange: (event: { target: { value: string } }) => {
                    const value = event.target.value;
                    if (!value) {
                      setDateOfBirth(null);
                      return;
                    }
                    const [year, month, day] = value.split('-').map(Number);
                    setDateOfBirth(new Date(year, month - 1, day));
                  },
                  style: {
                    backgroundColor: '#111827',
                    color: '#ffffff',
                    borderRadius: 10,
                    padding: '14px 16px',
                    fontSize: 16,
                    border: 'none',
                    width: '100%',
                    boxSizing: 'border-box',
                    colorScheme: 'dark',
                  },
                })
              ) : (
                <Pressable
                  accessibilityRole="button"
                  onPress={openDatePicker}
                  style={({ pressed }) => [styles.input, styles.dateField, pressed && styles.dateFieldPressed]}
                >
                  <Text style={dateOfBirth ? styles.dateValue : styles.datePlaceholder}>
                    {dateOfBirth ? formatDateForDisplay(dateOfBirth) : 'Select your date of birth'}
                  </Text>
                </Pressable>
              )}
            </View>

            <Text style={styles.fieldLabel}>SEX</Text>
            <View style={styles.chipRow}>
              {SEX_OPTIONS.map((option) => {
                const selected = sex === option;
                return (
                  <Pressable
                    key={option}
                    accessibilityRole="button"
                    onPress={() => setSex(option)}
                    style={[styles.chip, selected && styles.chipSelected]}
                  >
                    <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{option}</Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={styles.fieldLabel}>PREFERRED SPORTS</Text>
            <View style={styles.chipRow}>
              {SPORT_OPTIONS.map((sport) => {
                const selected = preferredSports.includes(sport.id);
                return (
                  <Pressable
                    key={sport.id}
                    accessibilityRole="button"
                    onPress={() => toggleSport(sport.id)}
                    style={[styles.sportChip, selected && styles.chipSelected]}
                  >
                    <View style={styles.sportChipInner}>
                      <SportIcon sportId={sport.id} size={14} color={selected ? '#0a0a0a' : '#a8ff3e'} />
                      <Text style={[styles.sportChipText, selected && styles.chipTextSelected]}>
                        {' '}{sport.label}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>

            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            <TouchableOpacity
              style={[styles.registerButton, submitDisabled && styles.buttonDisabled]}
              onPress={handleRegister}
              activeOpacity={0.85}
              disabled={submitDisabled}
            >
              {isSubmitting ? (
                <ActivityIndicator color="#1a1a2e" />
              ) : (
                <Text style={styles.registerButtonText}>SIGN UP</Text>
              )}
            </TouchableOpacity>
          </View>

          <View style={styles.loginRow}>
            <Text style={styles.loginBase}>Already have an account? </Text>
            <TouchableOpacity onPress={() => router.push('/login')}>
              <Text style={styles.loginLink}>LOG IN</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>

        {Platform.OS !== 'web' ? (
          <Modal
            visible={showDatePicker}
            transparent
            animationType="none"
            onRequestClose={closeDatePicker}
          >
            <View style={styles.modalRoot}>
              <Pressable style={styles.modalBackdropPressable} onPress={closeDatePicker}>
                <Animated.View
                  style={[styles.modalBackdrop, { opacity: backdropAnim }]}
                />
              </Pressable>
              <Animated.View
                style={[
                  styles.modalSheet,
                  {
                    transform: [
                      {
                        translateY: sheetAnim.interpolate({
                          inputRange: [0, 1],
                          outputRange: [320, 0],
                        }),
                      },
                    ],
                  },
                ]}
              >
                <View style={styles.modalHandle} />
                <Text style={styles.modalTitle}>DATE OF BIRTH</Text>
                <DateTimePicker
                  value={pickerDate}
                  mode="date"
                  display={Platform.OS === 'ios' ? 'spinner' : 'spinner'}
                  minimumDate={MIN_DATE_OF_BIRTH}
                  maximumDate={MAX_DATE_OF_BIRTH}
                  themeVariant="dark"
                  onChange={(_, selected) => {
                    if (selected) {
                      setPickerDate(selected);
                    }
                  }}
                />
                <TouchableOpacity
                  style={styles.datePickerDone}
                  onPress={confirmDatePicker}
                  activeOpacity={0.85}
                >
                  <Text style={styles.datePickerDoneText}>Done</Text>
                </TouchableOpacity>
              </Animated.View>
            </View>
          </Modal>
        ) : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#1a1a2e',
  },
  flex: {
    flex: 1,
  },
  container: {
    flexGrow: 1,
    alignItems: 'center',
    paddingHorizontal: 28,
    paddingVertical: 48,
  },
  logoRow: {
    flexDirection: 'row',
    marginBottom: 10,
  },
  logoWhite: {
    color: '#ffffff',
    fontSize: 52,
    fontWeight: '900',
  },
  logoGreen: {
    color: '#a8ff3e',
    fontSize: 52,
    fontWeight: '900',
  },
  tagline: {
    color: '#a8ff3e',
    fontSize: 11,
    letterSpacing: 4,
    marginBottom: 32,
  },
  form: {
    width: '100%',
    gap: 14,
  },
  input: {
    backgroundColor: '#111827',
    color: '#ffffff',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
  },
  dateField: {
    justifyContent: 'center',
  },
  dateFieldPressed: {
    opacity: 0.85,
  },
  dateValue: {
    color: '#ffffff',
    fontSize: 16,
  },
  datePlaceholder: {
    color: '#6b7280',
    fontSize: 16,
  },
  modalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalBackdropPressable: {
    ...StyleSheet.absoluteFillObject,
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
  },
  modalSheet: {
    backgroundColor: '#111827',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderTopColor: '#2d2d4e',
    borderTopWidth: 1,
    paddingBottom: Platform.OS === 'ios' ? 28 : 16,
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  modalHandle: {
    alignSelf: 'center',
    backgroundColor: '#2d2d4e',
    borderRadius: 3,
    height: 4,
    marginBottom: 12,
    width: 42,
  },
  modalTitle: {
    color: '#a8ff3e',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 2,
    marginBottom: 4,
    textAlign: 'center',
  },
  datePickerDone: {
    alignItems: 'center',
    borderTopColor: '#2d2d4e',
    borderTopWidth: 1,
    paddingVertical: 12,
  },
  datePickerDoneText: {
    color: '#a8ff3e',
    fontSize: 16,
    fontWeight: '700',
  },
  fieldLabel: {
    color: '#a8ff3e',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 2,
    marginTop: 4,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    borderWidth: 1,
    borderColor: '#2d2d4e',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: '#111827',
  },
  sportChip: {
    borderWidth: 1,
    borderColor: '#2d2d4e',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#111827',
  },
  sportChipInner: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  chipSelected: {
    borderColor: '#a8ff3e',
    backgroundColor: 'rgba(168, 255, 62, 0.12)',
  },
  chipText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
  },
  sportChipText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
  },
  chipTextSelected: {
    color: '#a8ff3e',
  },
  usernameHint: {
    color: '#8a8aa0',
    fontSize: 12,
    marginTop: 6,
    marginLeft: 4,
  },
  usernameAvailable: {
    color: '#a8ff3e',
    fontSize: 12,
    marginTop: 6,
    marginLeft: 4,
    fontWeight: '600',
  },
  usernameTaken: {
    color: '#ff6b6b',
    fontSize: 12,
    marginTop: 6,
    marginLeft: 4,
    fontWeight: '600',
  },
  errorText: {
    color: '#ff6b6b',
    fontSize: 13,
    textAlign: 'center',
  },
  registerButton: {
    backgroundColor: '#a8ff3e',
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  registerButtonText: {
    color: '#1a1a2e',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 2,
  },
  loginRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 32,
  },
  loginBase: {
    color: '#9ca3af',
    fontSize: 14,
  },
  loginLink: {
    color: '#a8ff3e',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 1,
  },
});
