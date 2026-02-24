import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { BillCard } from '@/components/bill/BillCard';
import { ScreenContainer } from '@/components/common/ScreenContainer';
import { ScreenHeader } from '@/components/common/ScreenHeader';
import { AppText } from '@/components/ui/AppText';
import { GlassCard } from '@/components/ui/GlassCard';
import { GradientButton } from '@/components/ui/GradientButton';
import { t } from '@/i18n';
import { useAppStore } from '@/store/appStore';
import { withComputedStatus } from '@/store/selectors';
import { formatINRFromPaise } from '@/utils/currency';
import { formatDisplayDate } from '@/utils/date';

export default function VendorDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  const vendors = useAppStore((state) => state.vendors);
  const bills = useAppStore((state) => state.bills);
  const overdueThresholdDays = useAppStore((state) => state.settings.overdueThresholdDays);

  const vendor = vendors.find((item) => item.id === id);

  if (!vendor) {
    return (
      <ScreenContainer>
        <GlassCard style={styles.missingCard}>
          <AppText variant="subtitle">Vendor not found</AppText>
          <GradientButton label="Back" onPress={() => router.back()} />
        </GlassCard>
      </ScreenContainer>
    );
  }

  const vendorBills = withComputedStatus(
    bills.filter((bill) => bill.vendorId === vendor.id),
    overdueThresholdDays,
  );

  const totalBilled = vendorBills.reduce((sum, bill) => sum + bill.totalAmountPaise, 0);
  const totalOutstanding = vendorBills.reduce((sum, bill) => sum + bill.remainingPaise, 0);

  return (
    <ScreenContainer contentStyle={styles.content}>
      <ScreenHeader title={vendor.name} subtitle={vendor.phone ?? 'No phone'} />

      <GlassCard style={styles.statsCard}>
        <View style={styles.statRow}>
          <AppText variant="caption">Total bills</AppText>
          <AppText variant="label">{String(vendorBills.length)}</AppText>
        </View>
        <View style={styles.statRow}>
          <AppText variant="caption">All-time billed</AppText>
          <AppText variant="label">{formatINRFromPaise(totalBilled)}</AppText>
        </View>
        <View style={styles.statRow}>
          <AppText variant="caption">{t('totalOutstanding')}</AppText>
          <AppText variant="label" style={{ color: '#FCA5A5' }}>
            {formatINRFromPaise(totalOutstanding)}
          </AppText>
        </View>
        <View style={styles.statRow}>
          <AppText variant="caption">Default collector</AppText>
          <AppText variant="label">{vendor.defaultCollectorName ?? '-'}</AppText>
        </View>
      </GlassCard>

      {vendorBills.map((bill, index) => (
        <Pressable key={bill.id} onPress={() => router.push(`/bill/${bill.id}`)}>
          <BillCard
            index={index}
            vendorName={vendor.name}
            billNumber={bill.billNumber}
            dateLabel={formatDisplayDate(bill.date)}
            paidLabel={formatINRFromPaise(bill.paidPaise)}
            totalLabel={formatINRFromPaise(bill.totalAmountPaise)}
            remainingLabel={formatINRFromPaise(bill.remainingPaise)}
            paidPaise={bill.paidPaise}
            totalPaise={bill.totalAmountPaise}
            status={bill.computedStatus}
            statusLabel={t(bill.computedStatus)}
            onPress={() => router.push(`/bill/${bill.id}`)}
          />
        </Pressable>
      ))}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: 12,
  },
  missingCard: {
    marginTop: 40,
    gap: 10,
  },
  statsCard: {
    gap: 6,
  },
  statRow: {
    minHeight: 38,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
});
