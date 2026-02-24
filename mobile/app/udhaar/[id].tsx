import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Modal, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { ScreenContainer } from '@/components/common/ScreenContainer';
import { ScreenHeader } from '@/components/common/ScreenHeader';
import { AppText } from '@/components/ui/AppText';
import { GlassCard } from '@/components/ui/GlassCard';
import { GradientButton } from '@/components/ui/GradientButton';
import { PinOverlay } from '@/components/ui/PinOverlay';
import { t } from '@/i18n';
import { useAppStore } from '@/store/appStore';
import { customerBalancePaise } from '@/store/selectors';
import { radii, typography } from '@/theme/tokens';
import type { UdhaarEntryType } from '@/types/models';
import { formatINRFromPaise, rupeeToPaise } from '@/utils/currency';
import { formatDisplayDate } from '@/utils/date';

type EntryFormState = {
  visible: boolean;
  type: UdhaarEntryType;
};

const initialFormState: EntryFormState = {
  visible: false,
  type: 'credit',
};

export default function UdhaarDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  const customers = useAppStore((state) => state.customers);
  const addUdhaarEntry = useAppStore((state) => state.addUdhaarEntry);
  const deleteUdhaarEntry = useAppStore((state) => state.deleteUdhaarEntry);

  const [form, setForm] = useState<EntryFormState>(initialFormState);
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));

  const [entryToDelete, setEntryToDelete] = useState<string | null>(null);
  const [showPin, setShowPin] = useState(false);

  const customer = useMemo(() => customers.find((item) => item.id === id), [customers, id]);

  if (!customer) {
    return (
      <ScreenContainer>
        <GlassCard style={styles.fallbackCard}>
          <AppText variant="subtitle">Customer not found</AppText>
          <GradientButton label="Back" onPress={() => router.back()} />
        </GlassCard>
      </ScreenContainer>
    );
  }

  const entries = [...customer.entries].sort((a, b) => b.date.localeCompare(a.date));
  const totalCredit = customer.entries
    .filter((entry) => entry.type === 'credit')
    .reduce((sum, entry) => sum + entry.amountPaise, 0);
  const totalRepayment = customer.entries
    .filter((entry) => entry.type === 'repayment')
    .reduce((sum, entry) => sum + entry.amountPaise, 0);
  const balance = customerBalancePaise(customer);

  const openForm = (type: UdhaarEntryType) => {
    setAmount('');
    setDescription('');
    setDate(new Date().toISOString().slice(0, 10));
    setForm({ visible: true, type });
  };

  const submitEntry = async () => {
    const numericAmount = Number(amount);
    if (Number.isNaN(numericAmount) || numericAmount <= 0) {
      return;
    }

    try {
      await addUdhaarEntry(
        customer.id,
        form.type,
        rupeeToPaise(numericAmount),
        description.trim() || null,
        new Date(`${date}T00:00:00.000Z`).toISOString(),
      );
      setForm(initialFormState);
    } catch {
      Alert.alert('Save failed', 'Could not add entry. Please try again.');
    }
  };

  const requestDelete = (entryId: string) => {
    setEntryToDelete(entryId);
    setShowPin(true);
  };

  const onPinVerified = async () => {
    setShowPin(false);
    if (!entryToDelete) {
      return;
    }
    try {
      await deleteUdhaarEntry(customer.id, entryToDelete);
      setEntryToDelete(null);
    } catch {
      Alert.alert('Delete failed', 'Could not delete entry. Please try again.');
    }
  };

  return (
    <ScreenContainer contentStyle={styles.content}>
      <ScreenHeader title={customer.customerName} subtitle={customer.phone ?? 'No phone'} />

      <GlassCard intense style={styles.balanceCard}>
        <View style={styles.balanceRow}>
          <View style={styles.balanceBlock}>
            <AppText variant="caption">Total Given</AppText>
            <AppText variant="label">{formatINRFromPaise(totalCredit)}</AppText>
          </View>
          <View style={styles.balanceBlock}>
            <AppText variant="caption">Total Repaid</AppText>
            <AppText variant="label">{formatINRFromPaise(totalRepayment)}</AppText>
          </View>
        </View>
        <View style={styles.currentBalance}>
          <AppText variant="caption">{t('balance')}</AppText>
          <AppText
            variant="title"
            style={{ fontSize: 30, color: balance > 0 ? '#fca5a5' : '#86efac' }}>
            {formatINRFromPaise(balance)}
          </AppText>
        </View>
      </GlassCard>

      <View style={styles.ctaRow}>
        <GradientButton label={t('addCredit')} onPress={() => openForm('credit')} />
        <GradientButton
          label={t('addRepayment')}
          onPress={() => openForm('repayment')}
          variant="accent"
        />
      </View>

      <GlassCard style={styles.entriesCard}>
        <AppText variant="subtitle">Entry Log</AppText>
        {entries.length === 0 ? (
          <AppText variant="caption">No entries yet.</AppText>
        ) : (
          entries.map((entry) => (
            <Pressable
              key={entry.id}
              onLongPress={() => requestDelete(entry.id)}
              style={[
                styles.entryRow,
                {
                  borderColor:
                    entry.type === 'credit'
                      ? 'rgba(252,165,165,0.32)'
                      : 'rgba(134,239,172,0.34)',
                  backgroundColor:
                    entry.type === 'credit'
                      ? 'rgba(239,68,68,0.12)'
                      : 'rgba(22,163,74,0.14)',
                },
              ]}>
              <View style={{ gap: 1, flex: 1 }}>
                <AppText variant="label">{entry.description ?? entry.type.toUpperCase()}</AppText>
                <AppText variant="caption">{formatDisplayDate(entry.date)}</AppText>
              </View>
              <AppText
                variant="label"
                style={{ color: entry.type === 'credit' ? '#fecaca' : '#bbf7d0' }}>
                {entry.type === 'credit' ? '-' : '+'}
                {formatINRFromPaise(entry.amountPaise)}
              </AppText>
            </Pressable>
          ))
        )}
      </GlassCard>

      <Modal visible={form.visible} transparent animationType="slide" onRequestClose={() => setForm(initialFormState)}>
        <View style={styles.modalBackdrop}>
          <GlassCard intense style={styles.modalCard}>
            <AppText variant="subtitle">{form.type === 'credit' ? t('addCredit') : t('addRepayment')}</AppText>

            <View style={styles.field}>
              <AppText variant="caption">{t('amount')}</AppText>
              <TextInput
                value={amount}
                onChangeText={setAmount}
                keyboardType="numeric"
                placeholder="0"
                placeholderTextColor="#94A3B8"
                style={styles.input}
              />
            </View>

            <View style={styles.field}>
              <AppText variant="caption">{t('date')}</AppText>
              <TextInput
                value={date}
                onChangeText={setDate}
                placeholder="YYYY-MM-DD"
                placeholderTextColor="#94A3B8"
                style={styles.input}
              />
            </View>

            {form.type === 'credit' ? (
              <View style={styles.field}>
                <AppText variant="caption">Description</AppText>
                <TextInput
                  value={description}
                  onChangeText={setDescription}
                  placeholder="Optional item details"
                  placeholderTextColor="#94A3B8"
                  style={styles.input}
                />
              </View>
            ) : null}

            <View style={styles.modalActions}>
              <Pressable style={styles.cancelBtn} onPress={() => setForm(initialFormState)}>
                <AppText variant="label">{t('cancel')}</AppText>
              </Pressable>
              <GradientButton label={t('save')} onPress={submitEntry} />
            </View>
          </GlassCard>
        </View>
      </Modal>

      <PinOverlay
        visible={showPin}
        onClose={() => setShowPin(false)}
        onVerified={onPinVerified}
        title={t('pinProtected')}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: 12,
  },
  fallbackCard: {
    marginTop: 40,
    gap: 10,
  },
  balanceCard: {
    gap: 12,
  },
  balanceRow: {
    flexDirection: 'row',
    gap: 10,
  },
  balanceBlock: {
    flex: 1,
    gap: 2,
  },
  currentBalance: {
    gap: 2,
  },
  ctaRow: {
    gap: 10,
  },
  entriesCard: {
    gap: 8,
  },
  entryRow: {
    minHeight: 56,
    borderRadius: radii.md,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(2,6,23,0.72)',
    paddingHorizontal: 12,
    paddingBottom: 12,
  },
  modalCard: {
    gap: 10,
  },
  field: {
    gap: 4,
  },
  input: {
    minHeight: 48,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    backgroundColor: 'rgba(15,23,42,0.35)',
    color: '#F8FAFC',
    fontFamily: typography.body,
    paddingHorizontal: 12,
  },
  modalActions: {
    gap: 10,
  },
  cancelBtn: {
    minHeight: 46,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    backgroundColor: 'rgba(255,255,255,0.08)',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
