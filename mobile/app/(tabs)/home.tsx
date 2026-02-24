import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { ScreenContainer } from '@/components/common/ScreenContainer';
import { ScreenHeader } from '@/components/common/ScreenHeader';
import { AppText } from '@/components/ui/AppText';
import { GlassCard } from '@/components/ui/GlassCard';
import { GradientButton } from '@/components/ui/GradientButton';
import { MetricCard } from '@/components/ui/MetricCard';
import { t } from '@/i18n';
import { dashboardSummary, recentPayments, resolveVendor, totalsForCustomers, withComputedStatus } from '@/store/selectors';
import { gradients, palette } from '@/theme/tokens';
import { useAppStore } from '@/store/appStore';
import { formatCompactINRFromPaise, formatINRFromPaise } from '@/utils/currency';
import { daysSince, formatDisplayDate } from '@/utils/date';

export default function HomeDashboardScreen() {
  const bills = useAppStore((state) => state.bills);
  const vendors = useAppStore((state) => state.vendors);
  const customers = useAppStore((state) => state.customers);
  const outOfStockItems = useAppStore((state) => state.outOfStockItems);
  const settings = useAppStore((state) => state.settings);
  const isOffline = useAppStore((state) => state.isOffline);

  const pendingNotepadCount = outOfStockItems.filter((item) => item.status === 'pending').length;
  const summary = dashboardSummary(bills, settings.overdueThresholdDays, pendingNotepadCount);
  const statuses = withComputedStatus(bills, settings.overdueThresholdDays);
  const receivable = totalsForCustomers(customers).receivablePaise;
  const netPosition = receivable - summary.totalOutstandingPaise;

  const overdueTop = statuses
    .filter((bill) => bill.computedStatus === 'overdue')
    .sort((a, b) => b.remainingPaise - a.remainingPaise)
    .slice(0, 3);

  const activities = recentPayments(bills, vendors);

  return (
    <ScreenContainer contentStyle={styles.content}>
      <ScreenHeader
        title={t('appName')}
        subtitle="Supplier bills, payments and udhaar in one place"
        offline={isOffline}
        rightNode={
          <Pressable style={styles.settingsBtn} onPress={() => router.push('/settings')}>
            <Feather name="settings" size={16} color={palette.white} />
          </Pressable>
        }
      />

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.metricsRow}>
        <MetricCard
          title={t('totalOutstanding')}
          value={formatCompactINRFromPaise(summary.totalOutstandingPaise)}
          subtitle={`${summary.overdueCount} ${t('overdueBills').toLowerCase()}`}
          colors={gradients.metricWarm}
        />
        <MetricCard
          title={t('customersOweMe')}
          value={formatCompactINRFromPaise(receivable)}
          subtitle={t('udhaar')}
          colors={gradients.metricCool}
        />
        <MetricCard
          title={t('myNetPosition')}
          value={formatCompactINRFromPaise(netPosition)}
          subtitle={netPosition >= 0 ? 'Healthy cash signal' : 'Cash stress alert'}
          colors={netPosition >= 0 ? gradients.metricSuccess : gradients.metricNeutral}
        />
      </ScrollView>

      <GlassCard style={styles.section}>
        <AppText variant="subtitle">{t('overdueBills')}</AppText>
        {overdueTop.length === 0 ? (
          <AppText variant="caption">No overdue bills. Great control.</AppText>
        ) : (
          overdueTop.map((bill, index) => {
            const vendor = resolveVendor(vendors, bill.vendorId);
            return (
              <Animated.View key={bill.id} entering={FadeInDown.delay(index * 80).springify()}>
                <Pressable style={styles.overdueItem} onPress={() => router.push(`/bill/${bill.id}`)}>
                  <View>
                    <AppText variant="label">{vendor?.name ?? 'Unknown Vendor'}</AppText>
                    <AppText variant="caption">{`${daysSince(bill.date)} days overdue • ${bill.billNumber}`}</AppText>
                  </View>
                  <AppText variant="label" style={styles.overdueAmount}>
                    {formatINRFromPaise(bill.remainingPaise)}
                  </AppText>
                </Pressable>
              </Animated.View>
            );
          })
        )}
      </GlassCard>

      <GlassCard style={styles.section}>
        <AppText variant="subtitle">{t('recentActivity')}</AppText>
        {activities.length === 0 ? (
          <AppText variant="caption">No payments logged yet.</AppText>
        ) : (
          activities.map((payment, index) => (
            <Animated.View key={payment.id} entering={FadeInDown.delay(index * 60).springify()}>
              <View style={styles.activityRow}>
                <View style={styles.activityCopy}>
                  <AppText variant="label">{payment.vendorName}</AppText>
                  <AppText variant="caption">{`${payment.billNumber} • ${formatDisplayDate(payment.date)}`}</AppText>
                </View>
                <AppText variant="label">{formatINRFromPaise(payment.amountPaise)}</AppText>
              </View>
            </Animated.View>
          ))
        )}
      </GlassCard>

      <View style={styles.fabWrap}>
        <GradientButton
          label={t('scanNewBill')}
          onPress={() => router.push('/scan')}
          icon={<Feather name="camera" size={16} color="#0B1120" />}
        />
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: 14,
  },
  settingsBtn: {
    alignSelf: 'flex-start',
    width: 36,
    height: 36,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  metricsRow: {
    gap: 12,
    paddingRight: 6,
  },
  section: {
    gap: 10,
  },
  overdueItem: {
    minHeight: 52,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
    gap: 8,
  },
  overdueAmount: {
    color: '#FCA5A5',
  },
  activityRow: {
    minHeight: 52,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
    gap: 8,
  },
  activityCopy: {
    gap: 1,
    flex: 1,
  },
  fabWrap: {
    marginTop: 4,
  },
});
