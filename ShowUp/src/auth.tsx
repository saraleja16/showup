import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, PropsWithChildren, use, useCallback, useEffect, useMemo, useState } from 'react';

import type { User } from '@/src/api';
import { setApiAccessToken, setApiUnauthorizedHandler } from '@/src/api';

const STORAGE_KEY = '@showup/user';

type AuthContextValue = {
  isLoading: boolean;
  user: User | null;
  accessToken: string | null;
  signIn: (user: User) => Promise<void>;
  signOut: () => Promise<void>;
  updateUser: (patch: Partial<User>) => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function SessionProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const accessToken = user?.accessToken?.trim() ? user.accessToken.trim() : null;

  const signOut = useCallback(async () => {
    setApiAccessToken(null);
    await AsyncStorage.removeItem(STORAGE_KEY);
    setUser(null);
  }, []);

  useEffect(() => {
    // TODO(M-1): Implement token refresh before signing out.
    // When the backend exposes POST /auth/refresh, attempt a refresh here; only call
    // signOut() if the refresh itself returns 401. This avoids silently kicking users
    // mid-session when their access token expires.
    setApiUnauthorizedHandler(() => {
      void signOut();
    });
    return () => setApiUnauthorizedHandler(null);
  }, [signOut]);

  useEffect(() => {
    let cancelled = false;

    async function restoreSession() {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (!cancelled && stored) {
          const parsed = JSON.parse(stored) as User;
          setApiAccessToken(parsed.accessToken ?? null);
          setUser(parsed);
        }
      } catch {
        if (!cancelled) {
          setApiAccessToken(null);
          setUser(null);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    restoreSession();

    return () => {
      cancelled = true;
    };
  }, []);

  const signIn = useCallback(async (nextUser: User) => {
    setApiAccessToken(nextUser.accessToken ?? null);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(nextUser));
    setUser(nextUser);
  }, []);

  const updateUser = useCallback(async (patch: Partial<User>) => {
    if (!user) return;
    const next = { ...user, ...patch };
    if (patch.accessToken !== undefined) {
      setApiAccessToken(patch.accessToken ?? null);
    }
    setUser(next);
    // Await the write so callers know if persistence failed. If this throws,
    // in-memory state is already updated — the caller can decide whether to retry.
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }, [user]);

  const value = useMemo<AuthContextValue>(
    () => ({
      isLoading,
      user,
      accessToken,
      signIn,
      signOut,
      updateUser,
    }),
    [isLoading, user, accessToken, signIn, signOut, updateUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useSession() {
  const value = use(AuthContext);

  if (!value) {
    throw new Error('useSession must be used within a SessionProvider');
  }

  return value;
}
