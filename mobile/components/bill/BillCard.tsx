import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { FontAwesome6 } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { AppText } from '@/components/ui/AppText';
import { BalanceBar } from '@/components/ui/BalanceBar';
import { GlassCard } from '@/components/ui/GlassCard';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { gradients, radii, spacing } from '@/theme/tokens';
import type { BillStatus } from '@/types/models';

interface BillCardProps {
  vendorName: string;
  billNumber: string;
  dateLabel: string;
  paidLabel: string;
  totalLabel: string;
  remainingLabel: string;
  paidPaise: number;
  totalPaise: number;
  status: BillStatus;
  statusLabel: string;
  onPress: () => void;
  index?: number;
}

export const BillCard: React.FC<BillCardProps> = ({
  vendorName,
  billNumber,
  dateLabel,
  paidLabel,
  totalLabel,
  remainingLabel,
  paidPaise,
  totalPaise,
  status,
  statusLabel,
  onPress,
  index = 0,
}) => (
  <Animated.View entering={FadeInDown.delay(index * 70).springify()}>
    <Pressable onPress={onPress}>
      <GlassCard intense style={styles.card}>
        <View style={styles.topRow}>
          <View style={styles.vendorWrap}>
            <AppText variant="subtitle">{vendorName}</AppText>
            <AppText variant="caption" style={styles.billNo}>{`${billNumber} • ${dateLabel}`}</AppText>
          </View>
          <StatusBadge status={status} label={statusLabel} />
        </View>

        <View style={styles.balanceWrap}>
          <BalanceBar paidPaise={paidPaise} totalPaise={totalPaise} />
          <View style={styles.amounts}>
            <AppText variant="caption" style={styles.amountCopy}>{`Paid ${paidLabel}`}</AppText>
            <AppText variant="caption" style={styles.amountCopy}>{`Total ${totalLabel}`}</AppText>
            <AppText variant="label" style={styles.remainingCopy}>{`Remaining ${remainingLabel}`}</AppText>
          </View>
        </View>

        <LinearGradient colors={gradients.glassShine} style={styles.footerLine}>
          <FontAwesome6 name="angle-right" size={13} color="#E2E8F0" />
          <AppText variant="caption">Tap to view payments</AppText>
        </LinearGradient>
      </GlassCard>
    </Pressable>
  </Animated.View>
);

const styles = StyleSheet.create({
  card: {
    gap: spacing.md,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  vendorWrap: {
    gap: 2,
    flex: 1,
  },
  billNo: {
    color: '#A8B6CC',
  },
  balanceWrap: {
    gap: 8,
  },
  amounts: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 8,
  },
  amountCopy: {
    color: '#CCD8E8',
  },
  remainingCopy: {
    color: '#F8FAFC',
  },
  footerLine: {
    borderRadius: radii.md,
    minHeight: 36,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
  },
});
