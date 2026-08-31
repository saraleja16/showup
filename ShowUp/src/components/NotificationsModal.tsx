import { useCallback, useEffect, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  getUserNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  type NotificationItem,
} from '@/src/api';

type Props = {
  visible: boolean;
  userId: string;
  onClose: () => void;
  onCountChange: (count: number) => void;
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default function NotificationsModal({ visible, userId, onClose, onCountChange }: Props) {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getUserNotifications(userId);
      setNotifications(data);
      onCountChange(data.filter((n) => !n.read).length);
    } catch (err) {
      console.error('[notifications] Failed to fetch:', err);
    } finally {
      setLoading(false);
    }
  }, [userId, onCountChange]);

  useEffect(() => {
    if (visible) fetchNotifications();
  }, [visible, fetchNotifications]);

  const handleTap = async (item: NotificationItem) => {
    if (item.read) return;
    try {
      await markNotificationRead(item.id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === item.id ? { ...n, read: true } : n))
      );
      onCountChange(notifications.filter((n) => !n.read && n.id !== item.id).length);
    } catch (err) {
      console.error('[notifications] Failed to mark read:', err);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await markAllNotificationsRead(userId);
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      onCountChange(0);
    } catch (err) {
      console.error('[notifications] Failed to mark all read:', err);
    }
  };

  const unreadCount = notifications.filter((n) => !n.read).length;

  const renderItem = ({ item }: { item: NotificationItem }) => (
    <Pressable
      onPress={() => handleTap(item)}
      style={({ pressed }) => [
        nStyles.item,
        !item.read && nStyles.itemUnread,
        pressed && nStyles.itemPressed,
      ]}
    >
      <View style={nStyles.itemRow}>
        {!item.read && <View style={nStyles.unreadDot} />}
        <View style={nStyles.itemContent}>
          <Text style={nStyles.itemTitle} numberOfLines={1}>{item.title}</Text>
          <Text style={nStyles.itemBody} numberOfLines={2}>{item.body}</Text>
          <Text style={nStyles.itemTime}>{timeAgo(item.createdAt)}</Text>
        </View>
      </View>
    </Pressable>
  );

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={nStyles.safe}>
        <View style={nStyles.header}>
          <Text style={nStyles.headerTitle}>Notifications</Text>
          <Pressable onPress={onClose} hitSlop={12}>
            <Text style={nStyles.closeBtn}>✕</Text>
          </Pressable>
        </View>

        {unreadCount > 0 && (
          <Pressable onPress={handleMarkAllRead} style={nStyles.markAllRow}>
            <Text style={nStyles.markAllText}>Mark all as read</Text>
          </Pressable>
        )}

        {loading ? (
          <View style={nStyles.centered}>
            <ActivityIndicator color="#a8ff3e" size="large" />
          </View>
        ) : notifications.length === 0 ? (
          <View style={nStyles.centered}>
            <Ionicons
              name="notifications-off-outline"
              size={40}
              color="#374151"
              style={nStyles.emptyIcon}
            />
            <Text style={nStyles.emptyText}>No notifications yet</Text>
          </View>
        ) : (
          <FlatList
            data={notifications}
            keyExtractor={(n) => n.id}
            renderItem={renderItem}
            contentContainerStyle={nStyles.list}
            showsVerticalScrollIndicator={false}
          />
        )}
      </SafeAreaView>
    </Modal>
  );
}

const nStyles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#1a1a2e',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  headerTitle: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '800',
  },
  closeBtn: {
    color: '#8a8aa0',
    fontSize: 20,
    fontWeight: '600',
  },
  markAllRow: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    alignItems: 'flex-end',
  },
  markAllText: {
    color: '#a8ff3e',
    fontSize: 13,
    fontWeight: '700',
  },
  list: {
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  item: {
    backgroundColor: '#111827',
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.04)',
  },
  itemUnread: {
    borderColor: 'rgba(168, 255, 62, 0.25)',
  },
  itemPressed: {
    opacity: 0.75,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#a8ff3e',
    marginTop: 6,
  },
  itemContent: {
    flex: 1,
    minWidth: 0,
  },
  itemTitle: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 3,
  },
  itemBody: {
    color: '#9ca3af',
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 4,
  },
  itemTime: {
    color: '#6b7280',
    fontSize: 11,
    fontWeight: '500',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyIcon: {
    marginBottom: 12,
  },
  emptyText: {
    color: '#6b7280',
    fontSize: 15,
  },
});
