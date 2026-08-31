import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getApiErrorMessage, getConversations, type Conversation } from '@/src/api';
import { colors, radii, spacing, typography } from '@/src/constants/theme';

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase() || '?';
}

function formatRelativeTime(iso: string): string {
  const date = new Date(iso);
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'now';
  if (diffMin < 60) return `${diffMin}m`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d`;
  return date.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
}

export default function ChatScreen() {
  const router = useRouter();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (isRefresh: boolean) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const items = await getConversations();
      setConversations(items);
    } catch (err) {
      setError(getApiErrorMessage(err, 'Could not load your conversations.'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load(false);
    }, [load])
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <StatusBar barStyle="light-content" backgroundColor={colors.background} />

      <View style={styles.header}>
        <Text style={styles.title}>Chat</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void load(true)}
            tintColor={colors.accent}
            colors={[colors.accent]}
          />
        }
      >
        {loading ? (
          <View style={styles.stateBlock}>
            <ActivityIndicator color={colors.accent} size="large" />
          </View>
        ) : error ? (
          <View style={styles.stateBlock}>
            <Text style={styles.stateText}>{error}</Text>
          </View>
        ) : conversations.length === 0 ? (
          <View style={styles.stateBlock}>
            <Ionicons name="chatbubbles-outline" size={32} color={colors.textMuted} />
            <Text style={styles.stateTitle}>No conversations yet</Text>
            <Text style={styles.stateText}>
              When you match with someone on the Match tab, you can chat with them here.
            </Text>
          </View>
        ) : (
          <View style={styles.list}>
            {conversations.map((c) => (
              <ConversationRow
                key={c.connectionId}
                conversation={c}
                onPress={() =>
                  router.push({
                    pathname: '/chat/[connectionId]',
                    params: { connectionId: c.connectionId, name: c.otherUserDisplayName },
                  })
                }
              />
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function ConversationRow({
  conversation,
  onPress,
}: {
  conversation: Conversation;
  onPress: () => void;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const initials = getInitials(conversation.otherUserDisplayName);
  const showImage = Boolean(conversation.otherUserAvatarUrl) && !imageFailed;
  const preview = conversation.lastMessage ?? 'Say hello 👋';
  const time = conversation.lastMessageAt
    ? formatRelativeTime(conversation.lastMessageAt)
    : formatRelativeTime(conversation.connectedAt);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open chat with ${conversation.otherUserDisplayName}`}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <View style={styles.avatar}>
        {showImage ? (
          <Image
            source={{ uri: conversation.otherUserAvatarUrl! }}
            style={styles.avatarImage}
            contentFit="cover"
            onError={() => setImageFailed(true)}
          />
        ) : (
          <Text style={styles.avatarInitials}>{initials}</Text>
        )}
      </View>

      <View style={styles.rowBody}>
        <View style={styles.rowTopLine}>
          <Text style={styles.rowName} numberOfLines={1}>{conversation.otherUserDisplayName}</Text>
          <Text style={styles.rowTime}>{time}</Text>
        </View>
        <View style={styles.rowBottomLine}>
          <Text
            style={[styles.rowPreview, conversation.unreadCount > 0 && styles.rowPreviewUnread]}
            numberOfLines={1}
          >
            {preview}
          </Text>
          {conversation.unreadCount > 0 ? (
            <View style={styles.unreadBadge}>
              <Text style={styles.unreadBadgeText}>
                {conversation.unreadCount > 9 ? '9+' : conversation.unreadCount}
              </Text>
            </View>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: {
    backgroundColor: colors.background,
    flex: 1,
  },
  header: {
    paddingBottom: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
  },
  title: {
    color: colors.textPrimary,
    fontSize: 28,
    fontWeight: '900',
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: spacing.xxxl,
    paddingHorizontal: spacing.xl,
  },
  stateBlock: {
    alignItems: 'center',
    flex: 1,
    gap: spacing.md,
    justifyContent: 'center',
    paddingVertical: spacing.xxxl,
  },
  stateTitle: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: '900',
  },
  stateText: {
    color: colors.textSecondary,
    textAlign: 'center',
    ...typography.body,
  },
  list: {
    gap: spacing.sm,
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
  pressed: {
    opacity: 0.8,
  },
  avatar: {
    alignItems: 'center',
    backgroundColor: colors.accentSoft,
    borderRadius: 26,
    height: 52,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 52,
  },
  avatarImage: {
    height: '100%',
    width: '100%',
  },
  avatarInitials: {
    color: colors.accent,
    fontSize: 17,
    fontWeight: '800',
  },
  rowBody: {
    flex: 1,
    gap: 4,
  },
  rowTopLine: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  rowName: {
    color: colors.textPrimary,
    flexShrink: 1,
    fontSize: 15,
    fontWeight: '800',
  },
  rowTime: {
    color: colors.textMuted,
    ...typography.small,
  },
  rowBottomLine: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'space-between',
  },
  rowPreview: {
    color: colors.textMuted,
    flex: 1,
    ...typography.small,
  },
  rowPreviewUnread: {
    color: colors.textSecondary,
    fontWeight: '700',
  },
  unreadBadge: {
    alignItems: 'center',
    backgroundColor: colors.accent,
    borderRadius: radii.pill,
    height: 20,
    justifyContent: 'center',
    minWidth: 20,
    paddingHorizontal: 5,
  },
  unreadBadgeText: {
    color: colors.background,
    fontSize: 11,
    fontWeight: '900',
  },
});
