import { StyleSheet, View } from 'react-native';

import { colors } from '@/src/constants/theme';

const LINE_COLOR = colors.accent;

/**
 * Tennis court markings: net, singles sidelines, service lines, and centre
 * service line.
 *
 * Proportions based on a standard 36 × 78 ft doubles court mapped to
 * the picker's 2:3 portrait container.
 * - Net at 50 % — full width, 5 px
 * - Singles sidelines: vertical at ~13 % / ~87 % (4.5 ft alley out of 36 ft),
 *   full height
 * - Service lines at ~23 % / ~77 % (21 ft from net out of 39 ft per half),
 *   inset to run only between the two sidelines (13 %→87 %) so the corners
 *   stay clean
 * - Centre service line: vertical at 50 %, only between the service lines
 */
export function TennisCourt(_props: { width: number }) {
  return (
    <>
      {/* Singles sidelines — full height, define the doubles alleys */}
      <View style={styles.sidelineLeft} />
      <View style={styles.sidelineRight} />

      {/* Service lines — inset between the sidelines only */}
      <View style={styles.serviceLineTop} />
      <View style={styles.serviceLineBottom} />

      {/* Centre service line — only between the two service lines */}
      <View style={styles.centerServiceLine} />

      {/* Net — full width, slightly thicker to read as a net */}
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
  sidelineLeft: {
    backgroundColor: LINE_COLOR,
    bottom: 0,
    left: '13%',
    position: 'absolute',
    top: 0,
    width: 3,
  },
  sidelineRight: {
    backgroundColor: LINE_COLOR,
    bottom: 0,
    position: 'absolute',
    right: '13%',
    top: 0,
    width: 3,
  },
  serviceLineTop: {
    backgroundColor: LINE_COLOR,
    height: 3,
    left: '13%',
    position: 'absolute',
    right: '13%',
    top: '23%',
  },
  serviceLineBottom: {
    backgroundColor: LINE_COLOR,
    bottom: '23%',
    height: 3,
    left: '13%',
    position: 'absolute',
    right: '13%',
  },
  centerServiceLine: {
    backgroundColor: LINE_COLOR,
    bottom: '23%',
    left: '50%',
    marginLeft: -1,
    position: 'absolute',
    top: '23%',
    width: 3,
  },
});
