import { ResponseType } from 'expo-auth-session';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useEffect, useMemo, useState } from 'react';

WebBrowser.maybeCompleteAuthSession();

const GOOGLE_WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? '';
const GOOGLE_SCOPES = ['openid', 'profile', 'email'];

type GoogleProfile = {
  sub?: string;
  name?: string;
  given_name?: string;
  family_name?: string;
  picture?: string;
  email?: string;
  email_verified?: boolean;
};

type GoogleAuthError = Error | null;

function decodeBase64Url(value: string): string {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');

  return decodeURIComponent(
    atob(padded)
      .split('')
      .map((char) => `%${char.charCodeAt(0).toString(16).padStart(2, '0')}`)
      .join('')
  );
}

function decodeGoogleProfile(idToken: string): GoogleProfile | null {
  const [, payload] = idToken.split('.');
  if (!payload) return null;

  try {
    return JSON.parse(decodeBase64Url(payload)) as GoogleProfile;
  } catch (err) {
    console.log('[GoogleAuth] Failed to decode profile from id_token', err);
    return null;
  }
}

export function useGoogleAuth() {
  const [user, setUser] = useState<GoogleProfile | null>(null);
  const [idToken, setIdToken] = useState<string | null>(null);
  const [error, setError] = useState<GoogleAuthError>(null);
  const [loading, setLoading] = useState(false);

  const requestConfig = useMemo(
    () => ({
      clientId: GOOGLE_WEB_CLIENT_ID,
      webClientId: GOOGLE_WEB_CLIENT_ID,
      responseType: ResponseType.IdToken,
      scopes: GOOGLE_SCOPES,
    }),
    []
  );

  if (__DEV__) console.log('[GoogleAuth] Client ID', GOOGLE_WEB_CLIENT_ID);

  const [request, response, promptAsync] = Google.useAuthRequest(requestConfig);

  useEffect(() => {
    if (!response) return;

    setLoading(false);
    console.log('[GoogleAuth] authentication response', response);

    if (response.type === 'success') {
      const nextIdToken = response.params.id_token ?? response.authentication?.idToken ?? null;
      setIdToken(nextIdToken);

      if (!nextIdToken) {
        const nextError = new Error('Google did not return an id_token.');
        setError(nextError);
        console.log('[GoogleAuth] error', nextError);
        return;
      }

      const profile = decodeGoogleProfile(nextIdToken);
      setUser(profile);
      setError(null);

      if (__DEV__) console.log('[GoogleAuth] id_token', nextIdToken);
      if (__DEV__) console.log('[GoogleAuth] user name', profile?.name);
      if (__DEV__) console.log('[GoogleAuth] user email', profile?.email);
      return;
    }

    if (response.type === 'error') {
      const nextError = new Error(response.error?.message ?? response.errorCode ?? 'Google auth failed.');
      setError(nextError);
      console.log('[GoogleAuth] error', response.error ?? response.params);
      return;
    }

    if (response.type === 'cancel' || response.type === 'dismiss') {
      setError(null);
    }
  }, [response]);

  const signIn = useCallback(async () => {
    if (!GOOGLE_WEB_CLIENT_ID) {
      const nextError = new Error('EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID is not configured.');
      setError(nextError);
      console.log('[GoogleAuth] error', nextError);
      return;
    }

    if (!request) {
      const nextError = new Error('Google auth request is not ready.');
      setError(nextError);
      console.log('[GoogleAuth] error', nextError);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await promptAsync();
      if (result.type !== 'success') {
        setLoading(false);
      }
    } catch (err) {
      const nextError = err instanceof Error ? err : new Error('Google auth failed.');
      setLoading(false);
      setError(nextError);
      console.log('[GoogleAuth] error', err);
    }
  }, [promptAsync, request]);

  return {
    signIn,
    user,
    loading,
    error,
    idToken,
  };
}
