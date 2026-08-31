import { StyleSheet, View } from 'react-native';

import { colors } from '@/src/constants/theme';

const LINE_COLOR = colors.accent;

/**
 * Pickleball court markings: net, non-volley zone (kitchen) lines, and
 * centre service lines in each service area.
 *
 * Proportions based on a standard 20 × 44 ft court mapped to the picker's
 * 2:3 portrait container.
 * - Net at 50 %
 * - Kitchen lines at ~34 % / ~66 %  (7 ft NVZ from net; 15 ft from each baseline)
 * - Centre service line: vertical at 50 %, only from baseline to kitchen line
 *   (the NVZ itself has no centre division)
 */
export function PickleballCourt(_props: { width: number }) {
  return (
    <>
      {/* Centre service lines — top and bottom service areas only, not in the kitchen */}
      <View style={styles.centerServiceTop} />
      <View style={styles.centerServiceBottom} />

      {/* Kitchen (non-volley zone) lines */}
      <View style={styles.kitchenTop} />
      <View style={styles.kitchenBottom} />

      {/* Net — slightly thicker than field lines to read as a net */}
      <View style={styles.net} />
    </>
  );
}

const styles = StyleSheet.create({
  net: {
    backgroundColor: LINE_COLOR,
    height: 5,
    left: 0,
    position: 'absolute',
    right: 0,
    top: '50%',
  },
  kitchenTop: {
    backgroundColor: LINE_COLOR,
    height: 3,
    left: 0,
    position: 'absolute',
    right: 0,
    top: '34%',
  },
  kitchenBottom: {
    backgroundColor: LINE_COLOR,
    bottom: '34%',
    height: 3,
    left: 0,
    position: 'absolute',
    right: 0,
  },
  // Top service area: from top baseline (0 %) to kitchen line (~34 %)
  centerServiceTop: {
    backgroundColor: LINE_COLOR,
    left: '50%',
    marginLeft: -1,
    position: 'absolute',
    top: 0,
    bottom: '66%',
    width: 3,
  },
  // Bottom service area: from kitchen line (~66 %) to bottom baseline (100 %)
  centerServiceBottom: {
    backgroundColor: LINE_COLOR,
    bottom: 0,
    left: '50%',
    marginLeft: -1,
    position: 'absolute',
    top: '66%',
    width: 3,
  },
});
