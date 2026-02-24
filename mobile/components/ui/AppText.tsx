import React from 'react';
import { Text, TextProps } from 'react-native';

import { palette, typography } from '@/theme/tokens';

type Variant = 'title' | 'subtitle' | 'label' | 'body' | 'caption' | 'mono';

const variantStyles: Record<Variant, TextProps['style']> = {
  title: {
    fontFamily: typography.heading,
    fontSize: 28,
    lineHeight: 34,
    color: palette.white,
    letterSpacing: 0.3,
  },
  subtitle: {
    fontFamily: typography.headingSemi,
    fontSize: 18,
    lineHeight: 24,
    color: palette.white,
  },
  label: {
    fontFamily: typography.bodySemi,
    fontSize: 14,
    lineHeight: 18,
    color: '#E2E8F0',
  },
  body: {
    fontFamily: typography.body,
    fontSize: 15,
    lineHeight: 22,
    color: '#E2E8F0',
  },
  caption: {
    fontFamily: typography.body,
    fontSize: 12,
    lineHeight: 16,
    color: '#94A3B8',
  },
  mono: {
    fontFamily: typography.bodyBold,
    fontSize: 13,
    lineHeight: 16,
    color: '#CBD5E1',
  },
};

interface AppTextProps extends TextProps {
  variant?: Variant;
}

export const AppText: React.FC<AppTextProps> = ({ variant = 'body', style, children, ...rest }) => (
  <Text style={[variantStyles[variant], style]} {...rest}>
    {children}
  </Text>
);
