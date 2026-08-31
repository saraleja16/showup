import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { Platform, StyleSheet, View } from 'react-native';

import { colors, radii, spacing } from '@/src/constants/theme';

type IoniconName = keyof typeof Ionicons.glyphMap;

/**
 * Standard tab glyph. Filled variant when focused, outline when idle —
 * the same visual language as the rest of the app's iconography.
 */
function TabIcon({
  name,
  outline,
  focused,
  color,
}: {
  name: IoniconName;
  outline: IoniconName;
  focused: boolean;
  color: string;
}) {
  return (
    <View style={styles.iconWrap}>
      <Ionicons name={focused ? name : outline} size={23} color={color} />
      {focused ? <View style={styles.activeDot} /> : null}
    </View>
  );
}

/**
 * Center action: raised lime pill for matchmaking.
 * Heart rather than a plus — creating games already owns the "+" on Home.
 */
function MatchIcon({ focused }: { focused: boolean }) {
  return (
    <View style={[styles.matchButton, focused && styles.matchButtonFocused]}>
      <Ionicons name={focused ? 'heart' : 'heart-outline'} size={24} color={colors.background} />
    </View>
  );
}

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: styles.tabBar,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: '#5b6b7f',
        tabBarLabelStyle: styles.label,
        tabBarItemStyle: styles.item,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ focused, color }) => (
            <TabIcon name="flash" outline="flash-outline" focused={focused} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="create"
        options={{
          title: 'My Games',
          tabBarIcon: ({ focused, color }) => (
            <TabIcon name="calendar" outline="calendar-outline" focused={focused} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="match"
        options={{
          title: 'Match',
          tabBarLabel: () => null,
          tabBarIcon: ({ focused }) => <MatchIcon focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="chat"
        options={{
          title: 'Chat',
          tabBarIcon: ({ focused, color }) => (
            <TabIcon
              name="chatbubble-ellipses"
              outline="chatbubble-ellipses-outline"
              focused={focused}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ focused, color }) => (
            <TabIcon name="person" outline="person-outline" focused={focused} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: 'rgba(13, 20, 36, 0.98)',
    borderTopColor: 'rgba(255, 255, 255, 0.06)',
    borderTopWidth: StyleSheet.hairlineWidth,
    height: Platform.OS === 'ios' ? 84 : 68,
    paddingBottom: Platform.OS === 'ios' ? 24 : 10,
    paddingTop: 10,
    elevation: 0,
  },
  item: {
    paddingTop: 2,
  },
  label: {
    fontSize: 10.5,
    fontWeight: '700',
    letterSpacing: 0.2,
    marginTop: 2,
  },
  iconWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 26,
  },
  activeDot: {
    position: 'absolute',
    bottom: -5,
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.accent,
  },
  matchButton: {
    width: 46,
    height: 46,
    marginTop: -14,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
    borderWidth: 3,
    borderColor: 'rgba(13, 20, 36, 0.98)',
    shadowColor: colors.accent,
    shadowOpacity: 0.45,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
    marginBottom: spacing.xs,
  },
  matchButtonFocused: {
    shadowOpacity: 0.7,
    shadowRadius: 16,
  },
});
