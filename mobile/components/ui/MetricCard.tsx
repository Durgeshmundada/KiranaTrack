import React from 'react';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { AppText } from '@/components/ui/AppText';
import { radii, shadows } from '@/theme/tokens';

interface MetricCardProps {
  title: string;
  value: string;
  colors: readonly [string, string, ...string[]];
  subtitle?: string;
}

export const MetricCard: React.FC<MetricCardProps> = ({ title, value, colors, subtitle }) => (
  <LinearGradient colors={colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.card}>
    <AppText variant="caption" style={styles.title}>
      {title}
    </AppText>
    <AppText variant="subtitle" style={styles.value}>
      {value}
    </AppText>
    {subtitle ? (
      <AppText variant="caption" style={styles.subtitle}>
        {subtitle}
      </AppText>
    ) : null}
  </LinearGradient>
);

const styles = StyleSheet.create({
  card: {
    width: 188,
    borderRadius: radii.lg,
    padding: 14,
    minHeight: 116,
    justifyContent: 'space-between',
    ...shadows.soft,
  },
  title: {
    color: 'rgba(15,23,42,0.82)',
  },
  value: {
    color: '#0A1427',
    fontSize: 25,
    lineHeight: 30,
  },
  subtitle: {
    color: 'rgba(15,23,42,0.7)',
  },
});
