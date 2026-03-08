import * as FileSystem from 'expo-file-system/legacy';
import * as Print from 'expo-print';
import { router } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Switch, TextInput, View } from 'react-native';

import { ScreenContainer } from '@/components/common/ScreenContainer';
import { ScreenHeader } from '@/components/common/ScreenHeader';
import { checkBackendHealth } from '@/services/backendHealth';
import { AppText } from '@/components/ui/AppText';
import { GlassCard } from '@/components/ui/GlassCard';
import { GradientButton } from '@/components/ui/GradientButton';
import { t } from '@/i18n';
import { useAppStore } from '@/store/appStore';
import { useAuthStore } from '@/store/authStore';
import { radii, typography } from '@/theme/tokens';
import type { AppLanguage, Bill, PaymentMode, UdhaarCustomer, Vendor } from '@/types/models';
import { customerBalancePaise } from '@/store/selectors';
import { formatINRFromPaise } from '@/utils/currency';
import { resolveUserErrorMessage } from '@/utils/errors';
import { hasPin, savePin } from '@/utils/pin';

const languageOptions: AppLanguage[] = ['en', 'hi', 'mr'];
const overdueOptions = [7, 15, 30, 60];
const paymentModes: PaymentMode[] = ['cash', 'upi', 'cheque', 'other'];

type HealthState = 'idle' | 'checking' | 'ok' | 'down';

export default function SettingsScreen() {
  const state = useAppStore((store) => store);
  const signOut = useAuthStore((store) => store.signOut);

  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');

  const [healthState, setHealthState] = useState<HealthState>('idle');
  const [healthMessage, setHealthMessage] = useState('Not checked yet');
  const [syncing, setSyncing] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [exportMonth, setExportMonth] = useState(() => {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  });

  const exportMonthLabel = useMemo(() => {
    const d = new Date(exportMonth.year, exportMonth.month);
    return d.toLocaleString('en-IN', { month: 'long', year: 'numeric' });
  }, [exportMonth]);

  const shiftMonth = (dir: -1 | 1) => {
    setExportMonth((prev) => {
      let m = prev.month + dir;
      let y = prev.year;
      if (m < 0) { m = 11; y -= 1; }
      if (m > 11) { m = 0; y += 1; }
      return { year: y, month: m };
    });
  };

  const backupNow = async () => {
    const ownerUserId = state.ownerUserId;
    if (!ownerUserId) {
      Alert.alert('Backup error', 'You must be signed in to create a backup.');
      return;
    }

    const readableBill = (bill: Bill) => ({
      billNumber: bill.billNumber,
      vendorId: bill.vendorId,
      date: new Date(bill.date).toLocaleDateString('en-IN'),
      totalAmount: formatINRFromPaise(bill.totalAmountPaise),
      totalAmountPaise: bill.totalAmountPaise,
      imageUrl: bill.imageUrl,
      lineItems: bill.lineItems.map((li) => ({
        name: li.name,
        qty: li.qty,
        rate: formatINRFromPaise(li.ratePaise),
        amount: formatINRFromPaise(li.amountPaise),
        ratePaise: li.ratePaise,
        amountPaise: li.amountPaise,
      })),
      payments: bill.payments.map((p) => ({
        amount: formatINRFromPaise(p.amountPaise),
        amountPaise: p.amountPaise,
        date: new Date(p.date).toLocaleDateString('en-IN'),
        mode: p.mode,
        collectorName: p.collectorName,
        notes: p.notes,
      })),
    });

    const readableCustomer = (c: UdhaarCustomer) => ({
      customerName: c.customerName,
      phone: c.phone,
      entries: c.entries.map((e) => ({
        type: e.type,
        amount: formatINRFromPaise(e.amountPaise),
        amountPaise: e.amountPaise,
        description: e.description,
        date: new Date(e.date).toLocaleDateString('en-IN'),
      })),
    });

    const payload = {
      _format: 'KiranaTrack Backup v1',
      ownerUserId,
      exportedAt: new Date().toISOString(),
      exportedAtReadable: new Date().toLocaleString('en-IN'),
      settings: state.settings,
      vendors: state.vendors.map((v: Vendor) => ({
        name: v.name,
        phone: v.phone,
        gstNumber: v.gstNumber,
      })),
      bills: state.bills.map(readableBill),
      outOfStockItems: state.outOfStockItems.map((item) => ({
        itemName: item.itemName,
        status: item.status,
      })),
      customers: state.customers.map(readableCustomer),
    };

    const fileUri = `${FileSystem.documentDirectory}kiranatrack_backup_${new Date()
      .toISOString()
      .slice(0, 10)}.json`;

    await FileSystem.writeAsStringAsync(fileUri, JSON.stringify(payload, null, 2));

    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(fileUri);
      return;
    }

    Alert.alert('Backup created', `File saved at: ${fileUri}`);
  };

  const restoreBackup = async () => {
    const ownerUserId = state.ownerUserId;
    if (!ownerUserId) {
      Alert.alert('Restore error', 'You must be signed in to restore a backup.');
      return;
    }

    Alert.alert(
      'Restore Data',
      'Your data is stored securely on the server. Tap "Sync Now" to pull the latest data. The backup file is for your personal records.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sync Now',
          onPress: async () => {
            try {
              await state.syncAll();
              Alert.alert('Sync complete', 'Latest data pulled from backend.');
            } catch (error) {
              Alert.alert(
                'Sync failed',
                resolveUserErrorMessage(error, 'Could not refresh data right now.'),
              );
            }
          },
        },
      ],
    );
  };

  const savePinFlow = async () => {
    if (pin.length !== 4 || confirmPin.length !== 4) {
      Alert.alert('PIN error', 'PIN must be exactly 4 digits.');
      return;
    }

    if (pin !== confirmPin) {
      Alert.alert('PIN error', 'PIN and confirm PIN do not match.');
      return;
    }

    await savePin(pin);
    setPin('');
    setConfirmPin('');
    Alert.alert('PIN updated', 'Your app PIN has been saved securely.');
  };

  const toggleLock = async (value: boolean) => {
    if (value) {
      const pinExists = await hasPin();
      if (!pinExists) {
        Alert.alert('Set PIN first', 'Please set your 4-digit PIN before enabling lock.');
        return;
      }
    }
    state.setLockOnOpen(value);
  };

  const checkBackend = async () => {
    setHealthState('checking');
    const result = await checkBackendHealth();
    if (result.ok) {
      setHealthState('ok');
      setHealthMessage(`Connected (${result.dbState ?? 'unknown db state'})`);
      return;
    }

    setHealthState('down');
    setHealthMessage(result.message);
  };

  const syncNow = async () => {
    setSyncing(true);
    try {
      await state.syncAll();
      Alert.alert('Sync complete', 'Latest data pulled from backend.');
    } catch (error) {
      Alert.alert(
        'Sync failed',
        resolveUserErrorMessage(error, 'Could not refresh data right now.'),
      );
    } finally {
      setSyncing(false);
    }
  };

  const handleSignOut = () => {
    Alert.alert('Sign out', 'Are you sure you want to sign out from this device?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            setSigningOut(true);
            try {
              await signOut();
              state.resetData();
              router.replace('/login' as never);
            } catch (error) {
              Alert.alert(
                'Sign out failed',
                resolveUserErrorMessage(error, 'Could not sign out. Please try again.'),
              );
            } finally {
              setSigningOut(false);
            }
          })();
        },
      },
    ]);
  };

  const healthColor =
    healthState === 'ok'
      ? '#86efac'
      : healthState === 'down'
        ? '#fca5a5'
        : healthState === 'checking'
          ? '#fde68a'
          : '#cbd5e1';

  const exportMonthlyReport = async () => {
    const bills = state.bills;
    const vendors = state.vendors;
    const customers = state.customers;

    const year = exportMonth.year;
    const month = exportMonth.month;
    const monthName = exportMonthLabel;

    // -- Bills for the month --
    const monthBills = bills.filter((b: Bill) => {
      const d = new Date(b.date);
      return d.getFullYear() === year && d.getMonth() === month;
    });

    const vendorMap = new Map(vendors.map((v: Vendor) => [v.id, v.name]));

    const totalBilled = monthBills.reduce((s: number, b: Bill) => s + b.totalAmountPaise, 0);
    const totalPaid = monthBills.reduce(
      (s: number, b: Bill) => s + b.payments.reduce((ps: number, p) => ps + p.amountPaise, 0),
      0,
    );

    const billRows = monthBills
      .sort((a: Bill, b: Bill) => a.date.localeCompare(b.date))
      .map(
        (b: Bill) =>
          `<tr>
            <td>${new Date(b.date).toLocaleDateString('en-IN')}</td>
            <td>${b.billNumber}</td>
            <td>${vendorMap.get(b.vendorId) ?? 'Unknown'}</td>
            <td style="text-align:right">${formatINRFromPaise(b.totalAmountPaise)}</td>
            <td style="text-align:right">${formatINRFromPaise(b.payments.reduce((s: number, p) => s + p.amountPaise, 0))}</td>
          </tr>`,
      )
      .join('\n');

    // -- Udhaar (credit) for the month --
    const udhaarRows: string[] = [];
    let totalCredit = 0;
    let totalRepayment = 0;

    customers.forEach((c: UdhaarCustomer) => {
      const monthEntries = c.entries.filter((e) => {
        const d = new Date(e.date);
        return d.getFullYear() === year && d.getMonth() === month;
      });
      if (monthEntries.length === 0) return;

      const credit = monthEntries
        .filter((e) => e.type === 'credit')
        .reduce((s, e) => s + e.amountPaise, 0);
      const repayment = monthEntries
        .filter((e) => e.type === 'repayment')
        .reduce((s, e) => s + e.amountPaise, 0);
      const overallBalance = customerBalancePaise(c);

      totalCredit += credit;
      totalRepayment += repayment;

      monthEntries
        .sort((a, b) => a.date.localeCompare(b.date))
        .forEach((e) => {
          udhaarRows.push(
            `<tr>
              <td>${new Date(e.date).toLocaleDateString('en-IN')}</td>
              <td>${c.customerName}</td>
              <td>${c.phone ?? '-'}</td>
              <td>${e.type === 'credit' ? 'Credit' : 'Repayment'}</td>
              <td style="text-align:right">${formatINRFromPaise(e.amountPaise)}</td>
              <td>${e.description ?? '-'}</td>
            </tr>`,
          );
        });

      udhaarRows.push(
        `<tr style="background:#f8fafc;font-weight:600">
          <td colspan="3">${c.customerName} — Month subtotal</td>
          <td>Cr: ${formatINRFromPaise(credit)} | Rp: ${formatINRFromPaise(repayment)}</td>
          <td style="text-align:right">Overall bal: ${formatINRFromPaise(overallBalance)}</td>
          <td></td>
        </tr>`,
      );
    });

    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>KiranaTrack - ${monthName}</title>
<style>
  body{font-family:system-ui,sans-serif;padding:16px;color:#1e293b;max-width:900px;margin:0 auto}
  h1{font-size:20px;margin-bottom:4px}
  h2{font-size:15px;color:#475569;font-weight:normal;margin-top:0}
  h3{font-size:16px;margin-top:28px;margin-bottom:4px;border-bottom:2px solid #e2e8f0;padding-bottom:4px}
  .summary{display:flex;gap:12px;margin:16px 0;flex-wrap:wrap}
  .card{background:#f1f5f9;border-radius:8px;padding:12px 16px;flex:1;min-width:120px}
  .card .label{font-size:11px;color:#64748b;text-transform:uppercase}
  .card .value{font-size:18px;font-weight:700;margin-top:2px}
  table{width:100%;border-collapse:collapse;margin-top:12px;font-size:13px}
  th{background:#f8fafc;text-align:left;padding:8px;border-bottom:2px solid #e2e8f0;font-size:11px;text-transform:uppercase;color:#64748b}
  td{padding:8px;border-bottom:1px solid #f1f5f9}
  .footer{margin-top:24px;font-size:11px;color:#94a3b8;text-align:center}
</style></head><body>
<h1>Monthly Report - ${monthName}</h1>
<h2>KiranaTrack</h2>

<h3>Bills</h3>
<div class="summary">
  <div class="card"><div class="label">Bills</div><div class="value">${monthBills.length}</div></div>
  <div class="card"><div class="label">Total Billed</div><div class="value">${formatINRFromPaise(totalBilled)}</div></div>
  <div class="card"><div class="label">Total Paid</div><div class="value">${formatINRFromPaise(totalPaid)}</div></div>
  <div class="card"><div class="label">Outstanding</div><div class="value">${formatINRFromPaise(totalBilled - totalPaid)}</div></div>
</div>
<table>
  <thead><tr><th>Date</th><th>Bill #</th><th>Vendor</th><th style="text-align:right">Amount</th><th style="text-align:right">Paid</th></tr></thead>
  <tbody>${billRows || '<tr><td colspan="5" style="text-align:center;color:#94a3b8">No bills this month</td></tr>'}</tbody>
</table>

<h3>Udhaar (Credit)</h3>
<div class="summary">
  <div class="card"><div class="label">Credit Given</div><div class="value">${formatINRFromPaise(totalCredit)}</div></div>
  <div class="card"><div class="label">Repayments</div><div class="value">${formatINRFromPaise(totalRepayment)}</div></div>
  <div class="card"><div class="label">Net This Month</div><div class="value">${formatINRFromPaise(totalCredit - totalRepayment)}</div></div>
</div>
<table>
  <thead><tr><th>Date</th><th>Customer</th><th>Phone</th><th>Type</th><th style="text-align:right">Amount</th><th>Description</th></tr></thead>
  <tbody>${udhaarRows.join('\n') || '<tr><td colspan="6" style="text-align:center;color:#94a3b8">No udhaar entries this month</td></tr>'}</tbody>
</table>

<div class="footer">Generated on ${new Date().toLocaleString('en-IN')}</div>
</body></html>`;

    const { uri } = await Print.printToFileAsync({ html });
    const pdfUri = `${FileSystem.documentDirectory}kiranatrack_${year}_${String(month + 1).padStart(2, '0')}_report.pdf`;
    await FileSystem.moveAsync({ from: uri, to: pdfUri });

    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(pdfUri, { mimeType: 'application/pdf' });
      return;
    }
    Alert.alert('Report created', `PDF saved at: ${pdfUri}`);
  };

  return (
    <ScreenContainer contentStyle={styles.content}>
      <ScreenHeader title={t('settings')} subtitle="Security, language and backups" />

      <GlassCard style={styles.section}>
        <AppText variant="subtitle">Connectivity</AppText>
        <GradientButton
          label={healthState === 'checking' ? 'Checking...' : 'Check Backend Health'}
          onPress={checkBackend}
          disabled={healthState === 'checking'}
        />
        <GradientButton
          label={syncing ? 'Syncing...' : 'Sync Data Now'}
          onPress={syncNow}
          variant="accent"
          disabled={syncing}
        />
        <AppText variant="caption" style={{ color: healthColor }}>
          {healthMessage}
        </AppText>
        <AppText variant="caption" style={styles.syncStamp}>
          {state.lastSyncAt
            ? `Last sync: ${new Date(state.lastSyncAt).toLocaleString()}`
            : 'No sync yet'}
        </AppText>
      </GlassCard>

      <GlassCard style={styles.section}>
        <AppText variant="subtitle">Security</AppText>
        <View style={styles.field}>
          <AppText variant="caption">New 4-digit PIN</AppText>
          <TextInput
            value={pin}
            onChangeText={(value) => setPin(value.replace(/\D/g, ''))}
            secureTextEntry
            keyboardType="number-pad"
            maxLength={4}
            placeholder="****"
            placeholderTextColor="#94A3B8"
            style={styles.input}
          />
        </View>
        <View style={styles.field}>
          <AppText variant="caption">Confirm PIN</AppText>
          <TextInput
            value={confirmPin}
            onChangeText={(value) => setConfirmPin(value.replace(/\D/g, ''))}
            secureTextEntry
            keyboardType="number-pad"
            maxLength={4}
            placeholder="****"
            placeholderTextColor="#94A3B8"
            style={styles.input}
          />
        </View>
        <GradientButton label="Save PIN" onPress={savePinFlow} />

        <View style={styles.inlineSetting}>
          <View style={{ flex: 1 }}>
            <AppText variant="label">{t('lockOnOpen')}</AppText>
            <AppText variant="caption">Require PIN when opening app</AppText>
          </View>
          <Switch
            value={state.settings.lockOnOpen}
            onValueChange={toggleLock}
            trackColor={{ true: '#FDBA74', false: '#334155' }}
            thumbColor={state.settings.lockOnOpen ? '#F97316' : '#cbd5e1'}
          />
        </View>
      </GlassCard>

      <GlassCard style={styles.section}>
        <AppText variant="subtitle">{t('language')}</AppText>
        <View style={styles.chipRow}>
          {languageOptions.map((language) => {
            const active = state.settings.language === language;
            return (
              <Pressable
                key={language}
                onPress={() => state.setLanguage(language)}
                style={[styles.chip, active && styles.chipActive]}>
                <AppText variant="caption" style={active ? styles.chipCopyActive : styles.chipCopy}>
                  {language.toUpperCase()}
                </AppText>
              </Pressable>
            );
          })}
        </View>
      </GlassCard>

      <GlassCard style={styles.section}>
        <AppText variant="subtitle">{t('overdueThreshold')}</AppText>
        <View style={styles.chipRow}>
          {overdueOptions.map((days) => {
            const active = state.settings.overdueThresholdDays === days;
            return (
              <Pressable
                key={days}
                onPress={() => state.setOverdueThreshold(days)}
                style={[styles.chip, active && styles.chipActive]}>
                <AppText variant="caption" style={active ? styles.chipCopyActive : styles.chipCopy}>
                  {days}d
                </AppText>
              </Pressable>
            );
          })}
        </View>
      </GlassCard>

      <GlassCard style={styles.section}>
        <AppText variant="subtitle">{t('defaultPaymentMode')}</AppText>
        <View style={styles.chipRow}>
          {paymentModes.map((mode) => {
            const active = state.settings.defaultPaymentMode === mode;
            return (
              <Pressable
                key={mode}
                onPress={() => state.setDefaultPaymentMode(mode)}
                style={[styles.chip, active && styles.chipActive]}>
                <AppText variant="caption" style={active ? styles.chipCopyActive : styles.chipCopy}>
                  {mode.toUpperCase()}
                </AppText>
              </Pressable>
            );
          })}
        </View>
      </GlassCard>

      <GlassCard style={styles.section}>
        <AppText variant="subtitle">Session</AppText>
        <GradientButton
          label={signingOut ? 'Signing out...' : 'Sign Out'}
          onPress={handleSignOut}
          disabled={signingOut}
        />
      </GlassCard>

      <GlassCard style={styles.section}>
        <AppText variant="subtitle">Backup & Export</AppText>
        <GradientButton label={t('backupNow')} onPress={backupNow} />
        <GradientButton label={t('restoreBackup')} onPress={restoreBackup} variant="accent" />
        <View style={styles.monthPicker}>
          <Pressable onPress={() => shiftMonth(-1)} style={styles.monthArrow}>
            <AppText variant="label" style={styles.monthArrowText}>{`◀`}</AppText>
          </Pressable>
          <AppText variant="label" style={styles.monthLabel}>{exportMonthLabel}</AppText>
          <Pressable onPress={() => shiftMonth(1)} style={styles.monthArrow}>
            <AppText variant="label" style={styles.monthArrowText}>{`▶`}</AppText>
          </Pressable>
        </View>
        <GradientButton label={t('exportMonthlyPdf')} onPress={exportMonthlyReport} />
      </GlassCard>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: 12,
  },
  section: {
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
    paddingHorizontal: 12,
    fontFamily: typography.body,
    letterSpacing: 2,
  },
  inlineSetting: {
    minHeight: 48,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    backgroundColor: 'rgba(255,255,255,0.06)',
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    minHeight: 36,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    paddingHorizontal: 12,
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  chipActive: {
    borderColor: 'rgba(251,146,60,0.9)',
    backgroundColor: 'rgba(251,146,60,0.2)',
  },
  chipCopy: {
    color: '#CBD5E1',
  },
  chipCopyActive: {
    color: '#FFE7C2',
  },
  infoBtn: {
    minHeight: 40,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  syncStamp: {
    color: '#93C5FD',
  },
  monthPicker: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    paddingVertical: 4,
  },
  monthArrow: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthArrowText: {
    color: '#FDBA74',
    fontSize: 16,
  },
  monthLabel: {
    color: '#F8FAFC',
    fontSize: 15,
    minWidth: 140,
    textAlign: 'center',
  },
});
