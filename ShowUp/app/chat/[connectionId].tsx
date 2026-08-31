import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  getApiErrorMessage,
  getMessages,
  markConversationRead,
  sendChatMessage,
  type ChatMessage,
} from '@/src/api';
import { useSession } from '@/src/auth';
import { colors, radii, spacing, typography } from '@/src/constants/theme';

const POLL_INTERVAL_MS = 4000;

export default function ConversationScreen() {
  const { connectionId, name } = useLocalSearchParams<{ connectionId: string; name?: string }>();
  const router = useRouter();
  const { user } = useSession();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);

  const scrollRef = useRef<ScrollView>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const knownIdsRef = useRef<Set<string>>(new Set());
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const loadInitial = useCallback(async () => {
    if (!connectionId) return;
    setLoading(true);
    setError(null);
    try {
      const page = await getMessages(connectionId);
      if (!mountedRef.current) return;
      knownIdsRef.current = new Set(page.items.map((m) => m.id));
      setMessages(page.items);
      setNextCursor(page.nextCursor);
      void markConversationRead(connectionId).catch(() => {});
    } catch (err) {
      if (!mountedRef.current) return;
      setError(getApiErrorMessage(err, 'Could not load messages.'));
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [connectionId]);

  const pollLatest = useCallback(async () => {
    if (!connectionId) return;
    try {
      const page = await getMessages(connectionId);
      if (!mountedRef.current) return;
      const fresh = page.items.filter((m) => !knownIdsRef.current.has(m.id));
      if (fresh.length > 0) {
        fresh.forEach((m) => knownIdsRef.current.add(m.id));
        setMessages((prev) => [...prev, ...fresh].sort(
          (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        ));
        void markConversationRead(connectionId).catch(() => {});
      }
    } catch {
      // Silent — polling errors shouldn't interrupt the conversation.
    }
  }, [connectionId]);

  useFocusEffect(
    useCallback(() => {
      void loadInitial();
      pollRef.current = setInterval(() => void pollLatest(), POLL_INTERVAL_MS);
      return () => {
        if (pollRef.current) clearInterval(pollRef.current);
      };
    }, [loadInitial, pollLatest])
  );

  async function handleLoadOlder() {
    if (!connectionId || !nextCursor || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const page = await getMessages(connectionId, nextCursor);
      if (!mountedRef.current) return;
      page.items.forEach((m) => knownIdsRef.current.add(m.id));
      setMessages((prev) => [...page.items, ...prev]);
      setNextCursor(page.nextCursor);
    } catch (err) {
      if (mountedRef.current) setError(getApiErrorMessage(err, 'Could not load older messages.'));
    } finally {
      if (mountedRef.current) setLoadingOlder(false);
    }
  }

  async function handleSend() {
    const content = draft.trim();
    if (!content || !connectionId || sending) return;
    setSending(true);
    setError(null);
    setDraft('');
    try {
      const message = await sendChatMessage(connectionId, content);
      if (!mountedRef.current) return;
      // A concurrent poll cycle can already have appended this message (it fetched the
      // conversation after the send landed server-side but before this await resolved).
      // Only append here if it isn't already known, or we'd render a duplicate key.
      const alreadyKnown = knownIdsRef.current.has(message.id);
      knownIdsRef.current.add(message.id);
      if (!alreadyKnown) {
        setMessages((prev) => [...prev, message]);
      }
      requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
    } catch (err) {
      if (mountedRef.current) {
        setDraft(content);
        setError(getApiErrorMessage(err, 'Could not send message.'));
      }
    } finally {
      if (mountedRef.current) setSending(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <StatusBar barStyle="light-content" backgroundColor={colors.background} />

      <View style={styles.topBar}>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
        >
          <Ionicons name="chevron-back" size={20} color={colors.accent} />
        </Pressable>
        <Text style={styles.headerName} numberOfLines={1}>{name ?? 'Chat'}</Text>
        <View style={styles.backButton} />
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        {loading ? (
          <View style={styles.stateBlock}>
            <ActivityIndicator color={colors.accent} size="large" />
          </View>
        ) : (
          <ScrollView
            ref={scrollRef}
            contentContainerStyle={styles.messagesContent}
            onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
          >
            {nextCursor ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => void handleLoadOlder()}
                style={({ pressed }) => [styles.loadOlder, pressed && styles.pressed]}
                disabled={loadingOlder}
              >
                {loadingOlder ? (
                  <ActivityIndicator color={colors.accent} size="small" />
                ) : (
                  <Text style={styles.loadOlderText}>Load earlier messages</Text>
                )}
              </Pressable>
            ) : null}

            {messages.length === 0 ? (
              <View style={styles.emptyBlock}>
                <Text style={styles.emptyText}>
                  You matched — say hello and plan your next game together.
                </Text>
              </View>
            ) : (
              messages.map((m) => (
                <MessageBubble key={m.id} message={m} isMine={m.senderId === user?.id} />
              ))
            )}
          </ScrollView>
        )}

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <View style={styles.inputRow}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="Message…"
            placeholderTextColor={colors.textMuted}
            selectionColor={colors.accent}
            style={styles.input}
            multiline
            maxLength={2000}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Send message"
            onPress={() => void handleSend()}
            disabled={!draft.trim() || sending}
            style={({ pressed }) => [
              styles.sendBtn,
              (!draft.trim() || sending) && styles.sendBtnDisabled,
              pressed && styles.pressed,
            ]}
          >
            <Ionicons name="send" size={18} color={colors.background} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function MessageBubble({ message, isMine }: { message: ChatMessage; isMine: boolean }) {
  const time = new Date(message.createdAt).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });

  return (
    <View style={[styles.bubbleRow, isMine && styles.bubbleRowMine]}>
      <View style={[styles.bubble, isMine ? styles.bubbleMine : styles.bubbleTheirs]}>
        <Text style={[styles.bubbleText, isMine && styles.bubbleTextMine]}>{message.content}</Text>
        <Text style={[styles.bubbleTime, isMine && styles.bubbleTimeMine]}>{time}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: {
    backgroundColor: colors.background,
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  topBar: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  backButton: {
    alignItems: 'center',
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  headerName: {
    color: colors.textPrimary,
    flex: 1,
    fontSize: 17,
    fontWeight: '800',
    textAlign: 'center',
  },
  pressed: {
    opacity: 0.8,
  },
  stateBlock: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  messagesContent: {
    flexGrow: 1,
    gap: spacing.sm,
    paddingBottom: spacing.lg,
    paddingHorizontal: spacing.lg,
  },
  loadOlder: {
    alignItems: 'center',
    alignSelf: 'center',
    borderColor: colors.border,
    borderRadius: radii.pill,
    borderWidth: 1,
    marginBottom: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  loadOlderText: {
    color: colors.accent,
    ...typography.small,
    fontWeight: '700',
  },
  emptyBlock: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    paddingTop: spacing.xxxl,
  },
  emptyText: {
    color: colors.textSecondary,
    paddingHorizontal: spacing.xl,
    textAlign: 'center',
    ...typography.body,
  },
  bubbleRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
  },
  bubbleRowMine: {
    justifyContent: 'flex-end',
  },
  bubble: {
    borderRadius: radii.lg,
    maxWidth: '78%',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  bubbleTheirs: {
    backgroundColor: colors.surfaceElevated,
    borderBottomLeftRadius: 4,
  },
  bubbleMine: {
    backgroundColor: colors.accent,
    borderBottomRightRadius: 4,
  },
  bubbleText: {
    color: colors.textPrimary,
    ...typography.body,
  },
  bubbleTextMine: {
    color: colors.background,
    fontWeight: '600',
  },
  bubbleTime: {
    color: colors.textMuted,
    fontSize: 10,
    marginTop: 4,
    textAlign: 'right',
  },
  bubbleTimeMine: {
    color: 'rgba(10, 15, 30, 0.6)',
  },
  errorText: {
    color: colors.danger,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
    ...typography.small,
    textAlign: 'center',
  },
  inputRow: {
    alignItems: 'flex-end',
    borderTopColor: colors.border,
    borderTopWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.md,
  },
  input: {
    backgroundColor: colors.surfaceElevated,
    borderColor: colors.border,
    borderRadius: radii.lg,
    borderWidth: 1,
    color: colors.textPrimary,
    flex: 1,
    maxHeight: 120,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    ...typography.body,
  },
  sendBtn: {
    alignItems: 'center',
    backgroundColor: colors.accent,
    borderRadius: 22,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  sendBtnDisabled: {
    opacity: 0.5,
  },
});
