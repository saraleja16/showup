import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import {
  getApiErrorMessage,
  getMyConnections,
  unmatchConnection,
  type Connection,
} from '@/src/api';
import { colors, radii, spacing, typography } from '@/src/constants/theme';
import { MatchRequestsView, type RequestTab } from '@/src/features/match/MatchRequestsView';

type Props = {
  visible: boolean;
  onClose: () => void;
  userId: string | null;
  onMutualMatch?: (name: string, connectionId: string | null) => void;
};

const REQUEST_TABS: { id: RequestTab; label: string }[] = [
  { id: 'sent', label: 'Sent' },
  { id: 'incoming', label: 'Incoming' },
];

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase() || '?';
}

export function MatchesListModal({ visible, onClose, userId, onMutualMatch }: Props) {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unmatchingId, setUnmatchingId] = useState<string | null>(null);
  const [requestTab, setRequestTab] = useState<RequestTab>('incoming');
  const [requestsRefreshToken, setRequestsRefreshToken] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const items = await getMyConnections();
      setConnections(items);
    } catch (err) {
      setError(getApiErrorMessage(err, 'Could not load your matches.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (visible) void load();
  }, [visible, load]);

  useEffect(() => {
    // MatchRequestsView stays mounted while the modal is hidden, so its own
    // focus-based refresh won't fire on re-open — bump this to force a refetch
    // every time the modal becomes visible.
    if (visible) setRequestsRefreshToken((n) => n + 1);
  }, [visible]);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  function showToast(message: string) {
    setToast(message);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 2500);
  }

  function handleMutualMatch(name: string, connectionId: string | null) {
    // A request-tab accept just created a real Connection — refresh so it shows up
    // in the matched-profiles list above immediately.
    void load();
    onMutualMatch?.(name, connectionId);
  }

  function confirmUnmatch(connection: Connection) {
    Alert.alert(
      'Cancel match',
      `Unmatch with ${connection.displayName}? This will also delete your chat history with them.`,
      [
        { text: 'Keep match', style: 'cancel' },
        {
          text: 'Unmatch',
          style: 'destructive',
          onPress: () => void handleUnmatch(connection),
        },
      ]
    );
  }

  async function handleUnmatch(connection: Connection) {
    setUnmatchingId(connection.connectionId);
    try {
      await unmatchConnection(connection.connectionId);
      setConnections((prev) => prev.filter((c) => c.connectionId !== connection.connectionId));
    } catch (err) {
      Alert.alert('Could not unmatch', getApiErrorMessage(err, 'Please try again.'));
    } finally {
      setUnmatchingId(null);
    }
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      {/* RN's <Modal> renders into its own native root, so the app-level
          SafeAreaProvider (mounted by expo-router / react-navigation) never
          reaches it — without this, useSafeAreaInsets()/SafeAreaView here
          would silently resolve to zero and the header would sit under the
          status bar / notch, which also blocks touches on the close button. */}
      <SafeAreaProvider>
        <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
          <View style={styles.header}>
            <Text style={styles.title}>Your matches</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close matches list"
              onPress={onClose}
              hitSlop={16}
              style={({ pressed }) => [styles.closeBtn, pressed && styles.pressed]}
            >
              <Ionicons name="close" size={22} color={colors.textPrimary} />
            </Pressable>
          </View>

          {toast ? (
            <View style={styles.toast} accessibilityLiveRegion="polite">
              <Text style={styles.toastText}>{toast}</Text>
            </View>
          ) : null}

          <ScrollView
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {loading ? (
              <View style={styles.stateBlockInline}>
                <ActivityIndicator color={colors.accent} size="large" />
              </View>
            ) : error ? (
              <View style={styles.stateBlockInline}>
                <Text style={styles.stateText}>{error}</Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => void load()}
                  style={({ pressed }) => [styles.retryBtn, pressed && styles.pressed]}
                >
                  <Text style={styles.retryText}>Retry</Text>
                </Pressable>
              </View>
            ) : connections.length === 0 ? (
              <View style={styles.stateBlockInline}>
                <Ionicons name="heart-outline" size={28} color={colors.textMuted} />
                <Text style={styles.stateText}>
                  No matches yet. Swipe or use Discovery to connect with players.
                </Text>
              </View>
            ) : (
              <View style={styles.list}>
                {connections.map((connection) => (
                  <MatchRow
                    key={connection.connectionId}
                    connection={connection}
                    busy={unmatchingId === connection.connectionId}
                    onUnmatch={() => confirmUnmatch(connection)}
                  />
                ))}
              </View>
            )}

            <View style={styles.divider} />

            <View style={styles.requestRow}>
              {REQUEST_TABS.map((tab) => {
                const active = requestTab === tab.id;
                return (
                  <Pressable
                    key={tab.id}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    onPress={() => setRequestTab(tab.id)}
                    style={[styles.requestPill, active && styles.requestPillActive]}
                  >
                    <Text
                      style={[styles.requestPillText, active && styles.requestPillTextActive]}
                      numberOfLines={1}
                    >
                      {tab.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {userId ? (
              <MatchRequestsView
                userId={userId}
                activeTab={requestTab}
                onTabChange={setRequestTab}
                onToast={showToast}
                onMutualMatch={handleMutualMatch}
                refreshToken={requestsRefreshToken}
                embedded
              />
            ) : null}
          </ScrollView>
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}

function MatchRow({
  connection,
  busy,
  onUnmatch,
}: {
  connection: Connection;
  busy: boolean;
  onUnmatch: () => void;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const initials = getInitials(connection.displayName);
  const showImage = Boolean(connection.profileImageUrl) && !imageFailed;

  return (
    <View style={styles.row}>
      <View style={styles.avatar}>
        {showImage ? (
          <Image
            source={{ uri: connection.profileImageUrl! }}
            style={styles.avatarImage}
            contentFit="cover"
            onError={() => setImageFailed(true)}
          />
        ) : (
          <Text style={styles.avatarInitials}>{initials}</Text>
        )}
      </View>

      <View style={styles.rowBody}>
        <Text style={styles.rowName} numberOfLines={1}>{connection.displayName}</Text>
        {connection.skillLevel ? (
          <Text style={styles.rowMeta} numberOfLines={1}>{connection.skillLevel}</Text>
        ) : null}
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Unmatch ${connection.displayName}`}
        disabled={busy}
        onPress={onUnmatch}
        style={({ pressed }) => [styles.unmatchBtn, (pressed || busy) && styles.pressed]}
      >
        {busy ? (
          <ActivityIndicator color={colors.textSecondary} size="small" />
        ) : (
          <Text style={styles.unmatchText}>Unmatch</Text>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: {
    backgroundColor: colors.background,
    flex: 1,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
  },
  title: {
    color: colors.textPrimary,
    fontSize: 22,
    fontWeight: '900',
  },
  closeBtn: {
    alignItems: 'center',
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  scrollContent: {
    paddingBottom: spacing.xxxl,
  },
  stateBlockInline: {
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.xxl,
    paddingVertical: spacing.xxl,
  },
  stateText: {
    color: colors.textSecondary,
    textAlign: 'center',
    ...typography.body,
  },
  retryBtn: {
    borderColor: colors.borderStrong,
    borderRadius: radii.pill,
    borderWidth: 1,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  retryText: {
    color: colors.accent,
    ...typography.small,
    fontWeight: '800',
  },
  list: {
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.lg,
  },
  divider: {
    borderTopColor: colors.border,
    borderTopWidth: 1,
    marginHorizontal: spacing.xl,
    marginBottom: spacing.lg,
  },
  requestRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.xl,
  },
  requestPill: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: 'rgba(168, 255, 62, 0.28)',
    borderRadius: radii.pill,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    paddingVertical: spacing.sm,
  },
  requestPillActive: {
    backgroundColor: 'rgba(168, 255, 62, 0.14)',
    borderColor: colors.accent,
  },
  requestPillText: {
    color: colors.textSecondary,
    ...typography.small,
    fontWeight: '700',
  },
  requestPillTextActive: {
    color: colors.accent,
    fontWeight: '800',
  },
  toast: {
    alignSelf: 'center',
    backgroundColor: colors.surfaceElevated,
    borderColor: colors.borderStrong,
    borderRadius: radii.pill,
    borderWidth: 1,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  toastText: {
    color: colors.textPrimary,
    ...typography.small,
    fontWeight: '700',
  },
  row: {
    alignItems: 'center',
    backgroundColor: colors.surfaceElevated,
    borderColor: colors.border,
    borderRadius: radii.lg,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.md,
  },
  avatar: {
    alignItems: 'center',
    backgroundColor: colors.accentSoft,
    borderRadius: 24,
    height: 48,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 48,
  },
  avatarImage: {
    height: '100%',
    width: '100%',
  },
  avatarInitials: {
    color: colors.accent,
    fontSize: 16,
    fontWeight: '800',
  },
  rowBody: {
    flex: 1,
    gap: 2,
  },
  rowName: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '800',
  },
  rowMeta: {
    color: colors.textMuted,
    ...typography.small,
  },
  unmatchBtn: {
    alignItems: 'center',
    borderColor: colors.borderStrong,
    borderRadius: radii.pill,
    borderWidth: 1,
    justifyContent: 'center',
    minWidth: 84,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  unmatchText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '800',
  },
  pressed: {
    opacity: 0.8,
  },
});
