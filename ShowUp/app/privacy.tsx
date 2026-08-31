import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, SafeAreaView, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';

export default function PrivacyScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor="#1a1a2e" />
      <View style={styles.backRow}>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
        >
          <Ionicons name="arrow-back" size={20} color="#ffffff" />
        </Pressable>
        <Text style={styles.title}>Privacy</Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.intro}>
          ShowUp is built around showing up — and we only collect what we need to make that work.
          Here is what we store and why.
        </Text>

        <Section title="Profile information">
          <Body>
            When you create an account we collect your name, username, email address, the sports you
            play, and your self-reported skill level. This information is used to match you with
            other players and display your public profile.
          </Body>
        </Section>

        <Section title="Location">
          <Body>
            ShowUp uses your device location in two situations: to surface nearby events when you
            browse the map, and to verify your physical attendance at an event via GPS check-in.
            Location is requested only when you actively use these features and is not stored
            persistently on our servers beyond what is needed to validate a check-in.
          </Body>
        </Section>

        <Section title="Event and game history">
          <Body>
            We keep a record of the events you have hosted, joined, and attended. This powers your
            profile portfolio, reliability score, and game history. Other players can see your
            public stats (games played, hosted, upcoming) and reliability tier on your profile.
          </Body>
        </Section>

        <Section title="Push notification tokens">
          <Body>
            If you grant notification permission, ShowUp stores an Expo push token linked to your
            account so we can send you reminders and updates about your games. Tokens are
            device-specific and are refreshed automatically by Expo.
          </Body>
        </Section>

        <Section title="Your choices">
          <Body>
            You can mute all push notifications at any time from{' '}
            <Text style={styles.accent}>Account › Notifications</Text> in your profile. This is a
            device-level mute — no server changes required.{'\n\n'}To request deletion of your
            account and associated data, contact us at{' '}
            {/* TODO: replace with real support inbox before shipping */}
            <Text style={styles.accent}>support@showup.app</Text>.
          </Body>
        </Section>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title.toUpperCase()}</Text>
      {children}
    </View>
  );
}

function Body({ children }: { children: React.ReactNode }) {
  return <Text style={styles.body}>{children}</Text>;
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#1a1a2e',
  },
  backRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
    gap: 12,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 4,
  },
  intro: {
    color: '#9ca3af',
    fontSize: 14,
    lineHeight: 22,
    marginBottom: 24,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    color: '#a8ff3e',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.5,
    marginBottom: 8,
  },
  body: {
    color: '#d1d5db',
    fontSize: 14,
    lineHeight: 22,
  },
  accent: {
    color: '#a8ff3e',
    fontWeight: '600',
  },
  pressed: {
    opacity: 0.75,
  },
});
