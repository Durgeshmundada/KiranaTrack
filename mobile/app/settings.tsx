import * as FileSystem from 'expo-file-system/legacy';
import { router } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useState } from 'react';
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
import type { AppLanguage, PaymentMode } from '@/types/models';
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

  const backupNow = async () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      settings: state.settings,
      vendors: state.vendors,
      bills: state.bills,
      outOfStockItems: state.outOfStockItems,
      customers: state.customers,
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
        <Pressable
          style={styles.infoBtn}
          onPress={() => Alert.alert('Restore Backup', 'Use this backup JSON later via import flow in the next release.')}>
          <AppText variant="caption">{t('restoreBackup')}</AppText>
        </Pressable>
        <Pressable
          style={styles.infoBtn}
          onPress={() => Alert.alert('PDF Export', 'Monthly PDF export pipeline is scaffolded for next phase.')}>
          <AppText variant="caption">{t('exportMonthlyPdf')}</AppText>
        </Pressable>
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
});
