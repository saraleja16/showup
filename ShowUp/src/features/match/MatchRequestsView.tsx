import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  acceptMatchRequestById,
  declineMatchRequestById,
  getApiErrorMessage,
  getApiErrorStatus,
  getIncomingMatchRequests,
  getSentMatchRequests,
  isNetworkError,
  type MatchRequestListItem,
} from '@/src/api';
import { colors, spacing } from '@/src/constants/theme';
import { MatchRequestCard } from '@/src/features/match/MatchRequestCard';
import type { MatchRequestItem } from '@/src/features/match/matchRequestStore';

export type RequestTab = 'sent' | 'incoming';

type Props = {
  userId: string;
  activeTab: RequestTab;
  onTabChange: (tab: RequestTab) => void;
  onToast: (message: string) => void;
  onMutualMatch?: (name: string, connectionId: string | null) => void;
  /** Bump when swipe/discovery sends a request so Sent refreshes. */
  refreshToken?: number;
  /**
   * When true, renders as a plain View (no own ScrollView/RefreshControl) so it can be
   * embedded inside a parent scroll container, e.g. below the matched-profiles list in
   * MatchesListModal.
   */
  embedded?: boolean;
};

function toRequestItem(
  dto: MatchRequestListItem,
  status: MatchRequestItem['status']
): MatchRequestItem {
  const other = dto.user;
  return {
    userId: other.id,
    displayName: other.displayName,
    profileImageUrl: other.avatarUrl,
    reliabilityScore: other.reliabilityScore ?? 0,
    skillLevel: other.skillLevel ?? '',
    sharedSports: other.preferredSports ?? [],
    primarySharedSport: other.preferredSports?.[0],
    status,
    updatedAt: dto.updatedAt,
    requestId: dto.requestId,
  };
}

export function MatchRequestsView({
  activeTab,
  onToast,
  onMutualMatch,
  refreshToken = 0,
  embedded = false,
}: Props) {
  const [sent, setSent] = useState<MatchRequestItem[]>([]);
  const [incoming, setIncoming] = useState<MatchRequestItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [sentDtos, incomingDtos] = await Promise.all([
        getSentMatchRequests(),
        getIncomingMatchRequests(),
      ]);

      setSent(sentDtos.map((d) => toRequestItem(d, 'pending')));
      setIncoming(incomingDtos.map((d) => toRequestItem(d, 'pending')));
    } catch (err) {
      if (isNetworkError(err)) {
        setError('You appear offline. Pull to refresh when connected.');
      } else if (getApiErrorStatus(err) === 401) {
        setError('Please sign in again to manage match requests.');
      } else {
        setError(getApiErrorMessage(err, 'Could not load match requests.'));
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void load();
    }, [load])
  );

  useEffect(() => {
    if (refreshToken === 0) return;
    void load();
  }, [refreshToken, load]);

  async function handleAccept(item: MatchRequestItem) {
    if (!item.requestId) return;
    setBusyId(item.userId);
    try {
      const result = await acceptMatchRequestById(item.requestId);
      setIncoming((prev) => prev.filter((x) => x.userId !== item.userId));
      if (result.status === 'Accepted') {
        onMutualMatch?.(item.displayName, result.connectionId);
        onToast(`Matched with ${item.displayName}`);
      } else {
        onToast('Request accepted');
      }
      void load();
    } catch (err) {
      const status = getApiErrorStatus(err);
      if (status === 404) onToast('Request no longer available.');
      else if (status === 401) onToast('Please sign in again.');
      else onToast(getApiErrorMessage(err, 'Could not accept request.'));
      void load();
    } finally {
      setBusyId(null);
    }
  }

  async function handleReject(item: MatchRequestItem) {
    if (!item.requestId) return;
    setBusyId(item.userId);
    try {
      await declineMatchRequestById(item.requestId);
      setIncoming((prev) => prev.filter((x) => x.userId !== item.userId));
      onToast('Request rejected');
      void load();
    } catch (err) {
      onToast(getApiErrorMessage(err, 'Could not reject request.'));
    } finally {
      setBusyId(null);
    }
  }

  const counts = {
    sent: sent.length,
    incoming: incoming.length,
  };

  const list = activeTab === 'sent' ? sent : incoming;

  const empty = activeTab === 'sent' ? 'No sent requests.' : 'No incoming requests.';

  const body = (
    <>
      <View style={styles.countRow}>
        <Text style={styles.countText}>
          {activeTab === 'sent' ? `Sent ${counts.sent}` : `Incoming ${counts.incoming}`}
        </Text>
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {list.length === 0 ? (
        <Text style={styles.empty}>{empty}</Text>
      ) : (
        list.map((item) => (
          <MatchRequestCard
            key={`${activeTab}-${item.userId}`}
            item={item}
            variant={activeTab}
            busy={busyId === item.userId}
            onAccept={() => void handleAccept(item)}
            onReject={() => void handleReject(item)}
          />
        ))
      )}
    </>
  );

  if (loading) {
    return (
      <View style={embedded ? styles.embeddedLoading : styles.wrap}>
        <ActivityIndicator color={colors.accent} style={{ marginTop: 24 }} />
      </View>
    );
  }

  if (embedded) {
    return <View style={styles.embeddedWrap}>{body}</View>;
  }

  return (
    <View style={styles.wrap}>
      <ScrollView
        style={styles.list}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void load();
            }}
            tintColor={colors.accent}
          />
        }
      >
        {body}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  embeddedWrap: { paddingHorizontal: spacing.xl, paddingTop: spacing.sm },
  embeddedLoading: { paddingVertical: spacing.lg },
  countRow: { marginBottom: spacing.sm, alignItems: 'flex-start' },
  countText: { color: colors.accent, fontWeight: '800', fontSize: 13, letterSpacing: 0.4 },
  list: { flex: 1 },
  listContent: { paddingHorizontal: spacing.md, paddingBottom: 40 },
  empty: {
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 32,
    fontSize: 14,
    fontWeight: '600',
  },
  error: { color: '#fca5a5', marginBottom: 12, textAlign: 'center' },
});
