import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import * as Notifications from 'expo-notifications';

import { SessionProvider, useSession } from '@/src/auth';
import { InvitationPopup } from '@/src/features/invitations/InvitationPopup';

export default function RootLayout() {
  return (
    <SessionProvider>
      <RootNavigator />
    </SessionProvider>
  );
}

function RootNavigator() {
  const { user, isLoading } = useSession();
  const router = useRouter();
  const [pendingEventId, setPendingEventId] = useState<string | null>(null);
  const handledResponseId = useRef<string | null>(null);

  useEffect(() => {
    if (!user?.id || Platform.OS === 'web') return;
    import('@/src/notificationPreferences').then(({ getNotificationsMuted }) =>
      getNotificationsMuted()
    ).then((muted) => {
      if (muted) return;
      import('@/src/notifications').then(({ registerForPushNotifications }) => {
        registerForPushNotifications(user.id);
      });
    });
  }, [user?.id]);

  // Cold-start: handle notification that launched the app from a killed state.
  // Guard with a ref so subsequent launches don't re-navigate on a stale response.
  // Native-only — expo-notifications cold-start APIs are unavailable on web.
  useEffect(() => {
    if (Platform.OS === 'web') return;
    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (!response) return;
      const notifId = response.notification.request.identifier;
      if (handledResponseId.current === notifId) return;
      const eventId = response.notification.request.content.data?.eventId;
      if (eventId) {
        handledResponseId.current = notifId;
        setPendingEventId(String(eventId));
      }
    });
  }, []);

  // Foreground / background: listen for notification taps while the app is running.
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const notifId = response.notification.request.identifier;
      if (handledResponseId.current === notifId) return;
      const eventId = response.notification.request.content.data?.eventId;
      if (eventId) {
        handledResponseId.current = notifId;
        setPendingEventId(String(eventId));
      }
    });
    return () => sub.remove();
  }, []);

  // Treat undefined as unverified so old sessions (where the field didn't exist)
  // also go through the verification flow rather than silently bypassing it.
  const needsEmailVerification = !!user && !user.isEmailVerified;

  // Navigate once auth has resolved and a pending deep-link is waiting.
  // Never navigates before user is known, satisfying the auth guard.
  useEffect(() => {
    // Don't deep-link an unverified user into a screen that isn't mounted for them.
    if (!pendingEventId || !user || needsEmailVerification) return;
    router.push({ pathname: '/event/[id]', params: { id: pendingEventId } });
    setPendingEventId(null);
  }, [pendingEventId, user, needsEmailVerification, router]);

  if (isLoading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color="#a8ff3e" size="large" />
      </View>
    );
  }

  return (
    <>
      <Stack screenOptions={{ headerShown: false }}>
        {/*
          Signed in but unverified: the code screen is the ONLY screen that exists.
          Enforcing it here rather than by navigating avoids a race — when `user` flips
          from null to set, the router redirects to the new group's first screen, which
          would override any router.replace() a screen had just issued.
        */}
        <Stack.Protected guard={needsEmailVerification}>
          <Stack.Screen name="verify-email" />
        </Stack.Protected>

        <Stack.Protected guard={!!user && !needsEmailVerification}>
          <Stack.Screen name="index" />
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="event/[id]" />
          <Stack.Screen name="chat/[connectionId]" />
          <Stack.Screen name="create-form" />
          <Stack.Screen name="notification-settings" />
          <Stack.Screen name="privacy" />
        </Stack.Protected>

        <Stack.Protected guard={!user}>
          <Stack.Screen name="login" />
          <Stack.Screen name="register" />
        </Stack.Protected>
      </Stack>

      {user && !needsEmailVerification ? <InvitationPopup /> : null}
    </>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1a1a2e',
  },
});
