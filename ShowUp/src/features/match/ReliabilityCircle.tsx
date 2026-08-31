import Svg, { Circle, G } from 'react-native-svg';
import { StyleSheet, Text, View } from 'react-native';

import { colors, typography } from '@/src/constants/theme';
import {
  RELIABILITY_TIER_COLORS,
  reliabilityTierForScore,
} from '@/src/features/match/utils';

type Props = {
  score: number;
  size?: number;
};

export function ReliabilityCircle({ score, size = 56 }: Props) {
  const clamped = Math.min(100, Math.max(0, Math.round(score)));
  const tier = reliabilityTierForScore(clamped);
  const { color, label } = RELIABILITY_TIER_COLORS[tier];
  const stroke = 4;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = circumference * (1 - clamped / 100);

  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={`Reliability score ${clamped} percent, ${label}`}
      style={[styles.wrap, { width: size, height: size }]}
    >
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <G rotation="-90" origin={`${size / 2}, ${size / 2}`}>
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke="rgba(255,255,255,0.12)"
            strokeWidth={stroke}
            fill="none"
          />
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={color}
            strokeWidth={stroke}
            fill="none"
            strokeDasharray={`${circumference} ${circumference}`}
            strokeDashoffset={progress}
            strokeLinecap="round"
          />
        </G>
      </Svg>
      <Text
        style={[styles.value, { color, fontSize: clamped === 100 ? 12 : 13 }]}
        maxFontSizeMultiplier={1.2}
      >
        {clamped}%
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  value: {
    ...typography.small,
    fontWeight: '800',
    color: colors.accent,
  },
});
