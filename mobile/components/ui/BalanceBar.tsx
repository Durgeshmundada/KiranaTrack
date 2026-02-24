import React from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { palette, radii } from '@/theme/tokens';

interface BalanceBarProps {
  paidPaise: number;
  totalPaise: number;
}

export const BalanceBar: React.FC<BalanceBarProps> = ({ paidPaise, totalPaise }) => {
  const percent = totalPaise === 0 ? 0 : Math.min(1, paidPaise / totalPaise);

  return (
    <View style={styles.wrap}>
      <View style={styles.rail}>
        <View style={[styles.fill, { width: `${percent * 100}%` }]} />
      </View>
      <AppText variant="caption" style={styles.caption}>{`${Math.round(percent * 100)}% paid`}</AppText>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    gap: 6,
  },
  rail: {
    height: 8,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(255,255,255,0.12)',
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: radii.pill,
    backgroundColor: palette.emerald,
  },
  caption: {
    color: '#9FB0CA',
  },
});
