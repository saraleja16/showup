import { StyleSheet, View } from 'react-native';

import { colors } from '@/src/constants/theme';

const LINE_COLOR = colors.accent;

/**
 * Volleyball court markings: net and attack lines (3-metre lines).
 *
 * Proportions based on a standard 9 × 18 m court mapped to the picker's
 * 2:3 portrait container.
 * - Net at 50 %
 * - Attack lines at ~33 % / ~67 %  (3 m from net out of 9 m per half)
 */
export function VolleyballCourt(_props: { width: number }) {
  return (
    <>
      {/* Attack lines (3-metre lines) */}
      <View style={styles.attackLineTop} />
      <View style={styles.attackLineBottom} />

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
  attackLineTop: {
    backgroundColor: LINE_COLOR,
    height: 3,
    left: 0,
    position: 'absolute',
    right: 0,
    top: '33%',
  },
  attackLineBottom: {
    backgroundColor: LINE_COLOR,
    bottom: '33%',
    height: 3,
    left: 0,
    position: 'absolute',
    right: 0,
  },
});
