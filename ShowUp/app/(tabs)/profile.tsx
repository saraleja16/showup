import {
  getApiErrorMessage,
  getProfile,
  getProfileGames,
  removeProfileAvatar,
  updateProfile,
  updateSports,
  uploadProfileAvatar,
  type PortfolioGame,
  type ProfilePortfolioResponse,
  type ProfileResponse,
  type ProfileUser,
} from '@/src/api';
import { useSession } from '@/src/auth';
import { SportIcon } from '@/src/components/SportIcon';
import { PortfolioGameCard } from '@/src/components/PortfolioGameCard';
import { EventStatusCard } from '@/src/components/event-status';
import { ENABLED_SPORTS, SPORTS } from '@/src/sports/registry';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

// ─── Constants ────────────────────────────────────────────────────────────────

type StatsTab = 'played' | 'hosted' | 'upcoming';

const STATS_TAB_META: Record<
  StatsTab,
  { label: string; sectionTitle: string; empty: string }
> = {
  played: {
    label: 'Games Played',
    sectionTitle: 'GAMES PLAYED',
    empty: 'No completed games yet.',
  },
  hosted: {
    label: 'Games Hosted',
    sectionTitle: 'GAMES HOSTED',
    empty: "You haven't hosted any games yet.",
  },
  upcoming: {
    label: 'Upcoming',
    sectionTitle: 'UPCOMING GAMES',
    empty: 'No upcoming games.',
  },
};

const TIER_CONFIG: Record<string, { label: string; color: string }> = {
  excellent: { label: 'Excellent', color: '#a8ff3e' },
  good: { label: 'Good', color: '#4ade80' },
  at_risk: { label: 'At risk', color: '#f59e0b' },
  unreliable: { label: 'Unreliable', color: '#ef4444' },
};

const SETTINGS = [
  { id: 'notifications', label: 'Notifications', destructive: false },
  { id: 'privacy', label: 'Privacy', destructive: false },
  { id: 'help', label: 'Contact Us', destructive: false },
  { id: 'logout', label: 'Log Out', destructive: true },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Avatar({
  initials,
  avatarUrl,
  onPress,
  uploading,
}: {
  initials: string;
  avatarUrl: string | null;
  onPress: () => void;
  uploading: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Change profile photo"
      onPress={onPress}
      disabled={uploading}
      style={({ pressed }) => [styles.avatarRing, pressed && styles.pressed]}
    >
      {avatarUrl ? (
        <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
      ) : (
        <View style={styles.avatarInner}>
          <Text style={styles.avatarInitials}>{initials}</Text>
        </View>
      )}
      <View style={styles.avatarEditBadge}>
        {uploading ? (
          <ActivityIndicator color="#1a1a2e" size="small" />
        ) : (
          <Text style={styles.avatarEditText}>Change</Text>
        )}
      </View>
    </Pressable>
  );
}

function ScoreBar({ score, color }: { score: number; color: string }) {
  return (
    <View style={styles.scoreBarTrack}>
      <View
        style={[
          styles.scoreBarFill,
          { width: `${Math.min(100, Math.max(0, score))}%`, backgroundColor: color },
        ]}
      />
    </View>
  );
}

function SportChip({ id }: { id: string }) {
  const config = SPORTS[id];
  if (!config) {
    return (
      <View style={styles.sportPill}>
        <Text style={styles.sportPillText}>{id}</Text>
      </View>
    );
  }
  return (
    <View style={styles.sportPill}>
      <SportIcon sportId={id} size={14} color="#a8ff3e" />
      <Text style={styles.sportPillText}> {config.label}</Text>
    </View>
  );
}

function SportsModal({
  visible,
  currentSports,
  onClose,
  onToggle,
  updating,
}: {
  visible: boolean;
  currentSports: string[];
  onClose: () => void;
  onToggle: (id: string, willBeSelected: boolean) => void;
  updating: boolean;
}) {
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalSheet}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>My Sports</Text>
            <Pressable
              onPress={onClose}
              style={({ pressed }) => [pressed && styles.pressed]}
              accessibilityRole="button"
            >
              <Text style={styles.modalDone}>Done</Text>
            </Pressable>
          </View>
          {ENABLED_SPORTS.map((id) => {
            const config = SPORTS[id];
            const selected = currentSports.includes(id);
            return (
              <Pressable
                key={id}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: selected }}
                style={({ pressed }) => [styles.modalRow, pressed && styles.pressed]}
                onPress={() => onToggle(id, !selected)}
                disabled={updating}
              >
                <View style={styles.modalRowIcon}>
                  <SportIcon sportId={id} size={20} color="#a8ff3e" />
                </View>
                <Text style={styles.modalRowLabel}>{config.label}</Text>
                <View style={[styles.modalCheckbox, selected && styles.modalCheckboxSelected]}>
                  {selected && <Text style={styles.modalCheckmark}>✓</Text>}
                </View>
              </Pressable>
            );
          })}
        </View>
      </View>
    </Modal>
  );
}

function EditProfileModal({
  visible,
  firstName,
  lastName,
  username,
  saving,
  onChangeFirstName,
  onChangeLastName,
  onChangeUsername,
  onCancel,
  onSave,
}: {
  visible: boolean;
  firstName: string;
  lastName: string;
  username: string;
  saving: boolean;
  onChangeFirstName: (value: string) => void;
  onChangeLastName: (value: string) => void;
  onChangeUsername: (value: string) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onCancel}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalSheet}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Edit Profile</Text>
            <Pressable
              onPress={onCancel}
              disabled={saving}
              style={({ pressed }) => [pressed && styles.pressed]}
              accessibilityRole="button"
            >
              <Text style={styles.modalCancel}>Cancel</Text>
            </Pressable>
          </View>
          <View style={styles.editForm}>
            <Text style={styles.inputLabel}>FIRST NAME</Text>
            <TextInput
              value={firstName}
              onChangeText={onChangeFirstName}
              editable={!saving}
              autoCapitalize="words"
              autoCorrect={false}
              placeholder="First name"
              placeholderTextColor="#6b7280"
              style={styles.textInput}
            />

            <Text style={styles.inputLabel}>LAST NAME</Text>
            <TextInput
              value={lastName}
              onChangeText={onChangeLastName}
              editable={!saving}
              autoCapitalize="words"
              autoCorrect={false}
              placeholder="Last name"
              placeholderTextColor="#6b7280"
              style={styles.textInput}
            />

            <Text style={styles.inputLabel}>USERNAME</Text>
            <TextInput
              value={username}
              onChangeText={onChangeUsername}
              editable={!saving}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="Username"
              placeholderTextColor="#6b7280"
              style={styles.textInput}
            />

            <Pressable
              accessibilityRole="button"
              onPress={onSave}
              disabled={saving}
              style={({ pressed }) => [styles.saveButton, pressed && styles.pressed]}
            >
              {saving ? (
                <ActivityIndicator color="#1a1a2e" />
              ) : (
                <Text style={styles.saveButtonText}>Save</Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function AvatarOptionsModal({
  visible,
  removing,
  onChangePhoto,
  onRemovePhoto,
  onCancel,
}: {
  visible: boolean;
  removing: boolean;
  onChangePhoto: () => void;
  onRemovePhoto: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onCancel}>
      <View style={styles.modalOverlay}>
        <View style={styles.avatarOptionsSheet}>
          <Pressable
            accessibilityRole="button"
            onPress={onChangePhoto}
            disabled={removing}
            style={({ pressed }) => [styles.avatarOptionRow, pressed && styles.pressed]}
          >
            <Text style={styles.avatarOptionText}>Change Photo</Text>
          </Pressable>
          <View style={styles.divider} />
          <Pressable
            accessibilityRole="button"
            onPress={onRemovePhoto}
            disabled={removing}
            style={({ pressed }) => [styles.avatarOptionRow, pressed && styles.pressed]}
          >
            {removing ? (
              <ActivityIndicator color="#ff4757" />
            ) : (
              <Text style={styles.avatarOptionDestructive}>Remove Photo</Text>
            )}
          </Pressable>
          <View style={styles.divider} />
          <Pressable
            accessibilityRole="button"
            onPress={onCancel}
            disabled={removing}
            style={({ pressed }) => [styles.avatarOptionRow, pressed && styles.pressed]}
          >
            <Text style={styles.avatarOptionCancel}>Cancel</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function SettingsRow({
  item,
  isLast,
  onPress,
}: {
  item: (typeof SETTINGS)[0];
  isLast: boolean;
  onPress?: () => void;
}) {
  return (
    <>
      <Pressable
        accessibilityRole="button"
        onPress={onPress}
        style={({ pressed }) => [styles.settingsRow, pressed && styles.pressed]}
      >
        <Text style={[styles.settingsLabel, item.destructive && styles.settingsLabelDestructive]}>
          {item.label}
        </Text>
        {!item.destructive && <Text style={styles.settingsChevron}>›</Text>}
      </Pressable>
      {!isLast && <View style={styles.divider} />}
    </>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function ProfileScreen() {
  const router = useRouter();
  const { user: sessionUser, signIn, signOut } = useSession();

  const [profile, setProfile] = useState<ProfileResponse | null>(null);
  const [portfolio, setPortfolio] = useState<ProfilePortfolioResponse | null>(null);
  const [statsTab, setStatsTab] = useState<StatsTab>('upcoming');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sportsModalVisible, setSportsModalVisible] = useState(false);
  const [sportsUpdating, setSportsUpdating] = useState(false);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editFirstName, setEditFirstName] = useState('');
  const [editLastName, setEditLastName] = useState('');
  const [editUsername, setEditUsername] = useState('');
  const [profileSaving, setProfileSaving] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarRemoving, setAvatarRemoving] = useState(false);
  const [avatarOptionsVisible, setAvatarOptionsVisible] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const hasLoadedOnce = useRef(false);

  const syncSessionUser = useCallback(
    async (profileUser: ProfileUser) => {
      if (!sessionUser) return;
      await signIn({
        ...sessionUser,
        firstName: profileUser.firstName,
        lastName: profileUser.lastName,
        displayName: profileUser.name,
        username: profileUser.username,
        avatarUrl: profileUser.avatarUrl,
      });
    },
    [sessionUser, signIn]
  );

  const handleLogout = useCallback(async () => {
    await signOut();
    router.replace('/login');
  }, [router, signOut]);

  const openEditProfile = useCallback(() => {
    const profileUser = profile?.user;
    setEditFirstName(profileUser?.firstName ?? sessionUser?.firstName ?? '');
    setEditLastName(profileUser?.lastName ?? sessionUser?.lastName ?? '');
    setEditUsername(profileUser?.username ?? sessionUser?.username ?? '');
    setEditModalVisible(true);
  }, [profile?.user, sessionUser]);

  const handleSaveProfile = useCallback(async () => {
    if (!sessionUser?.id) return;

    const firstName = editFirstName.trim();
    const lastName = editLastName.trim();
    const username = editUsername.trim();

    if (!firstName || !lastName || !username) {
      Alert.alert('Missing details', 'First name, last name, and username are required.');
      return;
    }

    setProfileSaving(true);
    try {
      const updated = await updateProfile(sessionUser.id, { firstName, lastName, username });
      setProfile(updated);
      await syncSessionUser(updated.user);
      setEditModalVisible(false);
    } catch (err) {
      Alert.alert('Could not update profile', getApiErrorMessage(err));
    } finally {
      setProfileSaving(false);
    }
  }, [editFirstName, editLastName, editUsername, sessionUser?.id, syncSessionUser]);

  const pickAndUploadAvatar = useCallback(async () => {
    if (!sessionUser?.id || avatarUploading || avatarRemoving) return;

    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Permission required', 'Photo library access is required to choose a profile photo.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      console.log('[ProfileAvatar] image picker result', result);

      if (result.canceled || !result.assets[0]) return;

      const asset = result.assets[0];
      const type = asset.mimeType ?? 'image/jpeg';
      const name = asset.fileName ?? `profile-photo.${type.split('/')[1] ?? 'jpg'}`;

      console.log('[ProfileAvatar] selected asset', {
        uri: asset.uri,
        mimeType: asset.mimeType,
        fileName: asset.fileName,
        type,
        name,
      });

      setAvatarUploading(true);
      const { avatarUrl } = await uploadProfileAvatar(sessionUser.id, {
        uri: asset.uri,
        name,
        type,
      });

      setProfile((p) =>
        p
          ? {
              ...p,
              user: {
                ...p.user,
                avatarUrl,
              },
            }
          : p
      );

      if (profile?.user) {
        await syncSessionUser({ ...profile.user, avatarUrl });
      } else if (sessionUser) {
        await signIn({ ...sessionUser, avatarUrl });
      }
    } catch (err) {
      console.log('[ProfileAvatar] handleChangeAvatar error', err);
      Alert.alert('Could not update photo', getApiErrorMessage(err));
    } finally {
      setAvatarUploading(false);
    }
  }, [avatarRemoving, avatarUploading, profile?.user, sessionUser, signIn, syncSessionUser]);

  const removeAvatar = useCallback(async () => {
    if (!sessionUser?.id || avatarUploading || avatarRemoving) return;

    setAvatarRemoving(true);
    try {
      await removeProfileAvatar(sessionUser.id);
      setAvatarOptionsVisible(false);
      setProfile((p) =>
        p
          ? {
              ...p,
              user: {
                ...p.user,
                avatarUrl: null,
              },
            }
          : p
      );

      if (profile?.user) {
        await syncSessionUser({ ...profile.user, avatarUrl: null });
      } else if (sessionUser) {
        await signIn({ ...sessionUser, avatarUrl: null });
      }
    } catch (err) {
      Alert.alert('Could not remove photo', getApiErrorMessage(err));
    } finally {
      setAvatarRemoving(false);
    }
  }, [avatarRemoving, avatarUploading, profile?.user, sessionUser, signIn, syncSessionUser]);

  const confirmRemoveAvatar = useCallback(() => {
    if (avatarUploading || avatarRemoving) return;

    if (Platform.OS === 'web') {
      const confirmed = window.confirm('Remove your profile photo?');
      if (confirmed) {
        void removeAvatar();
      }
      return;
    }

    Alert.alert('Remove photo?', 'Your profile photo will be removed.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove Photo', style: 'destructive', onPress: () => void removeAvatar() },
    ]);
  }, [avatarRemoving, avatarUploading, removeAvatar]);

  const handleAvatarPress = useCallback(() => {
    if (avatarUploading || avatarRemoving) return;

    if (!profile?.user.avatarUrl) {
      void pickAndUploadAvatar();
      return;
    }

    if (Platform.OS === 'web') {
      setAvatarOptionsVisible(true);
      return;
    }

    Alert.alert('Profile photo', undefined, [
      { text: 'Change Photo', onPress: () => void pickAndUploadAvatar() },
      { text: 'Remove Photo', style: 'destructive', onPress: confirmRemoveAvatar },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }, [
    avatarRemoving,
    avatarUploading,
    confirmRemoveAvatar,
    pickAndUploadAvatar,
    profile?.user.avatarUrl,
  ]);

  useFocusEffect(
    useCallback(() => {
      void retryCount;

      if (!sessionUser?.id) {
        setIsLoading(false);
        return;
      }
      let cancelled = false;
      if (!hasLoadedOnce.current) setIsLoading(true);
      setError(null);

      const userId = sessionUser.id;

      Promise.all([
        getProfile(userId),
        getProfileGames(userId, 'played', 1, 50),
        getProfileGames(userId, 'hosted', 1, 50),
        getProfileGames(userId, 'upcoming', 1, 50),
      ])
        .then(([profileData, playedPage, hostedPage, upcomingPage]) => {
          if (cancelled) return;
          const nextPortfolio: ProfilePortfolioResponse = {
            // Prefer page totals (full category size). Card lists may be capped at pageSize.
            stats: {
              gamesPlayed: playedPage.total,
              gamesHosted: hostedPage.total,
              upcomingCount: upcomingPage.total,
            },
            played: playedPage.items,
            hosted: hostedPage.items,
            upcomingGames: upcomingPage.items,
          };
          setProfile({
            ...profileData,
            stats: nextPortfolio.stats,
          });
          setPortfolio(nextPortfolio);
          hasLoadedOnce.current = true;
          setIsLoading(false);
        })
        .catch(async () => {
          // Profile shell can still load if portfolio games fail.
          try {
            const profileData = await getProfile(userId);
            if (cancelled) return;
            setProfile(profileData);
            setPortfolio(null);
            hasLoadedOnce.current = true;
            setIsLoading(false);
          } catch {
            if (!cancelled) {
              setError('Could not load profile.');
              setIsLoading(false);
            }
          }
        });

      return () => {
        cancelled = true;
      };
    }, [sessionUser?.id, retryCount])
  );

  const handleToggleSport = useCallback(
    async (id: string, willBeSelected: boolean) => {
      if (!profile || !sessionUser?.id) return;
      const prev = profile.sports;
      const next = willBeSelected ? [...prev, id] : prev.filter((s) => s !== id);

      setProfile((p) => (p ? { ...p, sports: next } : p));
      setSportsUpdating(true);

      try {
        const result = await updateSports(sessionUser.id, next);
        setProfile((p) => (p ? { ...p, sports: result.sports } : p));
      } catch {
        setProfile((p) => (p ? { ...p, sports: prev } : p));
        Alert.alert('Error', 'Could not update sports. Please try again.');
      } finally {
        setSportsUpdating(false);
      }
    },
    [profile, sessionUser?.id]
  );

  const statsCounts = useMemo(() => {
    if (portfolio) {
      return {
        played: portfolio.stats.gamesPlayed,
        hosted: portfolio.stats.gamesHosted,
        upcoming: portfolio.stats.upcomingCount,
      };
    }
    const fromProfile = profile?.stats;
    return {
      played: fromProfile?.gamesPlayed ?? 0,
      hosted: fromProfile?.gamesHosted ?? 0,
      upcoming: fromProfile?.upcomingCount ?? 0,
    };
  }, [portfolio, profile?.stats]);

  const selectedGames: PortfolioGame[] = useMemo(() => {
    if (!portfolio) return [];
    if (statsTab === 'played') return portfolio.played;
    if (statsTab === 'hosted') return portfolio.hosted;
    return portfolio.upcomingGames;
  }, [portfolio, statsTab]);

  const selectedMeta = STATS_TAB_META[statsTab];

  const displayStats = useMemo(
    () =>
      [
        { tab: 'played' as const, label: STATS_TAB_META.played.label, value: String(statsCounts.played) },
        { tab: 'hosted' as const, label: STATS_TAB_META.hosted.label, value: String(statsCounts.hosted) },
        {
          tab: 'upcoming' as const,
          label: STATS_TAB_META.upcoming.label,
          value: String(statsCounts.upcoming),
        },
      ] as const,
    [statsCounts.hosted, statsCounts.played, statsCounts.upcoming]
  );

  // ── First-load states ──────────────────────────────────────────────────────

  if (isLoading && !profile) {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar barStyle="light-content" backgroundColor="#1a1a2e" />
        <View style={styles.centeredState}>
          <ActivityIndicator color="#a8ff3e" size="large" />
        </View>
      </SafeAreaView>
    );
  }

  if (error && !profile) {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar barStyle="light-content" backgroundColor="#1a1a2e" />
        <View style={styles.centeredState}>
          <Text style={styles.errorState}>{error}</Text>
          <Pressable
            accessibilityRole="button"
            style={({ pressed }) => [styles.retryButton, pressed && styles.pressed]}
            onPress={() => setRetryCount((c) => c + 1)}
          >
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  // ── Derived display data ───────────────────────────────────────────────────

  const profileUser = profile?.user;
  const displayName = profileUser?.name ?? sessionUser?.displayName ?? 'ShowUp Player';
  const email = profileUser?.email ?? sessionUser?.email ?? '—';
  const initials = profileUser ? getInitials(profileUser.name) : 'SU';
  const avatarUrl = profileUser?.avatarUrl ?? null;

  const reliability = profile?.reliability;
  const tierCfg = reliability
    ? (TIER_CONFIG[reliability.tier] ?? { label: reliability.tier, color: '#8a8aa0' })
    : null;

  const sports = profile?.sports ?? [];

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor="#1a1a2e" />
      <SportsModal
        visible={sportsModalVisible}
        currentSports={sports}
        onClose={() => setSportsModalVisible(false)}
        onToggle={handleToggleSport}
        updating={sportsUpdating}
      />
      <EditProfileModal
        visible={editModalVisible}
        firstName={editFirstName}
        lastName={editLastName}
        username={editUsername}
        saving={profileSaving}
        onChangeFirstName={setEditFirstName}
        onChangeLastName={setEditLastName}
        onChangeUsername={setEditUsername}
        onCancel={() => setEditModalVisible(false)}
        onSave={handleSaveProfile}
      />
      <AvatarOptionsModal
        visible={avatarOptionsVisible}
        removing={avatarRemoving}
        onChangePhoto={() => {
          setAvatarOptionsVisible(false);
          void pickAndUploadAvatar();
        }}
        onRemovePhoto={confirmRemoveAvatar}
        onCancel={() => setAvatarOptionsVisible(false)}
      />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* 1 · HEADER */}
        <View style={styles.headerSection}>
          <Avatar
            initials={initials}
            avatarUrl={avatarUrl}
            onPress={handleAvatarPress}
            uploading={avatarUploading || avatarRemoving}
          />
          <Text style={styles.displayName}>{displayName}</Text>
          <Text style={styles.handle}>{email}</Text>
          <Pressable
            accessibilityRole="button"
            onPress={openEditProfile}
            style={({ pressed }) => [styles.editButton, pressed && styles.pressed]}
          >
            <Text style={styles.editButtonText}>Edit Profile</Text>
          </Pressable>
        </View>

        {/* 1b · EMAIL VERIFICATION PROMPT — shown until the user redeems their code */}
        {sessionUser && sessionUser.isEmailVerified === false && (
          <Pressable
            accessibilityRole="button"
            onPress={() =>
              router.push({ pathname: '/verify-email', params: { email: sessionUser.email } })
            }
            style={({ pressed }) => [styles.verifyBanner, pressed && styles.pressed]}
          >
            <Text style={styles.verifyBannerTitle}>Verify your email</Text>
            <Text style={styles.verifyBannerBody}>
              Confirm {sessionUser.email} to secure your account. Tap to enter your code.
            </Text>
          </Pressable>
        )}

        {/* 2 · RELIABILITY CARD */}
        {reliability && tierCfg && (
          <View style={styles.card}>
            <View style={styles.scoreRow}>
              <Text style={[styles.scoreValue, { color: tierCfg.color }]}>{reliability.score}</Text>
              <View style={styles.scoreMeta}>
                <Text style={styles.scoreLabel}>Reliability</Text>
                <Text style={[styles.tierLabel, { color: tierCfg.color }]}>{tierCfg.label}</Text>
                {reliability.sampleSize === 0 && (
                  <Text style={styles.newPlayerNote}>
                    New player — attend games to build your score
                  </Text>
                )}
              </View>
            </View>
            <ScoreBar score={reliability.score} color={tierCfg.color} />
          </View>
        )}

        {/* 3 · STATS ROW (clickable filters) */}
        {profile ? (
          <View style={[styles.card, styles.statsCard]}>
            {displayStats.map((stat, i) => {
              const selected = statsTab === stat.tab;
              return (
                <Pressable
                  key={stat.tab}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  accessibilityLabel={`${stat.label}: ${stat.value}`}
                  onPress={() => setStatsTab(stat.tab)}
                  style={({ pressed }) => [
                    styles.statBlock,
                    selected && styles.statBlockSelected,
                    i < displayStats.length - 1 && styles.statBlockBorder,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={[styles.statValue, selected && styles.statValueSelected]}>
                    {stat.value}
                  </Text>
                  <Text style={[styles.statLabel, selected && styles.statLabelSelected]}>
                    {stat.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}

        {/* 4 · MY SPORTS */}
        <Text style={styles.sectionTitle}>MY SPORTS</Text>
        <View style={styles.pillsRow}>
          {sports.map((id) => (
            <SportChip key={id} id={id} />
          ))}
          <Pressable
            accessibilityRole="button"
            style={({ pressed }) => [styles.addSportChip, pressed && styles.pressed]}
            onPress={() => setSportsModalVisible(true)}
          >
            <Text style={styles.addSportChipText}>+</Text>
          </Pressable>
        </View>

        {/* 5 · FILTERED GAMES (Played / Hosted / Upcoming) */}
        <Text style={[styles.sectionTitle, styles.sectionTitleSpaced]}>{selectedMeta.sectionTitle}</Text>
        {selectedGames.length === 0 ? (
          <Text style={styles.emptyText}>{selectedMeta.empty}</Text>
        ) : (
          selectedGames.map((game) =>
            sessionUser?.id ? (
              <EventStatusCard
                key={`${statsTab}-${game.eventId}`}
                source="portfolio"
                game={game}
                mode={statsTab}
                variant="profile"
                userId={sessionUser.id}
                readOnly={false}
                initiallyExpanded={statsTab !== 'upcoming'}
                onResultChanged={() => setRetryCount((c) => c + 1)}
              />
            ) : (
              <PortfolioGameCard key={`${statsTab}-${game.eventId}`} game={game} mode={statsTab} />
            )
          )
        )}

        {/* 7 · ACCOUNT */}
        <Text style={[styles.sectionTitle, styles.sectionTitleSpaced, styles.sectionTitleMuted]}>
          ACCOUNT
        </Text>
        <View style={styles.settingsCard}>
          {SETTINGS.map((item, i) => (
            <SettingsRow
              key={item.id}
              item={item}
              isLast={i === SETTINGS.length - 1}
              onPress={
                item.id === 'logout'
                  ? handleLogout
                  : item.id === 'notifications'
                    ? () => router.push('/notification-settings')
                    : item.id === 'privacy'
                      ? () => router.push('/privacy')
                      : item.id === 'help'
                        ? () =>
                            void Linking.openURL(
                              'mailto:support@showup.app?subject=ShowUp%20Support'
                            )
                        : undefined
              }
            />
          ))}
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#1a1a2e',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 24,
  },

  // Full-screen loading / error
  centeredState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  errorState: {
    color: '#ff6b6b',
    fontSize: 15,
    fontWeight: '500',
    textAlign: 'center',
    paddingHorizontal: 24,
  },
  retryButton: {
    borderWidth: 1.5,
    borderColor: '#a8ff3e',
    borderRadius: 20,
    paddingHorizontal: 24,
    paddingVertical: 10,
  },
  retryText: {
    color: '#a8ff3e',
    fontSize: 14,
    fontWeight: '700',
  },

  // Header
  headerSection: {
    alignItems: 'center',
    marginBottom: 24,
  },
  avatarRing: {
    width: 92,
    height: 92,
    borderRadius: 46,
    borderWidth: 3,
    borderColor: '#a8ff3e',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
    shadowColor: '#a8ff3e',
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
    elevation: 6,
    overflow: 'hidden',
    position: 'relative',
  },
  avatarImage: {
    width: 86,
    height: 86,
    borderRadius: 43,
  },
  avatarInner: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#162033',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitials: {
    color: '#a8ff3e',
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: 1,
  },
  avatarEditBadge: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    minHeight: 24,
    backgroundColor: 'rgba(168, 255, 62, 0.9)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarEditText: {
    color: '#1a1a2e',
    fontSize: 10,
    fontWeight: '900',
  },
  displayName: {
    color: '#ffffff',
    fontSize: 24,
    fontWeight: '900',
    marginBottom: 4,
  },
  handle: {
    color: '#8a8aa0',
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 16,
  },
  editButton: {
    borderWidth: 1.5,
    borderColor: '#a8ff3e',
    borderRadius: 20,
    paddingHorizontal: 22,
    paddingVertical: 8,
  },
  editButtonText: {
    color: '#a8ff3e',
    fontSize: 13,
    fontWeight: '700',
  },

  // Cards (shared)
  card: {
    backgroundColor: '#111827',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(168, 255, 62, 0.2)',
    padding: 16,
    marginBottom: 14,
  },

  // Unverified-email prompt
  verifyBanner: {
    backgroundColor: 'rgba(168, 255, 62, 0.10)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(168, 255, 62, 0.45)',
    padding: 16,
    marginBottom: 14,
  },
  verifyBannerTitle: {
    color: '#a8ff3e',
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 4,
  },
  verifyBannerBody: {
    color: '#9ca3af',
    fontSize: 13,
    lineHeight: 18,
  },

  // Reliability card
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginBottom: 14,
  },
  scoreValue: {
    fontSize: 52,
    fontWeight: '900',
    lineHeight: 56,
  },
  scoreMeta: {
    flex: 1,
  },
  scoreLabel: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 2,
  },
  tierLabel: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 4,
  },
  newPlayerNote: {
    color: '#6b7280',
    fontSize: 12,
    fontWeight: '500',
    lineHeight: 16,
  },
  scoreBarTrack: {
    height: 6,
    backgroundColor: 'rgba(168, 255, 62, 0.12)',
    borderRadius: 3,
    overflow: 'hidden',
  },
  scoreBarFill: {
    height: '100%',
    borderRadius: 3,
  },

  // Stats
  statsCard: {
    flexDirection: 'row',
    paddingVertical: 0,
    paddingHorizontal: 0,
    overflow: 'hidden',
  },
  statBlock: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 20,
    paddingHorizontal: 6,
  },
  statBlockSelected: {
    backgroundColor: 'rgba(168, 255, 62, 0.1)',
    borderTopWidth: 2,
    borderBottomWidth: 2,
    borderColor: '#a8ff3e',
  },
  statBlockBorder: {
    borderRightWidth: 1,
    borderRightColor: 'rgba(168, 255, 62, 0.12)',
  },
  statValue: {
    color: '#a8ff3e',
    fontSize: 24,
    fontWeight: '900',
    marginBottom: 4,
  },
  statValueSelected: {
    color: '#c8ff7a',
  },
  statLabel: {
    color: '#8a8aa0',
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
    letterSpacing: 0.3,
  },
  statLabelSelected: {
    color: '#a8ff3e',
    fontWeight: '800',
  },

  // Section titles
  sectionTitle: {
    color: '#a8ff3e',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 2,
    marginBottom: 12,
  },
  sectionTitleSpaced: {
    marginTop: 8,
  },
  sectionTitleMuted: {
    color: '#8a8aa0',
  },

  // Sport pills
  pillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 14,
  },
  sportPill: {
    backgroundColor: '#162033',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#a8ff3e',
    paddingHorizontal: 14,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
  },
  sportPillText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
  },
  addSportChip: {
    backgroundColor: 'rgba(168, 255, 62, 0.1)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(168, 255, 62, 0.4)',
    paddingHorizontal: 14,
    paddingVertical: 6,
    minWidth: 36,
    alignItems: 'center',
  },
  addSportChipText: {
    color: '#a8ff3e',
    fontSize: 18,
    fontWeight: '700',
    lineHeight: 20,
  },

  // Empty state
  emptyText: {
    color: '#6b7280',
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 14,
  },

  // Upcoming event cards
  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  cardTopLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 1,
  },
  sportTag: {
    backgroundColor: 'rgba(168, 255, 62, 0.15)',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: 'rgba(168, 255, 62, 0.4)',
  },
  sportTagText: {
    color: '#a8ff3e',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
  },
  hostBadge: {
    backgroundColor: 'rgba(168, 255, 62, 0.25)',
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: '#a8ff3e',
  },
  hostBadgeText: {
    color: '#a8ff3e',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
  },
  cardDatetime: {
    color: '#8a8aa0',
    fontSize: 12,
    fontWeight: '500',
    flexShrink: 0,
    marginLeft: 8,
  },
  cardTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 6,
  },
  cardLocation: {
    color: '#6b7280',
    fontSize: 13,
    marginBottom: 12,
  },
  cardBottomRow: {
    flexDirection: 'row',
    gap: 8,
  },
  metaBadge: {
    backgroundColor: '#1a1a2e',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  metaText: {
    color: '#9ca3af',
    fontSize: 12,
    fontWeight: '500',
  },

  // Sports modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: '#111827',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    borderColor: 'rgba(168, 255, 62, 0.2)',
    paddingBottom: 40,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 18,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  modalTitle: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '700',
  },
  modalDone: {
    color: '#a8ff3e',
    fontSize: 15,
    fontWeight: '700',
  },
  modalCancel: {
    color: '#8a8aa0',
    fontSize: 15,
    fontWeight: '700',
  },
  modalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.04)',
    gap: 12,
  },
  modalRowIcon: {
    width: 30,
    alignItems: 'center',
  },
  modalRowLabel: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '500',
    flex: 1,
  },
  modalCheckbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'rgba(168, 255, 62, 0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCheckboxSelected: {
    backgroundColor: '#a8ff3e',
    borderColor: '#a8ff3e',
  },
  modalCheckmark: {
    color: '#1a1a2e',
    fontSize: 13,
    fontWeight: '900',
  },

  // Edit profile modal
  editForm: {
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 28,
  },
  inputLabel: {
    color: '#a8ff3e',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
    marginBottom: 8,
  },
  textInput: {
    backgroundColor: '#162033',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(168, 255, 62, 0.25)',
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 16,
  },
  saveButton: {
    backgroundColor: '#a8ff3e',
    borderRadius: 20,
    paddingVertical: 13,
    alignItems: 'center',
    marginTop: 4,
  },
  saveButtonText: {
    color: '#1a1a2e',
    fontSize: 14,
    fontWeight: '900',
  },

  // Avatar options
  avatarOptionsSheet: {
    backgroundColor: '#111827',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(168, 255, 62, 0.25)',
    overflow: 'hidden',
    marginHorizontal: 28,
  },
  avatarOptionRow: {
    minWidth: 260,
    paddingHorizontal: 20,
    paddingVertical: 16,
    alignItems: 'center',
  },
  avatarOptionText: {
    color: '#a8ff3e',
    fontSize: 15,
    fontWeight: '800',
  },
  avatarOptionDestructive: {
    color: '#ff4757',
    fontSize: 15,
    fontWeight: '800',
  },
  avatarOptionCancel: {
    color: '#8a8aa0',
    fontSize: 15,
    fontWeight: '700',
  },

  // Settings
  settingsCard: {
    backgroundColor: '#111827',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(168, 255, 62, 0.2)',
    overflow: 'hidden',
    marginBottom: 14,
  },
  settingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  settingsLabel: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '500',
  },
  settingsLabelDestructive: {
    color: '#ff4757',
  },
  settingsChevron: {
    color: '#8a8aa0',
    fontSize: 20,
    fontWeight: '300',
    lineHeight: 22,
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    marginHorizontal: 16,
  },

  // Misc
  pressed: {
    opacity: 0.75,
  },
});
