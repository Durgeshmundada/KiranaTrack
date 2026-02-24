import React from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { palette, radii } from '@/theme/tokens';
import type { BillStatus } from '@/types/models';

const statusStyle: Record<BillStatus, { bg: string; text: string }> = {
  overdue: { bg: 'rgba(220, 38, 38, 0.2)', text: palette.crimson },
  partial: { bg: 'rgba(245, 158, 11, 0.2)', text: palette.saffron },
  cleared: { bg: 'rgba(34, 197, 94, 0.2)', text: palette.emerald },
  unpaid: { bg: 'rgba(148, 163, 184, 0.2)', text: '#CBD5E1' },
};

interface StatusBadgeProps {
  status: BillStatus;
  label: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, label }) => (
  <View style={[styles.pill, { backgroundColor: statusStyle[status].bg }]}> 
    <AppText variant="caption" style={[styles.label, { color: statusStyle[status].text }]}> 
      {label}
    </AppText>
  </View>
);

const styles = StyleSheet.create({
  pill: {
    borderRadius: radii.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
    alignSelf: 'flex-start',
  },
  label: {
    textTransform: 'capitalize',
  },
});
