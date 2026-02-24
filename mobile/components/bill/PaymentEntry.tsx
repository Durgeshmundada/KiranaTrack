import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { GlassCard } from '@/components/ui/GlassCard';
import { formatDisplayDateTime } from '@/utils/date';

interface PaymentEntryProps {
  amountLabel: string;
  date: string;
  collectorName: string | null;
  mode: string;
  notes: string | null;
  editedAt: string | null;
  onEdit?: () => void;
  onDelete?: () => void;
}

export const PaymentEntry: React.FC<PaymentEntryProps> = ({
  amountLabel,
  date,
  collectorName,
  mode,
  notes,
  editedAt,
  onEdit,
  onDelete,
}) => (
  <GlassCard style={styles.card}>
    <View style={styles.head}>
      <AppText variant="subtitle">{amountLabel}</AppText>
      <View style={styles.actions}>
        {onEdit ? (
          <Pressable onPress={onEdit} style={styles.actionBtn}>
            <AppText variant="caption">Edit</AppText>
          </Pressable>
        ) : null}
        {onDelete ? (
          <Pressable onPress={onDelete} style={styles.actionBtn}>
            <AppText variant="caption" style={styles.deleteText}>
              Delete
            </AppText>
          </Pressable>
        ) : null}
      </View>
    </View>

    <AppText variant="caption" style={styles.meta}>{`${formatDisplayDateTime(date)} • ${collectorName ?? '-'} • ${mode.toUpperCase()}`}</AppText>
    {notes ? <AppText variant="caption">{notes}</AppText> : null}
    {editedAt ? (
      <AppText variant="caption" style={styles.editedTag}>{`Edited on ${formatDisplayDateTime(editedAt)}`}</AppText>
    ) : null}
  </GlassCard>
);

const styles = StyleSheet.create({
  card: {
    gap: 8,
  },
  head: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionBtn: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  deleteText: {
    color: '#FCA5A5',
  },
  meta: {
    color: '#A8B6CC',
  },
  editedTag: {
    color: '#FDE68A',
  },
});
