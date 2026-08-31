import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  NativeSyntheticEvent,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TextInputKeyPressEventData,
  TouchableOpacity,
  View,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';

import { getApiErrorMessage, sendVerificationCode, verifyEmail } from '@/src/api';
import { useSession } from '@/src/auth';

const CODE_LENGTH = 6;
const RESEND_COOLDOWN_SECONDS = 60;

export default function VerifyEmailScreen() {
  const { user, signIn, signOut } = useSession();
  const params = useLocalSearchParams<{ email?: string }>();
  const [isSigningOut, setIsSigningOut] = useState(false);

  const email = useMemo(
    () => (params.email ?? user?.email ?? '').trim(),
    [params.email, user?.email]
  );

  const [digits, setDigits] = useState<string[]>(() => Array(CODE_LENGTH).fill(''));
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_SECONDS);

  const inputRefs = useRef<(TextInput | null)[]>([]);
  // Guards against the auto-submit effect firing twice for the same code.
  const submittedCodeRef = useRef<string | null>(null);

  const code = digits.join('');

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const handleSubmit = useCallback(
    async (submittedCode: string) => {
      if (submittedCode.length !== CODE_LENGTH || isSubmitting) return;

      setIsSubmitting(true);
      setError(null);
      setNotice(null);

      try {
        const verified = await verifyEmail(email, submittedCode);
        // Response carries a fresh access token, so replace the whole session user.
        // No navigation needed: isEmailVerified flips to true, the router guards in
        // app/_layout.tsx notice, and the tabs become reachable on their own.
        await signIn(verified);
      } catch (err) {
        submittedCodeRef.current = null;
        setError(getApiErrorMessage(err, "That code isn't right. Check it and try again."));
        setDigits(Array(CODE_LENGTH).fill(''));
        inputRefs.current[0]?.focus();
      } finally {
        setIsSubmitting(false);
      }
    },
    [email, isSubmitting, signIn]
  );

  // Auto-submit as soon as all six boxes are filled.
  useEffect(() => {
    if (code.length !== CODE_LENGTH) return;
    if (submittedCodeRef.current === code) return;
    submittedCodeRef.current = code;
    void handleSubmit(code);
  }, [code, handleSubmit]);

  function handleChangeDigit(index: number, value: string) {
    const cleaned = value.replace(/\D/g, '');
    if (!cleaned) {
      setDigits((prev) => {
        const next = [...prev];
        next[index] = '';
        return next;
      });
      return;
    }

    setDigits((prev) => {
      const next = [...prev];
      // Handles paste / autofill of the whole code into one box.
      for (let i = 0; i < cleaned.length && index + i < CODE_LENGTH; i += 1) {
        next[index + i] = cleaned[i];
      }
      return next;
    });

    const nextIndex = Math.min(index + cleaned.length, CODE_LENGTH - 1);
    inputRefs.current[nextIndex]?.focus();
  }

  function handleKeyPress(index: number, event: NativeSyntheticEvent<TextInputKeyPressEventData>) {
    if (event.nativeEvent.key !== 'Backspace') return;
    if (digits[index]) return;
    // Empty box: step back and clear the previous one.
    if (index > 0) {
      setDigits((prev) => {
        const next = [...prev];
        next[index - 1] = '';
        return next;
      });
      inputRefs.current[index - 1]?.focus();
    }
  }

  async function handleResend() {
    if (cooldown > 0 || isResending) return;

    setIsResending(true);
    setError(null);
    setNotice(null);

    try {
      await sendVerificationCode(email);
      setDigits(Array(CODE_LENGTH).fill(''));
      submittedCodeRef.current = null;
      setNotice('New code sent. Check your inbox.');
      setCooldown(RESEND_COOLDOWN_SECONDS);
      inputRefs.current[0]?.focus();
    } catch (err) {
      setError(getApiErrorMessage(err, 'Could not send a new code. Try again shortly.'));
      // A 429 means the server-side window is longer than our cooldown.
      setCooldown(RESEND_COOLDOWN_SECONDS);
    } finally {
      setIsResending(false);
    }
  }

  async function handleStartOver() {
    if (isSigningOut) return;
    // Wrong/unreachable email with no way to fix it in place — clear the pending
    // unverified session so the root layout's auth guard drops back to Register.
    setIsSigningOut(true);
    try {
      await signOut();
    } finally {
      setIsSigningOut(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <View style={styles.logoRow}>
            <Text style={styles.logoWhite}>SHOW</Text>
            <Text style={styles.logoGreen}>UP</Text>
          </View>

          <Text style={styles.heading}>CHECK YOUR EMAIL</Text>
          <Text style={styles.subheading}>
            We sent a 6-digit code to{'\n'}
            <Text style={styles.emailText}>{email}</Text>
          </Text>

          <Text style={styles.spamHint}>Can&apos;t find it? Check your spam folder.</Text>

          <View style={styles.codeRow}>
            {digits.map((digit, index) => (
              <TextInput
                key={index}
                ref={(el) => {
                  inputRefs.current[index] = el;
                }}
                style={[styles.codeBox, digit ? styles.codeBoxFilled : null]}
                value={digit}
                onChangeText={(value) => handleChangeDigit(index, value)}
                onKeyPress={(event) => handleKeyPress(index, event)}
                keyboardType="number-pad"
                maxLength={CODE_LENGTH}
                selectTextOnFocus
                autoFocus={index === 0}
                editable={!isSubmitting}
                textContentType="oneTimeCode"
                autoComplete="one-time-code"
              />
            ))}
          </View>

          {isSubmitting ? <ActivityIndicator color="#a8ff3e" style={styles.spinner} /> : null}
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
          {notice ? <Text style={styles.noticeText}>{notice}</Text> : null}

          <TouchableOpacity
            style={[styles.verifyButton, (isSubmitting || code.length < CODE_LENGTH) && styles.buttonDisabled]}
            onPress={() => handleSubmit(code)}
            activeOpacity={0.85}
            disabled={isSubmitting || code.length < CODE_LENGTH}
          >
            <Text style={styles.verifyButtonText}>VERIFY</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleResend}
            disabled={cooldown > 0 || isResending}
            style={styles.resendRow}
          >
            {isResending ? (
              <ActivityIndicator color="#a8ff3e" />
            ) : (
              <Text style={cooldown > 0 ? styles.resendDisabled : styles.resendLink}>
                {cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
              </Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleStartOver}
            disabled={isSigningOut}
            style={styles.startOverRow}
          >
            {isSigningOut ? (
              <ActivityIndicator color="#6b7280" />
            ) : (
              <Text style={styles.startOverLink}>Wrong email? Start over</Text>
            )}
          </TouchableOpacity>

        </ScrollView>
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
    justifyContent: 'center',
    paddingHorizontal: 28,
    paddingVertical: 48,
  },
  logoRow: {
    flexDirection: 'row',
    marginBottom: 32,
  },
  logoWhite: {
    color: '#ffffff',
    fontSize: 40,
    fontWeight: '900',
  },
  logoGreen: {
    color: '#a8ff3e',
    fontSize: 40,
    fontWeight: '900',
  },
  heading: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: 2,
    marginBottom: 12,
  },
  subheading: {
    color: '#9ca3af',
    fontSize: 14,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: 8,
  },
  spamHint: {
    color: '#6b7280',
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 28,
  },
  emailText: {
    color: '#ffffff',
    fontWeight: '700',
  },
  codeRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 20,
  },
  codeBox: {
    width: 46,
    height: 58,
    backgroundColor: '#111827',
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: 'transparent',
    color: '#ffffff',
    fontSize: 24,
    fontWeight: '800',
    textAlign: 'center',
  },
  codeBoxFilled: {
    borderColor: '#a8ff3e',
  },
  spinner: {
    marginBottom: 12,
  },
  errorText: {
    color: '#ff6b6b',
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 12,
  },
  noticeText: {
    color: '#a8ff3e',
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 12,
  },
  verifyButton: {
    width: '100%',
    backgroundColor: '#a8ff3e',
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  verifyButtonText: {
    color: '#1a1a2e',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 2,
  },
  resendRow: {
    marginTop: 24,
    minHeight: 22,
    justifyContent: 'center',
  },
  resendLink: {
    color: '#a8ff3e',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 1,
  },
  resendDisabled: {
    color: '#6b7280',
    fontSize: 14,
    fontWeight: '600',
  },
  startOverRow: {
    marginTop: 16,
    minHeight: 22,
    justifyContent: 'center',
  },
  startOverLink: {
    color: '#6b7280',
    fontSize: 13,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
});
