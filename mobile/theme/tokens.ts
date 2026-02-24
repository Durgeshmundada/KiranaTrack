export const palette = {
  ink: '#0F172A',
  slate: '#344054',
  mist: '#F8FAFC',
  ivory: '#FFFAF0',
  saffron: '#F59E0B',
  coral: '#F97316',
  emerald: '#22C55E',
  crimson: '#DC2626',
  cyan: '#0EA5E9',
  indigo: '#1E3A8A',
  smoke: '#64748B',
  white: '#FFFFFF',
  black: '#030712',
};

export const semantic = {
  background: '#0B1223',
  backgroundMuted: '#131E38',
  textPrimary: '#F8FAFC',
  textSecondary: '#CBD5E1',
  borderSoft: 'rgba(255,255,255,0.14)',
  cardOverlay: 'rgba(255,255,255,0.08)',
  overdue: palette.crimson,
  partial: palette.saffron,
  cleared: palette.emerald,
  unpaid: '#94A3B8',
};

export const gradients = {
  screen: ['#0B1020', '#1A2343', '#0D3558'] as const,
  primaryButton: ['#F97316', '#F59E0B'] as const,
  accent: ['#22D3EE', '#3B82F6'] as const,
  glassShine: ['rgba(255,255,255,0.22)', 'rgba(255,255,255,0.03)'] as const,
  metricWarm: ['#FB923C', '#F97316'] as const,
  metricCool: ['#22D3EE', '#0284C7'] as const,
  metricSuccess: ['#4ADE80', '#16A34A'] as const,
  metricNeutral: ['#94A3B8', '#475569'] as const,
};

export const spacing = {
  xs: 6,
  sm: 10,
  md: 14,
  lg: 18,
  xl: 24,
  xxl: 32,
};

export const radii = {
  sm: 10,
  md: 14,
  lg: 20,
  xl: 28,
  pill: 999,
};

export const typography = {
  heading: 'Syne_700Bold',
  headingSemi: 'Syne_600SemiBold',
  body: 'Manrope_500Medium',
  bodySemi: 'Manrope_600SemiBold',
  bodyBold: 'Manrope_700Bold',
};

export const shadows = {
  soft: {
    shadowColor: '#020617',
    shadowOpacity: 0.2,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  strong: {
    shadowColor: '#020617',
    shadowOpacity: 0.35,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
  },
};
