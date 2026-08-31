import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import {
  connectMatchCandidate,
  getApiErrorMessage,
  searchUsersForMatch,
  type MatchActionResponse,
  type UserSearchResult,
} from '@/src/api';
import { colors, radii, spacing, typography } from '@/src/constants/theme';
import { markSentAccepted, recordSentMatchRequest } from '@/src/features/match/matchRequestStore';

type RowState = 'idle' | 'connecting' | 'pending' | 'matched';

type Props = {
  ownerUserId: string | null;
  /** Fired when a search-driven Connect results in an immediate mutual match. */
  onMutualMatch: (name: string, connectionId: string | null) => void;
  onToast: (message: string) => void;
  onRequestSent?: () => void;
};

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase() || '?';
}

function rowStateFor(user: UserSearchResult): RowState {
  if (user.isConnected) return 'matched';
  if (user.isConnectionPending) return 'pending';
  return 'idle';
}

export function DiscoveryView({
  ownerUserId,
  onMutualMatch,
  onToast,
  onRequestSent,
}: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<UserSearchResult[]>([]);
  const [rowStates, setRowStates] = useState<Record<string, RowState>>({});
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestGenRef = useRef(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const runSearch = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (trimmed.length < 2) {
      setResults([]);
      setSearched(false);
      setError(null);
      setLoading(false);
      return;
    }

    const gen = ++requestGenRef.current;
    setLoading(true);
    setError(null);
    try {
      const items = await searchUsersForMatch(trimmed);
      if (!mountedRef.current || gen !== requestGenRef.current) return;
      setResults(items);
      setRowStates(Object.fromEntries(items.map((u) => [u.userId, rowStateFor(u)])));
      setSearched(true);
    } catch (err) {
      if (!mountedRef.current || gen !== requestGenRef.current) return;
      setError(getApiErrorMessage(err, 'Could not search players.'));
      setResults([]);
    } finally {
      if (mountedRef.current && gen === requestGenRef.current) setLoading(false);
    }
  }, []);

  function handleChangeText(text: string) {
    setQuery(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => void runSearch(text), 350);
  }

  async function handleMatch(user: UserSearchResult) {
    if (rowStates[user.userId] === 'connecting') return;
    setRowStates((prev) => ({ ...prev, [user.userId]: 'connecting' }));
    try {
      const result: MatchActionResponse = await connectMatchCandidate(user.userId);
      setRowStates((prev) => ({
        ...prev,
        [user.userId]: result.isMutualMatch ? 'matched' : 'pending',
      }));
      if (ownerUserId) {
        if (result.isMutualMatch) {
          await markSentAccepted(ownerUserId, user.userId);
        } else {
          await recordSentMatchRequest(ownerUserId, {
            userId: user.userId,
            displayName: user.displayName,
            profileImageUrl: user.profileImageUrl,
            reliabilityScore: 0,
            skillLevel: user.skillLevel ?? '',
            sharedSports: [],
            primarySharedSport: '',
            approximateDistanceKm: 0,
            isConnectionPending: true,
          });
        }
        onRequestSent?.();
      }
      if (result.isMutualMatch) {
        onMutualMatch(user.displayName, result.connectionId);
      } else {
        onToast(`Request sent to ${user.displayName}.`);
      }
    } catch (err) {
      setRowStates((prev) => ({ ...prev, [user.userId]: 'idle' }));
      onToast(getApiErrorMessage(err, 'Could not send match request.'));
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.searchShell}>
        <Ionicons name="search" size={18} color={colors.accent} />
        <TextInput
          value={query}
          onChangeText={handleChangeText}
          placeholder="Search players by name or username"
          placeholderTextColor={colors.textMuted}
          selectionColor={colors.accent}
          style={styles.searchInput}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          onSubmitEditing={() => void runSearch(query)}
        />
        {query.length > 0 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Clear search"
            onPress={() => handleChangeText('')}
            hitSlop={8}
          >
            <Ionicons name="close-circle" size={18} color={colors.textMuted} />
          </Pressable>
        ) : null}
      </View>

      {loading ? (
        <View style={styles.stateBlock}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : error ? (
        <View style={styles.stateBlock}>
          <Text style={styles.stateText}>{error}</Text>
        </View>
      ) : searched && results.length === 0 ? (
        <View style={styles.stateBlock}>
          <Text style={styles.stateText}>No players found for “{query.trim()}”.</Text>
        </View>
      ) : !searched ? (
        <View style={styles.stateBlock}>
          <Ionicons name="people-outline" size={28} color={colors.textMuted} />
          <Text style={styles.stateText}>
            Search for a specific player by name to match with them directly.
          </Text>
        </View>
      ) : (
        <View style={styles.list}>
          {results.map((user) => (
            <DiscoveryRow
              key={user.userId}
              user={user}
              state={rowStates[user.userId] ?? 'idle'}
              onMatch={() => void handleMatch(user)}
            />
          ))}
        </View>
      )}
    </View>
  );
}

function DiscoveryRow({
  user,
  state,
  onMatch,
}: {
  user: UserSearchResult;
  state: RowState;
  onMatch: () => void;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const initials = getInitials(user.displayName);
  const showImage = Boolean(user.profileImageUrl) && !imageFailed;

  return (
    <View style={styles.row}>
      <View style={styles.avatar}>
        {showImage ? (
          <Image
            source={{ uri: user.profileImageUrl! }}
            style={styles.avatarImage}
            contentFit="cover"
            onError={() => setImageFailed(true)}
          />
        ) : (
          <Text style={styles.avatarInitials}>{initials}</Text>
        )}
      </View>

      <View style={styles.rowBody}>
        <Text style={styles.rowName} numberOfLines={1}>{user.displayName}</Text>
        <Text style={styles.rowUsername} numberOfLines={1}>
          @{user.username}
          {user.skillLevel ? `  ·  ${user.skillLevel}` : ''}
        </Text>
      </View>

      {state === 'matched' ? (
        <View style={styles.matchedPill}>
          <Ionicons name="checkmark" size={14} color={colors.accent} />
          <Text style={styles.matchedText}>Matched</Text>
        </View>
      ) : state === 'pending' ? (
        <View style={styles.pendingPill}>
          <Text style={styles.pendingText}>Pending</Text>
        </View>
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Match with ${user.displayName}`}
          disabled={state === 'connecting'}
          onPress={onMatch}
          style={({ pressed }) => [
            styles.matchBtn,
            (pressed || state === 'connecting') && styles.pressed,
          ]}
        >
          {state === 'connecting' ? (
            <ActivityIndicator color={colors.background} size="small" />
          ) : (
            <>
              <Ionicons name="heart" size={14} color={colors.background} />
              <Text style={styles.matchBtnText}>Match</Text>
            </>
          )}
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    gap: spacing.lg,
  },
  searchShell: {
    alignItems: 'center',
    backgroundColor: colors.surfaceElevated,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: 50,
    paddingHorizontal: spacing.lg,
  },
  searchInput: {
    color: colors.textPrimary,
    flex: 1,
    ...typography.body,
  },
  stateBlock: {
    alignItems: 'center',
    gap: spacing.md,
    paddingTop: spacing.xxxl,
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
  rowUsername: {
    color: colors.textMuted,
    ...typography.small,
  },
  matchBtn: {
    alignItems: 'center',
    backgroundColor: colors.accent,
    borderRadius: radii.pill,
    flexDirection: 'row',
    gap: 6,
    justifyContent: 'center',
    minWidth: 84,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  matchBtnText: {
    color: colors.background,
    fontSize: 13,
    fontWeight: '900',
  },
  pendingPill: {
    borderColor: colors.borderStrong,
    borderRadius: radii.pill,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  pendingText: {
    color: colors.textSecondary,
    ...typography.small,
    fontWeight: '700',
  },
  matchedPill: {
    alignItems: 'center',
    backgroundColor: colors.accentSoft,
    borderRadius: radii.pill,
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  matchedText: {
    color: colors.accent,
    ...typography.small,
    fontWeight: '800',
  },
  pressed: {
    opacity: 0.8,
  },
});
