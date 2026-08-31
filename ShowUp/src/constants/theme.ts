export const colors = {
  background: '#0a0f1e',
  surface: '#111827',
  surfaceElevated: '#162033',
  border: 'rgba(255, 255, 255, 0.08)',
  borderStrong: 'rgba(168, 255, 62, 0.28)',
  accent: '#a8ff3e',
  accentSoft: 'rgba(168, 255, 62, 0.12)',
  gold: '#a8ff3e',
  goldSoft: 'rgba(168, 255, 62, 0.14)',
  danger: '#ff4757',
  textPrimary: '#ffffff',
  textSecondary: '#9ca3af',
  textMuted: '#6b7280',
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
};

export const radii = {
  sm: 10,
  md: 14,
  lg: 18,
  xl: 24,
  pill: 999,
};

export const typography = {
  title: {
    fontSize: 32,
    lineHeight: 38,
    fontWeight: '900' as const,
  },
  section: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '800' as const,
    letterSpacing: 1.2,
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '500' as const,
  },
  label: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700' as const,
  },
  small: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600' as const,
  },
};

export const shadows = {
  glow: {
    shadowColor: '#a8ff3e',
    shadowOpacity: 0.22,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  card: {
    shadowColor: '#000000',
    shadowOpacity: 0.28,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 10 },
    elevation: 5,
  },
};
