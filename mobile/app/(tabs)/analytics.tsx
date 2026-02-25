import { StyleSheet, View } from 'react-native';

import { ScreenContainer } from '@/components/common/ScreenContainer';
import { ScreenHeader } from '@/components/common/ScreenHeader';
import { AppText } from '@/components/ui/AppText';
import { GlassCard } from '@/components/ui/GlassCard';
import { t } from '@/i18n';
import { useAppStore } from '@/store/appStore';
import {
  monthlySpend,
  statusBreakdown,
  totalsForCustomers,
  vendorWiseOutstanding,
  withComputedStatus,
} from '@/store/selectors';
import { formatCompactINRFromPaise, formatINRFromPaise } from '@/utils/currency';
import { monthLabel } from '@/utils/date';

const median = (values: number[]): number => {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1] + sorted[middle]) / 2;
  }
  return sorted[middle];
};

export default function AnalyticsScreen() {
  const bills = useAppStore((state) => state.bills);
  const vendors = useAppStore((state) => state.vendors);
  const customers = useAppStore((state) => state.customers);
  const overdueThresholdDays = useAppStore((state) => state.settings.overdueThresholdDays);

  const vendorOutstanding = vendorWiseOutstanding(bills, vendors, overdueThresholdDays).slice(0, 6);
  const spendTrend = monthlySpend(bills);
  const breakdown = statusBreakdown(bills, overdueThresholdDays);
  const statusReady = withComputedStatus(bills, overdueThresholdDays);

  const outstandingTotal = statusReady.reduce((sum, bill) => sum + bill.remainingPaise, 0);
  const receivableTotal = totalsForCustomers(customers).receivablePaise;
  const netPosition = receivableTotal - outstandingTotal;

  const anomalyCandidates = (() => {
    const groupedRates = new Map<
      string,
      Array<{ billId: string; itemName: string; ratePaise: number; billDate: string }>
    >();

    statusReady.forEach((bill) => {
      bill.lineItems.forEach((lineItem) => {
        if (lineItem.ratePaise <= 0) {
          return;
        }

        const key = `${bill.vendorId}::${lineItem.name.trim().toLowerCase()}`;
        const current = groupedRates.get(key) ?? [];
        current.push({
          billId: bill.id,
          itemName: lineItem.name,
          ratePaise: lineItem.ratePaise,
          billDate: bill.date,
        });
        groupedRates.set(key, current);
      });
    });

    return [...groupedRates.entries()]
      .filter(([, points]) => points.length >= 3)
      .map(([key, points]) => {
        const [vendorId] = key.split('::');
        const ordered = [...points].sort(
          (a, b) => new Date(b.billDate).getTime() - new Date(a.billDate).getTime(),
        );
        const latest = ordered[0];
        const historicalRates = ordered.slice(1).map((point) => point.ratePaise);
        const baselineRate = median(historicalRates);
        if (baselineRate <= 0) {
          return null;
        }

        if (latest.ratePaise < baselineRate * 1.15) {
          return null;
        }

        return {
          id: `${latest.billId}-${key}`,
          item: latest.itemName,
          deltaPaise: latest.ratePaise - Math.round(baselineRate),
          vendorName: vendors.find((vendor) => vendor.id === vendorId)?.name ?? 'Vendor',
        };
      })
      .filter((row): row is NonNullable<typeof row> => Boolean(row))
      .sort((a, b) => b.deltaPaise - a.deltaPaise)
      .slice(0, 3);
  })();

  return (
    <ScreenContainer contentStyle={styles.content}>
      <ScreenHeader title={t('analytics')} subtitle={t('netPosition')} />

      <GlassCard style={styles.card}>
        <AppText variant="subtitle">{t('vendorOutstanding')}</AppText>
        {vendorOutstanding.length === 0 ? (
          <AppText variant="caption">Add bills to view chart.</AppText>
        ) : (
          <View style={styles.barGroup}>
            {vendorOutstanding.map((item) => {
              const maxValue = vendorOutstanding[0]?.outstandingPaise || 1;
              const widthPercent = Math.max(8, Math.round((item.outstandingPaise / maxValue) * 100));
              return (
                <View key={item.vendorName} style={styles.barRow}>
                  <View style={styles.barLabelWrap}>
                    <AppText variant="caption">{item.vendorName}</AppText>
                    <AppText variant="caption">{formatCompactINRFromPaise(item.outstandingPaise)}</AppText>
                  </View>
                  <View style={styles.barTrack}>
                    <View style={[styles.barFillWarm, { width: `${widthPercent}%` }]} />
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </GlassCard>

      <GlassCard style={styles.card}>
        <AppText variant="subtitle">{t('monthlySpend')}</AppText>
        {spendTrend.length === 0 ? (
          <AppText variant="caption">No payment trend available.</AppText>
        ) : (
          <View style={styles.barGroup}>
            {spendTrend.map((item) => {
              const peak = Math.max(...spendTrend.map((row) => row.totalPaidPaise), 1);
              const widthPercent = Math.max(10, Math.round((item.totalPaidPaise / peak) * 100));
              return (
                <View key={item.month} style={styles.barRow}>
                  <View style={styles.barLabelWrap}>
                    <AppText variant="caption">{monthLabel(`${item.month}-01T00:00:00.000Z`)}</AppText>
                    <AppText variant="caption">{formatCompactINRFromPaise(item.totalPaidPaise)}</AppText>
                  </View>
                  <View style={styles.barTrack}>
                    <View style={[styles.barFillCool, { width: `${widthPercent}%` }]} />
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </GlassCard>

      <GlassCard style={styles.card}>
        <AppText variant="subtitle">{t('statusBreakdown')}</AppText>
        {breakdown.every((item) => item.count === 0) ? (
          <AppText variant="caption">Status chart appears after bill creation.</AppText>
        ) : (
          <View style={styles.breakdownWrap}>
            {breakdown.map((item) => {
              const total = breakdown.reduce((sum, row) => sum + row.count, 0) || 1;
              const widthPercent = Math.round((item.count / total) * 100);
              const color =
                item.status === 'overdue'
                  ? '#ef4444'
                  : item.status === 'partial'
                    ? '#f59e0b'
                    : item.status === 'unpaid'
                      ? '#94a3b8'
                      : '#22c55e';

              return (
                <View key={item.status} style={styles.breakdownRow}>
                  <View style={styles.breakdownLabel}>
                    <View style={[styles.breakdownDot, { backgroundColor: color }]} />
                    <AppText variant="caption">{item.status.toUpperCase()}</AppText>
                  </View>
                  <View style={styles.breakdownTrack}>
                    <View style={[styles.breakdownFill, { width: `${Math.max(6, widthPercent)}%`, backgroundColor: color }]} />
                  </View>
                  <AppText variant="caption">{item.count}</AppText>
                </View>
              );
            })}
          </View>
        )}
      </GlassCard>

      <GlassCard style={styles.card}>
        <AppText variant="subtitle">{t('netPosition')}</AppText>
        <View style={styles.netRow}>
          <AppText variant="caption">{t('iOweSuppliers')}</AppText>
          <AppText variant="label">{formatINRFromPaise(outstandingTotal)}</AppText>
        </View>
        <View style={styles.netRow}>
          <AppText variant="caption">{t('customersOweMe')}</AppText>
          <AppText variant="label">{formatINRFromPaise(receivableTotal)}</AppText>
        </View>
        <View style={styles.netRow}>
          <AppText variant="caption">{t('myNetPosition')}</AppText>
          <AppText
            variant="subtitle"
            style={{ color: netPosition >= 0 ? '#86efac' : '#fca5a5' }}>
            {formatCompactINRFromPaise(netPosition)}
          </AppText>
        </View>
      </GlassCard>

      <GlassCard style={styles.card}>
        <AppText variant="subtitle">{t('priceAnomalies')}</AppText>
        {anomalyCandidates.length === 0 ? (
          <AppText variant="caption">Need 3+ bills per item to compute anomalies.</AppText>
        ) : (
          anomalyCandidates.map((item) => (
            <View key={item.id} style={styles.alertRow}>
              <View style={styles.alertCopy}>
                <AppText variant="label">{item.item}</AppText>
                <AppText variant="caption">{item.vendorName}</AppText>
              </View>
              <AppText variant="label" style={{ color: '#fca5a5' }}>
                +{formatCompactINRFromPaise(item.deltaPaise)}
              </AppText>
            </View>
          ))
        )}
      </GlassCard>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: 12,
  },
  card: {
    gap: 10,
  },
  barGroup: {
    gap: 10,
  },
  barRow: {
    gap: 6,
  },
  barLabelWrap: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  barTrack: {
    height: 10,
    borderRadius: 99,
    backgroundColor: 'rgba(255,255,255,0.1)',
    overflow: 'hidden',
  },
  barFillWarm: {
    height: '100%',
    borderRadius: 99,
    backgroundColor: '#fb923c',
  },
  barFillCool: {
    height: '100%',
    borderRadius: 99,
    backgroundColor: '#22d3ee',
  },
  breakdownWrap: {
    gap: 10,
  },
  breakdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  breakdownLabel: {
    width: 84,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  breakdownDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  breakdownTrack: {
    flex: 1,
    height: 10,
    borderRadius: 99,
    backgroundColor: 'rgba(255,255,255,0.1)',
    overflow: 'hidden',
  },
  breakdownFill: {
    height: '100%',
    borderRadius: 99,
  },
  netRow: {
    minHeight: 38,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  alertRow: {
    minHeight: 46,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(252,165,165,0.2)',
    backgroundColor: 'rgba(239,68,68,0.12)',
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  alertCopy: {
    gap: 2,
    flex: 1,
  },
});
