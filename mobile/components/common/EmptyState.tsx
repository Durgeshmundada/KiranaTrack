import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Feather } from '@expo/vector-icons';

import { AppText } from '@/components/ui/AppText';
import { GlassCard } from '@/components/ui/GlassCard';

interface EmptyStateProps {
  icon: keyof typeof Feather.glyphMap;
  title: string;
  subtitle: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({ icon, title, subtitle }) => (
  <GlassCard intense style={styles.card}>
    <View style={styles.iconWrap}>
      <Feather name={icon} size={26} color="#E2E8F0" />
    </View>
    <AppText variant="subtitle" style={styles.title}>
      {title}
    </AppText>
    <AppText variant="caption" style={styles.subtitle}>
      {subtitle}
    </AppText>
  </GlassCard>
);

const styles = StyleSheet.create({
  card: {
    alignItems: 'center',
    paddingVertical: 28,
    gap: 8,
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    textAlign: 'center',
  },
  subtitle: {
    textAlign: 'center',
    maxWidth: 260,
  },
});
