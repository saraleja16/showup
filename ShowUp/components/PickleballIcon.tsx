import { Image, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, Defs, Mask, Rect } from 'react-native-svg';

type Props = {
  size?: number;
  /** Fill colour for the silhouette on green / blue / navy markers. */
  color?: string;
  style?: StyleProp<ViewStyle>;
  /**
   * `asset` uses the provided pickleball.png silhouette (exact art, tinted).
   * `svg` uses the vector recreation from assets/icons/pickleball.svg paths.
   */
  variant?: 'asset' | 'svg';
};

export const PICKLEBALL_PNG = require('../assets/icons/pickleball.png');

/**
 * Reusable Pickleball mark — never tennis 🎾 or table-tennis 🏓.
 * Default: provided silhouette PNG with tintColor (exact asset).
 */
export function PickleballIcon({
  size = 20,
  color = '#ffffff',
  style,
  variant = 'asset',
}: Props) {
  if (variant === 'svg') {
    return (
      <View style={[{ width: size, height: size }, style]} accessibilityLabel="Pickleball">
        <Svg width={size} height={size} viewBox="0 0 256 256">
          <Defs>
            <Mask id="pbHoles">
              <Rect width="256" height="256" fill="#fff" />
              <Circle cx="128" cy="56" r="11" fill="#000" />
              <Circle cx="88" cy="70" r="11" fill="#000" />
              <Circle cx="168" cy="70" r="11" fill="#000" />
              <Circle cx="62" cy="102" r="11" fill="#000" />
              <Circle cx="128" cy="96" r="11" fill="#000" />
              <Circle cx="194" cy="102" r="11" fill="#000" />
              <Circle cx="52" cy="140" r="11" fill="#000" />
              <Circle cx="96" cy="132" r="11" fill="#000" />
              <Circle cx="160" cy="132" r="11" fill="#000" />
              <Circle cx="204" cy="140" r="11" fill="#000" />
              <Circle cx="72" cy="176" r="11" fill="#000" />
              <Circle cx="128" cy="168" r="11" fill="#000" />
              <Circle cx="184" cy="176" r="11" fill="#000" />
              <Circle cx="100" cy="208" r="11" fill="#000" />
              <Circle cx="156" cy="208" r="11" fill="#000" />
              <Circle cx="128" cy="230" r="9" fill="#000" />
            </Mask>
          </Defs>
          <Circle cx="128" cy="128" r="112" fill={color} mask="url(#pbHoles)" />
        </Svg>
      </View>
    );
  }

  // Exact provided asset — black silhouette tinted to `color`
  const pad = Math.max(1, Math.round(size * 0.12));
  const inner = Math.max(1, size - pad * 2);
  return (
    <View
      style={[{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }, style]}
      accessibilityLabel="Pickleball"
    >
      <Image
        source={PICKLEBALL_PNG}
        style={{ width: inner, height: inner, tintColor: color }}
        resizeMode="contain"
      />
    </View>
  );
}

/** Inline SVG for Google Maps HTML markers on web. */
export function pickleballSvgMarkup(color = '#ffffff', size = 18): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 256 256" aria-hidden="true">
  <defs>
    <mask id="pb${size}">
      <rect width="256" height="256" fill="#fff"/>
      <circle cx="128" cy="56" r="11" fill="#000"/>
      <circle cx="88" cy="70" r="11" fill="#000"/>
      <circle cx="168" cy="70" r="11" fill="#000"/>
      <circle cx="62" cy="102" r="11" fill="#000"/>
      <circle cx="128" cy="96" r="11" fill="#000"/>
      <circle cx="194" cy="102" r="11" fill="#000"/>
      <circle cx="52" cy="140" r="11" fill="#000"/>
      <circle cx="96" cy="132" r="11" fill="#000"/>
      <circle cx="160" cy="132" r="11" fill="#000"/>
      <circle cx="204" cy="140" r="11" fill="#000"/>
      <circle cx="72" cy="176" r="11" fill="#000"/>
      <circle cx="128" cy="168" r="11" fill="#000"/>
      <circle cx="184" cy="176" r="11" fill="#000"/>
      <circle cx="100" cy="208" r="11" fill="#000"/>
      <circle cx="156" cy="208" r="11" fill="#000"/>
      <circle cx="128" cy="230" r="9" fill="#000"/>
    </mask>
  </defs>
  <circle cx="128" cy="128" r="112" fill="${color}" mask="url(#pb${size})"/>
</svg>`;
}
