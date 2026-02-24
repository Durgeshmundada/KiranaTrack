import { Feather } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  Alert,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { PaymentEntry } from '@/components/bill/PaymentEntry';
import { ScreenContainer } from '@/components/common/ScreenContainer';
import { ScreenHeader } from '@/components/common/ScreenHeader';
import { AppText } from '@/components/ui/AppText';
import { BalanceBar } from '@/components/ui/BalanceBar';
import { GlassCard } from '@/components/ui/GlassCard';
import { GradientButton } from '@/components/ui/GradientButton';
import { PinOverlay } from '@/components/ui/PinOverlay';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { t } from '@/i18n';
import { useAppStore } from '@/store/appStore';
import { resolveVendor } from '@/store/selectors';
import { radii, typography } from '@/theme/tokens';
import type { PaymentMode } from '@/types/models';
import { formatINRFromPaise, rupeeToPaise } from '@/utils/currency';
import { formatDisplayDate } from '@/utils/date';
import { computeBillStatus, remainingPaise, totalPaidPaise } from '@/utils/status';

const modeOptions: PaymentMode[] = ['cash', 'upi', 'cheque', 'other'];

type PendingAction =
  | { type: 'edit'; paymentId: string }
  | { type: 'delete'; paymentId: string }
  | { type: 'deleteBill' }
  | null;

export default function BillDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  const bills = useAppStore((state) => state.bills);
  const vendors = useAppStore((state) => state.vendors);
  const settings = useAppStore((state) => state.settings);
  const addPayment = useAppStore((state) => state.addPayment);
  const editPayment = useAppStore((state) => state.editPayment);
  const deletePayment = useAppStore((state) => state.deletePayment);
  const deleteBill = useAppStore((state) => state.deleteBill);

  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showPinOverlay, setShowPinOverlay] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [editingPaymentId, setEditingPaymentId] = useState<string | null>(null);

  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [collectorName, setCollectorName] = useState('');
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('cash');
  const [notes, setNotes] = useState('');

  const bill = useMemo(() => bills.find((item) => item.id === id), [bills, id]);

  if (!bill) {
    return (
      <ScreenContainer>
        <GlassCard style={styles.centerCard}>
          <AppText variant="subtitle">Bill not found</AppText>
          <GradientButton label="Back to bills" onPress={() => router.replace('/(tabs)/bills')} />
        </GlassCard>
      </ScreenContainer>
    );
  }

  const vendor = resolveVendor(vendors, bill.vendorId);
  const paidPaise = totalPaidPaise(bill);
  const remaining = remainingPaise(bill);
  const status = computeBillStatus(bill, settings.overdueThresholdDays);

  const payments = [...bill.payments].sort((a, b) => b.date.localeCompare(a.date));

  const resetPaymentForm = () => {
    setPaymentAmount('');
    setPaymentDate(new Date().toISOString().slice(0, 10));
    setCollectorName(vendor?.defaultCollectorName ?? '');
    setPaymentMode(settings.defaultPaymentMode);
    setNotes('');
  };

  const openAddModal = () => {
    resetPaymentForm();
    setShowAddModal(true);
  };

  const onSavePayment = async () => {
    const amount = Number(paymentAmount);
    if (Number.isNaN(amount) || amount <= 0) {
      return;
    }

    try {
      await addPayment(bill.id, {
        amountPaise: rupeeToPaise(amount),
        date: new Date(`${paymentDate}T00:00:00.000Z`).toISOString(),
        collectorName: collectorName.trim() || null,
        mode: paymentMode,
        notes: notes.trim() || null,
      });
      setShowAddModal(false);
    } catch {
      Alert.alert('Save failed', 'Could not save payment. Please try again.');
    }
  };

  const onSaveEdit = async () => {
    if (!editingPaymentId) {
      return;
    }
    const amount = Number(paymentAmount);
    if (Number.isNaN(amount) || amount <= 0) {
      return;
    }

    try {
      await editPayment(bill.id, editingPaymentId, {
        amountPaise: rupeeToPaise(amount),
        date: new Date(`${paymentDate}T00:00:00.000Z`).toISOString(),
      });
      setShowEditModal(false);
      setEditingPaymentId(null);
    } catch {
      Alert.alert('Update failed', 'Could not update payment. Please try again.');
    }
  };

  const requestSecureAction = (action: PendingAction) => {
    setPendingAction(action);
    setShowPinOverlay(true);
  };

  const onPinVerified = async () => {
    setShowPinOverlay(false);

    if (!pendingAction) {
      return;
    }

    if (pendingAction.type === 'deleteBill') {
      try {
        await deleteBill(bill.id);
        router.replace('/(tabs)/bills');
        setPendingAction(null);
      } catch {
        Alert.alert('Delete failed', 'Could not delete bill. Please try again.');
      }
      return;
    }

    const target = bill.payments.find((payment) => payment.id === pendingAction.paymentId);
    if (!target) {
      setPendingAction(null);
      return;
    }

    if (pendingAction.type === 'delete') {
      try {
        await deletePayment(bill.id, target.id);
        setPendingAction(null);
      } catch {
        Alert.alert('Delete failed', 'Could not delete payment. Please try again.');
      }
      return;
    }

    setEditingPaymentId(target.id);
    setPaymentAmount(String(Math.round(target.amountPaise / 100)));
    setPaymentDate(target.date.slice(0, 10));
    setCollectorName(target.collectorName ?? '');
    setPaymentMode(target.mode);
    setNotes(target.notes ?? '');
    setShowEditModal(true);
    setPendingAction(null);
  };

  return (
    <ScreenContainer contentStyle={styles.content}>
      <ScreenHeader title={t('billDetails')} subtitle={`${bill.billNumber} • ${formatDisplayDate(bill.date)}`} />

      <GlassCard intense style={styles.heroCard}>
        <Image source={{ uri: bill.imageUrl }} style={styles.image} resizeMode="cover" />
        <View style={styles.heroCopy}>
          <View style={styles.vendorRow}>
            <Pressable onPress={() => router.push(`/vendor/${vendor?.id ?? ''}`)}>
              <AppText variant="subtitle">{vendor?.name ?? t('vendor')}</AppText>
            </Pressable>
            <StatusBadge status={status} label={t(status)} />
          </View>
          <AppText variant="caption">{bill.billNumber}</AppText>
          <AppText variant="caption">{formatDisplayDate(bill.date)}</AppText>
          <View style={styles.totalBar}>
            <AppText variant="label">{`${t('total')}: ${formatINRFromPaise(bill.totalAmountPaise)}`}</AppText>
            <AppText variant="label">{`${t('paid')}: ${formatINRFromPaise(paidPaise)}`}</AppText>
            <AppText variant="label">{`${t('remaining')}: ${formatINRFromPaise(remaining)}`}</AppText>
          </View>
          <BalanceBar paidPaise={paidPaise} totalPaise={bill.totalAmountPaise} />
        </View>
      </GlassCard>

      <View style={styles.sectionHead}>
        <AppText variant="subtitle">{t('recentActivity')}</AppText>
        <Pressable style={styles.deleteBillBtn} onPress={() => requestSecureAction({ type: 'deleteBill' })}>
          <Feather name="trash-2" size={13} color="#fca5a5" />
          <AppText variant="caption" style={{ color: '#fca5a5' }}>
            Delete bill
          </AppText>
        </Pressable>
      </View>

      {payments.length === 0 ? (
        <GlassCard>
          <AppText variant="caption">No payments yet. Log first installment below.</AppText>
        </GlassCard>
      ) : (
        payments.map((payment) => (
          <PaymentEntry
            key={payment.id}
            amountLabel={formatINRFromPaise(payment.amountPaise)}
            date={payment.date}
            collectorName={payment.collectorName}
            mode={payment.mode}
            notes={payment.notes}
            editedAt={payment.editLog.at(-1)?.editedAt ?? null}
            onEdit={() => requestSecureAction({ type: 'edit', paymentId: payment.id })}
            onDelete={() => requestSecureAction({ type: 'delete', paymentId: payment.id })}
          />
        ))
      )}

      <GradientButton label={t('logPayment')} onPress={openAddModal} />

      <PaymentModal
        visible={showAddModal}
        title={t('logPayment')}
        amount={paymentAmount}
        setAmount={setPaymentAmount}
        date={paymentDate}
        setDate={setPaymentDate}
        collectorName={collectorName}
        setCollectorName={setCollectorName}
        notes={notes}
        setNotes={setNotes}
        mode={paymentMode}
        setMode={setPaymentMode}
        onClose={() => setShowAddModal(false)}
        onSave={onSavePayment}
      />

      <PaymentModal
        visible={showEditModal}
        title="Edit Payment"
        amount={paymentAmount}
        setAmount={setPaymentAmount}
        date={paymentDate}
        setDate={setPaymentDate}
        collectorName={collectorName}
        setCollectorName={setCollectorName}
        notes={notes}
        setNotes={setNotes}
        mode={paymentMode}
        setMode={setPaymentMode}
        onClose={() => setShowEditModal(false)}
        onSave={onSaveEdit}
      />

      <PinOverlay
        visible={showPinOverlay}
        onClose={() => setShowPinOverlay(false)}
        onVerified={onPinVerified}
        title={t('pinProtected')}
      />
    </ScreenContainer>
  );
}

interface PaymentModalProps {
  visible: boolean;
  title: string;
  amount: string;
  setAmount: (value: string) => void;
  date: string;
  setDate: (value: string) => void;
  collectorName: string;
  setCollectorName: (value: string) => void;
  mode: PaymentMode;
  setMode: (value: PaymentMode) => void;
  notes: string;
  setNotes: (value: string) => void;
  onClose: () => void;
  onSave: () => void;
}

const PaymentModal: React.FC<PaymentModalProps> = ({
  visible,
  title,
  amount,
  setAmount,
  date,
  setDate,
  collectorName,
  setCollectorName,
  mode,
  setMode,
  notes,
  setNotes,
  onClose,
  onSave,
}) => (
  <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
    <View style={styles.modalBackdrop}>
      <GlassCard intense style={styles.modalCard}>
        <AppText variant="subtitle">{title}</AppText>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.modalFields}>
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

          <View style={styles.field}>
            <AppText variant="caption">{t('collectorName')}</AppText>
            <TextInput
              value={collectorName}
              onChangeText={setCollectorName}
              placeholder="Collector"
              placeholderTextColor="#94A3B8"
              style={styles.input}
            />
          </View>

          <View style={styles.field}>
            <AppText variant="caption">{t('mode')}</AppText>
            <View style={styles.modeRow}>
              {modeOptions.map((value) => {
                const active = value === mode;
                return (
                  <Pressable
                    key={value}
                    onPress={() => setMode(value)}
                    style={[styles.modeChip, active && styles.modeChipActive]}>
                    <AppText variant="caption" style={active ? styles.modeCopyActive : styles.modeCopy}>
                      {value.toUpperCase()}
                    </AppText>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={styles.field}>
            <AppText variant="caption">{t('notes')}</AppText>
            <TextInput
              value={notes}
              onChangeText={setNotes}
              placeholder="Optional notes"
              placeholderTextColor="#94A3B8"
              style={[styles.input, { minHeight: 78, textAlignVertical: 'top' }]}
              multiline
            />
          </View>
        </ScrollView>

        <View style={styles.modalActions}>
          <Pressable style={styles.cancelButton} onPress={onClose}>
            <AppText variant="label">{t('cancel')}</AppText>
          </Pressable>
          <GradientButton label={t('save')} onPress={onSave} />
        </View>
      </GlassCard>
    </View>
  </Modal>
);

const styles = StyleSheet.create({
  content: {
    gap: 12,
  },
  centerCard: {
    marginTop: 60,
    gap: 10,
  },
  heroCard: {
    gap: 10,
  },
  image: {
    width: '100%',
    height: 180,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  heroCopy: {
    gap: 8,
  },
  vendorRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
    alignItems: 'center',
  },
  totalBar: {
    gap: 2,
  },
  sectionHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  deleteBillBtn: {
    minHeight: 32,
    borderRadius: radii.pill,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: 'rgba(252,165,165,0.4)',
    backgroundColor: 'rgba(239,68,68,0.12)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(2,6,23,0.72)',
    paddingHorizontal: 12,
    paddingBottom: 12,
  },
  modalCard: {
    borderRadius: radii.lg,
    maxHeight: '88%',
    gap: 10,
  },
  modalFields: {
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
    backgroundColor: 'rgba(15,23,42,0.4)',
    color: '#F8FAFC',
    paddingHorizontal: 12,
    fontFamily: typography.body,
  },
  modeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  modeChip: {
    minHeight: 34,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    paddingHorizontal: 10,
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.07)',
  },
  modeChipActive: {
    borderColor: 'rgba(251,146,60,0.9)',
    backgroundColor: 'rgba(251,146,60,0.2)',
  },
  modeCopy: {
    color: '#CBD5E1',
  },
  modeCopyActive: {
    color: '#FFE7C2',
  },
  modalActions: {
    gap: 10,
  },
  cancelButton: {
    minHeight: 48,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
});
