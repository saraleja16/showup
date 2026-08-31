import { StyleSheet, Text, View } from 'react-native';
import { FontAwesome6, MaterialCommunityIcons } from '@expo/vector-icons';
import {
  resolveMarkerStyle,
  sportIconSpec,
  type MarkerSource,
} from '@/lib/map-marker-style';
import { PickleballIcon } from '@/components/PickleballIcon';

type Props = {
  source: MarkerSource;
  sportId: string;
};

export function MapSportMarker({ source, sportId }: Props) {
  const style = resolveMarkerStyle(source, sportId);
  const icon = sportIconSpec(sportId);
  const iconSize = Math.round(style.size * 0.42);

  return (
    <View style={styles.wrap}>
      <View
        style={[
          styles.pin,
          {
            width: style.size,
            height: style.size,
            borderRadius: style.size / 2,
            backgroundColor: style.backgroundColor,
            borderColor: style.borderColor,
            shadowColor: style.glowColor,
          },
        ]}
      >
        {icon.family === 'pickleball' ? (
          <PickleballIcon size={iconSize + 4} color={style.iconColor} />
        ) : icon.family === 'emoji' ? (
          <Text style={[styles.emoji, { fontSize: iconSize + 2 }]}>{icon.value}</Text>
        ) : icon.family === 'fa6' ? (
          <FontAwesome6 name={icon.name} size={iconSize} color={style.iconColor} />
        ) : (
          <MaterialCommunityIcons name={icon.name} size={iconSize + 2} color={style.iconColor} />
        )}
      </View>
      {style.badge === 'booked' ? (
        <View style={[styles.badge, styles.badgeBooked]}>
          <Text style={styles.badgeText}>✓</Text>
        </View>
      ) : null}
      {style.badge === 'open' ? (
        <View style={[styles.badge, styles.badgeOpen]}>
          <Text style={styles.badgeText}>+</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  pin: {
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOpacity: 0.4,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 1 },
    elevation: 5,
  },
  emoji: {
    lineHeight: 22,
  },
  badge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 14,
    height: 14,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#0b1220',
  },
  badgeBooked: {
    backgroundColor: '#064e3b',
  },
  badgeOpen: {
    backgroundColor: '#1e3a8a',
  },
  badgeText: {
    color: '#ffffff',
    fontSize: 8,
    fontWeight: '900',
    lineHeight: 10,
  },
});
