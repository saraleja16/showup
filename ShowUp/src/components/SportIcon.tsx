import { FontAwesome6, MaterialCommunityIcons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import { PickleballIcon } from '@/components/PickleballIcon';
import { sportIconSpec } from '@/lib/map-marker-style';
import { colors } from '@/src/constants/theme';

type Props = {
  sportId?: string | null;
  size?: number;
  color?: string;
};

/**
 * Single source of truth for rendering a sport as a vector glyph.
 * Uses the same `sportIconSpec` mapping as the map pins, so a sport looks
 * identical in cards, chips, headers and markers.
 */
export function SportIcon({ sportId, size = 16, color = colors.accent }: Props) {
  const spec = sportIconSpec(sportId);

  if (spec.family === 'pickleball') {
    return <PickleballIcon size={size} color={color} />;
  }
  if (spec.family === 'fa6') {
    return <FontAwesome6 name={spec.name} size={size} color={color} />;
  }
  if (spec.family === 'emoji') {
    return <Text style={[styles.emoji, { fontSize: size, color }]}>{spec.value}</Text>;
  }
  return <MaterialCommunityIcons name={spec.name} size={size} color={color} />;
}

/**
 * Sport glyph inside a soft rounded tile — for list rows and card headers
 * where the icon needs its own visual container.
 */
export function SportIconBadge({
  sportId,
  size = 34,
  color = colors.accent,
}: Props) {
  return (
    <View
      style={[
        styles.badge,
        { width: size, height: size, borderRadius: size / 3 },
      ]}
    >
      <SportIcon sportId={sportId} size={Math.round(size * 0.56)} color={color} />
    </View>
  );
}

const styles = StyleSheet.create({
  emoji: {
    textAlign: 'center',
  },
  badge: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentSoft,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
  },
});
