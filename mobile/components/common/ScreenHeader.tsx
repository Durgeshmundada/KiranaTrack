import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { AppText } from '@/components/ui/AppText';
import { GlassCard } from '@/components/ui/GlassCard';
import { palette } from '@/theme/tokens';

interface ScreenHeaderProps {
  title: string;
  subtitle?: string;
  rightNode?: React.ReactNode;
  offline?: boolean;
}

export const ScreenHeader: React.FC<ScreenHeaderProps> = ({ title, subtitle, rightNode, offline = false }) => (
  <View style={styles.container}>
    <View style={styles.copyWrap}>
      <AppText variant="title">{title}</AppText>
      {subtitle ? (
        <AppText variant="caption" style={styles.subtitle}>
          {subtitle}
        </AppText>
      ) : null}
    </View>
    {rightNode}
    {offline ? (
      <GlassCard style={styles.offlineWrap}>
        <View style={styles.offlineRow}>
          <Ionicons name="cloud-offline-outline" size={14} color={palette.saffron} />
          <AppText variant="caption" style={styles.offlineText}>
            Offline
          </AppText>
        </View>
      </GlassCard>
    ) : null}
  </View>
);

const styles = StyleSheet.create({
  container: {
    gap: 8,
  },
  copyWrap: {
    gap: 4,
  },
  subtitle: {
    color: '#B7C5DA',
  },
  offlineWrap: {
    alignSelf: 'flex-start',
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  offlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  offlineText: {
    color: '#FDBA74',
  },
});
