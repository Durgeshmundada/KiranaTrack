import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, TextInput, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { EmptyState } from '@/components/common/EmptyState';
import { ScreenContainer } from '@/components/common/ScreenContainer';
import { ScreenHeader } from '@/components/common/ScreenHeader';
import { AppText } from '@/components/ui/AppText';
import { GlassCard } from '@/components/ui/GlassCard';
import { GradientButton } from '@/components/ui/GradientButton';
import { t } from '@/i18n';
import { useAppStore } from '@/store/appStore';
import { customerBalancePaise } from '@/store/selectors';
import { radii, typography } from '@/theme/tokens';
import { formatINRFromPaise } from '@/utils/currency';
import { resolveUserErrorMessage } from '@/utils/errors';

export default function UdhaarScreen() {
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');

  const customers = useAppStore((state) => state.customers);
  const addCustomer = useAppStore((state) => state.addCustomer);

  const customersSorted = useMemo(
    () =>
      [...customers].sort(
        (a, b) => customerBalancePaise(b) - customerBalancePaise(a),
      ),
    [customers],
  );

  const submit = async () => {
    if (!name.trim()) {
      return;
    }
    try {
      await addCustomer(name, phone.trim() ? phone : null);
      setName('');
      setPhone('');
      setShowForm(false);
    } catch (error) {
      Alert.alert(
        'Save failed',
        resolveUserErrorMessage(error, 'Could not add customer. Please try again.'),
      );
    }
  };

  return (
    <ScreenContainer contentStyle={styles.content}>
      <ScreenHeader title={t('udhaar')} subtitle={`${customers.length} customers`} />

      {showForm ? (
        <GlassCard style={styles.formCard}>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Customer name"
            placeholderTextColor="#94A3B8"
            style={styles.input}
          />
          <TextInput
            value={phone}
            onChangeText={setPhone}
            placeholder="Phone (optional)"
            placeholderTextColor="#94A3B8"
            keyboardType="phone-pad"
            style={styles.input}
          />
          <View style={styles.rowActions}>
            <Pressable style={styles.cancelBtn} onPress={() => setShowForm(false)}>
              <AppText variant="label">{t('cancel')}</AppText>
            </Pressable>
            <GradientButton label={t('save')} onPress={submit} />
          </View>
        </GlassCard>
      ) : (
        <GradientButton
          label={t('addCustomer')}
          onPress={() => setShowForm(true)}
          icon={<Feather name="plus" size={16} color="#0B1120" />}
        />
      )}

      {customersSorted.length === 0 ? (
        <EmptyState icon="users" title={t('udhaar')} subtitle={t('emptyUdhaar')} />
      ) : (
        customersSorted.map((customer, index) => {
          const balance = customerBalancePaise(customer);
          return (
            <Animated.View key={customer.id} entering={FadeInDown.delay(index * 70).springify()}>
              <Pressable onPress={() => router.push(`/udhaar/${customer.id}`)}>
                <GlassCard style={styles.customerCard}>
                  <View style={styles.customerRow}>
                    <View style={styles.customerCopy}>
                      <AppText variant="subtitle">{customer.customerName}</AppText>
                      <AppText variant="caption">{customer.phone ?? 'No phone'}</AppText>
                    </View>
                    <AppText
                      variant="label"
                      style={[
                        styles.balanceText,
                        { color: balance > 0 ? '#FCA5A5' : '#86EFAC' },
                      ]}>
                      {formatINRFromPaise(balance)}
                    </AppText>
                  </View>
                </GlassCard>
              </Pressable>
            </Animated.View>
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
  formCard: {
    gap: 10,
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
  rowActions: {
    flexDirection: 'row',
    gap: 10,
  },
  cancelBtn: {
    flex: 1,
    minHeight: 48,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  customerCard: {
    gap: 8,
  },
  customerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
  },
  customerCopy: {
    flex: 1,
    gap: 2,
  },
  balanceText: {
    alignSelf: 'center',
  },
});
