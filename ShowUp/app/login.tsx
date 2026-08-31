import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';

import { getApiErrorMessage, getApiErrorStatus, getRetryAfterSeconds, googleLogin, loginUser } from '@/src/api';
import { useSession } from '@/src/auth';
import { useGoogleAuth } from '@/src/hooks/useGoogleAuth';

export default function LoginScreen() {
  const router = useRouter();
  const { signIn: signInSession } = useSession();
  const {
    signIn: signInWithGoogle,
    user: googleUser,
    loading: googleLoading,
    error: googleError,
    idToken,
  } = useGoogleAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [cooldownUntil, setCooldownUntil] = useState<number | null>(null);
  const [cooldownSecondsLeft, setCooldownSecondsLeft] = useState(0);
  const handledGoogleTokenRef = useRef<string | null>(null);

  useEffect(() => {
    if (!googleUser || !idToken) return;
    if (handledGoogleTokenRef.current === idToken) return;
    handledGoogleTokenRef.current = idToken;
    const googleIdToken = idToken;

    async function handleGoogleLogin() {
      try {
        const user = await googleLogin({ idToken: googleIdToken });
        if (!user.accessToken) {
          throw new Error('Google login did not return an access token.');
        }

        await signInSession(user);
        router.replace('/(tabs)');
      } catch (err) {
        handledGoogleTokenRef.current = null;
        const message = getApiErrorMessage(err, 'Could not complete Google sign-in.');
        Alert.alert(
          'Google sign-in failed',
          message === 'No account exists for this Google email'
            ? 'This Google account is not registered in ShowUp yet. Please create an account first.'
            : message
        );
      }
    }

    void handleGoogleLogin();
  }, [googleUser, idToken, router, signInSession]);

  useEffect(() => {
    if (!googleError) return;

    Alert.alert('Google sign-in failed', googleError.message || 'Please try again.');
  }, [googleError]);


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

  async function handleLogin() {
    if (submitDisabled) return;

    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      setError('Email and password are required.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const user = await loginUser({ email: trimmedEmail, password });
      await signInSession(user);
      router.replace('/(tabs)');
    } catch (err) {
      const status = getApiErrorStatus(err);
      const message = getApiErrorMessage(err, 'Invalid email or password.', {
        rateLimitedFallback: 'Too many login attempts. Please try again shortly.',
      });
      setError(message);

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

          <Text style={styles.tagline}>FIND YOUR GAME. SHOW UP.</Text>

          <View style={styles.form}>
            <TextInput
              style={styles.input}
              placeholder="Email"
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

            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            <TouchableOpacity
              style={[styles.loginButton, submitDisabled && styles.buttonDisabled]}
              onPress={handleLogin}
              activeOpacity={0.85}
              disabled={submitDisabled}
            >
              {isSubmitting ? (
                <ActivityIndicator color="#1a1a2e" />
              ) : (
                <Text style={styles.loginButtonText}>
                  {isCoolingDown ? `WAIT ${cooldownSecondsLeft}s` : 'LOG IN'}
                </Text>
              )}
            </TouchableOpacity>

            <View style={styles.dividerRow}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>OR</Text>
              <View style={styles.dividerLine} />
            </View>

            <TouchableOpacity
              style={[styles.googleButton, googleLoading && styles.buttonDisabled]}
              activeOpacity={0.85}
              disabled={googleLoading}
              onPress={() => {
                void signInWithGoogle();
              }}
            >
              {googleLoading ? (
                <ActivityIndicator color="#a8ff3e" />
              ) : (
                <Text style={styles.googleButtonText}>Continue with Google</Text>
              )}
            </TouchableOpacity>
          </View>

          <View style={styles.signUpRow}>
            <Text style={styles.signUpBase}>New to ShowUp? </Text>
            <TouchableOpacity onPress={() => router.push('/register')}>
              <Text style={styles.signUpLink}>SIGN UP</Text>
            </TouchableOpacity>
          </View>
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
    marginBottom: 48,
  },
  form: {
    width: '100%',
    gap: 16,
  },
  input: {
    backgroundColor: '#111827',
    color: '#ffffff',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
  },
  errorText: {
    color: '#ff6b6b',
    fontSize: 13,
    textAlign: 'center',
  },
  loginButton: {
    backgroundColor: '#a8ff3e',
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  loginButtonText: {
    color: '#1a1a2e',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 2,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#2d2d4e',
  },
  dividerText: {
    color: '#6b7280',
    fontSize: 13,
    fontWeight: '600',
  },
  googleButton: {
    borderWidth: 1.5,
    borderColor: '#a8ff3e',
    borderRadius: 10,
    paddingVertical: 15,
    alignItems: 'center',
  },
  googleButtonText: {
    color: '#a8ff3e',
    fontSize: 15,
    fontWeight: '600',
  },
  signUpRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 40,
  },
  signUpBase: {
    color: '#9ca3af',
    fontSize: 14,
  },
  signUpLink: {
    color: '#a8ff3e',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 1,
  },
});
