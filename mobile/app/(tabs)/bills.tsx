import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { BillCard } from '@/components/bill/BillCard';
import { EmptyState } from '@/components/common/EmptyState';
import { ScreenContainer } from '@/components/common/ScreenContainer';
import { ScreenHeader } from '@/components/common/ScreenHeader';
import { SubscriptionNotice } from '@/components/subscription/SubscriptionNotice';
import { AppText } from '@/components/ui/AppText';
import { GradientButton } from '@/components/ui/GradientButton';
import { t } from '@/i18n';
import { useAppStore } from '@/store/appStore';
import { resolveVendor, withComputedStatus } from '@/store/selectors';
import { radii, typography } from '@/theme/tokens';
import type { BillStatus } from '@/types/models';
import { formatINRFromPaise } from '@/utils/currency';
import { formatDisplayDate } from '@/utils/date';

const filterTabs: Array<{ key: 'all' | BillStatus; label: string }> = [
  { key: 'all', label: t('all') },
  { key: 'unpaid', label: t('unpaid') },
  { key: 'partial', label: t('partial') },
  { key: 'overdue', label: t('overdue') },
  { key: 'cleared', label: t('cleared') },
];

export default function BillsScreen() {
  const [query, setQuery] = useState('');
  const [activeTab, setActiveTab] = useState<(typeof filterTabs)[number]['key']>('all');

  const bills = useAppStore((state) => state.bills);
  const vendors = useAppStore((state) => state.vendors);
  const overdueThresholdDays = useAppStore((state) => state.settings.overdueThresholdDays);
  const subscription = useAppStore((state) => state.subscription);

  const computedBills = useMemo(() => withComputedStatus(bills, overdueThresholdDays), [bills, overdueThresholdDays]);

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return computedBills
      .filter((bill) => {
        if (activeTab === 'all') {
          return true;
        }
        return bill.computedStatus === activeTab;
      })
      .filter((bill) => {
        if (!normalizedQuery) {
          return true;
        }
        const vendorName = resolveVendor(vendors, bill.vendorId)?.name?.toLowerCase() ?? '';
        return (
          vendorName.includes(normalizedQuery) ||
          bill.billNumber.toLowerCase().includes(normalizedQuery)
        );
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [activeTab, computedBills, query, vendors]);

  const openScan = () => {
    if (!subscription?.canUseFeatures) {
      Alert.alert(
        subscription?.alertTitle ?? 'Subscription required',
        subscription?.alertMessage ??
          'Set up Rs 1/month auto pay to unlock editing features.',
      );
      return;
    }
    router.push('/scan');
  };

  return (
    <ScreenContainer contentStyle={styles.content}>
      <ScreenHeader title={t('bills')} subtitle={`${filtered.length} records`} />
      <SubscriptionNotice />

      <View style={styles.searchWrap}>
        <Feather name="search" size={16} color="#A4B1C7" />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={t('searchBills')}
          placeholderTextColor="#94A3B8"
          style={styles.searchInput}
        />
      </View>

      <GradientButton
        label={t('scanNewBill')}
        onPress={openScan}
        icon={<Feather name="camera" size={16} color="#0B1120" />}
      />

      <View style={styles.tabsWrap}>
        {filterTabs.map((tab) => {
          const active = tab.key === activeTab;
          return (
            <Pressable
              key={tab.key}
              onPress={() => setActiveTab(tab.key)}
              style={[styles.tabBtn, active && styles.tabBtnActive]}>
              <AppText variant="caption" style={[styles.tabCopy, active && styles.tabCopyActive]}>
                {tab.label}
              </AppText>
            </Pressable>
          );
        })}
      </View>

      {filtered.length === 0 ? (
        <EmptyState icon="inbox" title={t('bills')} subtitle={t('emptyBills')} />
      ) : (
        filtered.map((bill, index) => {
          const vendor = resolveVendor(vendors, bill.vendorId);
          return (
            <BillCard
              key={bill.id}
              index={index}
              vendorName={vendor?.name ?? 'Unknown Vendor'}
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
          );
        })
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: 12,
  },
  searchWrap: {
    minHeight: 50,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    backgroundColor: 'rgba(15,23,42,0.35)',
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  searchInput: {
    flex: 1,
    color: '#F8FAFC',
    fontFamily: typography.body,
    fontSize: 15,
  },
  tabsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tabBtn: {
    minHeight: 36,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    paddingHorizontal: 12,
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  tabBtnActive: {
    borderColor: 'rgba(251, 146, 60, 0.9)',
    backgroundColor: 'rgba(251, 146, 60, 0.24)',
  },
  tabCopy: {
    color: '#D0DCEF',
  },
  tabCopyActive: {
    color: '#FFE7C2',
  },
});
