import React from 'react';
import { Platform, StyleSheet, View, ViewProps } from 'react-native';
import { BlurView } from 'expo-blur';

import { radii, semantic, shadows } from '@/theme/tokens';

type GlassCardProps = ViewProps & {
  intense?: boolean;
};

export const GlassCard: React.FC<GlassCardProps> = ({ children, style, intense = false, ...rest }) => (
  <View style={[styles.shadowWrap, style]} {...rest}>
    {Platform.OS === 'android' ? (
      <View style={[styles.card, intense && styles.cardIntense]}>{children}</View>
    ) : (
      <BlurView
        intensity={intense ? 32 : 20}
        tint="dark"
        style={[styles.card, intense && styles.cardIntense]}>
        {children}
      </BlurView>
    )}
  </View>
);

const styles = StyleSheet.create({
  shadowWrap: {
    borderRadius: radii.lg,
    ...shadows.soft,
  },
  card: {
    overflow: 'hidden',
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: semantic.borderSoft,
    backgroundColor: semantic.cardOverlay,
    padding: 14,
  },
  cardIntense: {
    borderColor: 'rgba(255,255,255,0.24)',
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
});
