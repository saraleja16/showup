import { StyleSheet, View } from 'react-native';

import { colors } from '@/src/constants/theme';

const LINE_COLOR = colors.accent;

/**
 * Soccer field markings: halfway line, centre circle, and both penalty boxes.
 * All lines use colors.accent at 3 px — same weight as the pitch border.
 * Rendered inside the PositionPicker container; `width` drives circle radius.
 */
export function SoccerField({ width }: { width: number }) {
  const circleD = width * 0.28;
  return (
    <>
      <View style={styles.halfwayLine} />

      {width > 0 && (
        <View
          style={[
            styles.centerCircleBase,
            {
              width: circleD,
              height: circleD,
              borderRadius: circleD / 2,
              marginLeft: -(circleD / 2),
              marginTop: -(circleD / 2),
            },
          ]}
        />
      )}

      <View style={styles.penaltyTop} />
      <View style={styles.penaltyBottom} />
    </>
  );
}

const styles = StyleSheet.create({
  halfwayLine: {
    backgroundColor: LINE_COLOR,
    height: 3,
    left: 0,
    position: 'absolute',
    right: 0,
    top: '50%',
  },
  centerCircleBase: {
    borderColor: LINE_COLOR,
    borderWidth: 3,
    left: '50%',
    position: 'absolute',
    top: '50%',
  },
  penaltyTop: {
    borderBottomColor: LINE_COLOR,
    borderBottomWidth: 3,
    borderLeftColor: LINE_COLOR,
    borderLeftWidth: 3,
    borderRightColor: LINE_COLOR,
    borderRightWidth: 3,
    height: '18%',
    left: '20%',
    position: 'absolute',
    right: '20%',
    top: 0,
  },
  penaltyBottom: {
    borderLeftColor: LINE_COLOR,
    borderLeftWidth: 3,
    borderRightColor: LINE_COLOR,
    borderRightWidth: 3,
    borderTopColor: LINE_COLOR,
    borderTopWidth: 3,
    bottom: 0,
    height: '18%',
    left: '20%',
    position: 'absolute',
    right: '20%',
  },
});
