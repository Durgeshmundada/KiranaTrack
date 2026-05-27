import { Feather } from '@expo/vector-icons';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { Alert, Platform, Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { GlassCard } from '@/components/ui/GlassCard';
import { GradientButton } from '@/components/ui/GradientButton';
import { useAppStore } from '@/store/appStore';
import { palette, radii } from '@/theme/tokens';
import { formatINRFromPaise } from '@/utils/currency';
import { formatDisplayDate } from '@/utils/date';
import { resolveUserErrorMessage } from '@/utils/errors';
import type { AppSubscriptionStatus } from '@/types/models';

interface SubscriptionNoticeProps {
  alwaysVisible?: boolean;
}

const DEFAULT_SUBSCRIPTION: AppSubscriptionStatus = {
  status: 'none',
  accessStatus: 'setup_required',
  canUseFeatures: false,
  autoPayEnabled: false,
  amountPaise: 100,
  currency: 'INR',
  billingPeriod: 'monthly',
  planId: null,
  razorpaySubscriptionId: null,
  shortUrl: null,
  checkoutUrl: null,
  currentStart: null,
  currentEnd: null,
  nextChargeAt: null,
  endedAt: null,
  paidCount: 0,
  totalCount: 120,
  lastPaymentId: null,
  alertTitle: 'Subscription required',
  alertMessage:
    'Set up Rs 1/month auto pay to unlock editing features. You can still view your account.',
  updatedAt: null,
};

interface SecondaryActionProps {
  label: string;
  icon: React.ComponentProps<typeof Feather>['name'];
  onPress: () => void;
  disabled?: boolean;
  danger?: boolean;
}

const SecondaryAction: React.FC<SecondaryActionProps> = ({
  label,
  icon,
  onPress,
  disabled = false,
  danger = false,
}) => (
  <Pressable
    accessibilityRole="button"
    style={[
      styles.secondaryAction,
      danger && styles.secondaryActionDanger,
      disabled && styles.disabledAction,
    ]}
    onPress={onPress}
    disabled={disabled}>
    <Feather name={icon} size={15} color={danger ? '#FCA5A5' : '#E2E8F0'} />
    <AppText
      variant="caption"
      numberOfLines={1}
      adjustsFontSizeToFit
      style={[styles.secondaryActionLabel, danger && styles.secondaryActionDangerLabel]}>
      {label}
    </AppText>
  </Pressable>
);

const appendCacheBuster = (url: string): string => {
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}kt=${Date.now()}`;
};

const openSubscriptionUrl = async (url: string | null): Promise<void> => {
  if (!url) {
    Alert.alert('Setup link unavailable', 'Tap Set Auto Pay to create a fresh setup link.');
    return;
  }

  const checkoutUrl = appendCacheBuster(url);
  if (Platform.OS === 'android' && /^https?:\/\//i.test(checkoutUrl)) {
    try {
      await WebBrowser.openBrowserAsync(checkoutUrl, {
        browserPackage: 'com.android.chrome',
        createTask: true,
        showTitle: true,
        toolbarColor: '#f59e0b',
      });
      return;
    } catch {
      // Fall back to the default browser if Chrome is not installed or cannot handle the intent.
    }
  }

  await Linking.openURL(checkoutUrl);
};

export const SubscriptionNotice: React.FC<SubscriptionNoticeProps> = ({
  alwaysVisible = false,
}) => {
  const subscription = useAppStore((state) => state.subscription);
  const loading = useAppStore((state) => state.subscriptionLoading);
  const startSubscription = useAppStore((state) => state.startSubscription);
  const refreshSubscription = useAppStore((state) => state.refreshSubscription);
  const cancelSubscription = useAppStore((state) => state.cancelSubscription);

  const currentSubscription = subscription ?? DEFAULT_SUBSCRIPTION;

  const shouldShow =
    alwaysVisible ||
    !currentSubscription.canUseFeatures ||
    currentSubscription.accessStatus === 'past_due';

  if (!shouldShow) {
    return null;
  }

  const isFrozen = currentSubscription.accessStatus === 'frozen';
  const hasFullAccess = currentSubscription.accessStatus === 'active';
  const amountLabel = formatINRFromPaise(currentSubscription.amountPaise);
  const activeStatusLabel = currentSubscription.autoPayEnabled ? 'Auto Pay Active' : 'Access Active';
  const activeStatusDetail = currentSubscription.autoPayEnabled
    ? 'No payment due now'
    : 'Auto pay is off';
  const renewalLabel = currentSubscription.nextChargeAt
    ? formatDisplayDate(currentSubscription.nextChargeAt)
    : null;
  const accessEndLabel = currentSubscription.currentEnd
    ? formatDisplayDate(currentSubscription.currentEnd)
    : null;

  const handleStart = async () => {
    if (hasFullAccess) {
      Alert.alert(currentSubscription.alertTitle, currentSubscription.alertMessage);
      return;
    }

    try {
      const next = await startSubscription();
      const checkoutUrl = next.checkoutUrl ?? next.shortUrl;
      if (checkoutUrl) {
        await openSubscriptionUrl(checkoutUrl);
      } else {
        Alert.alert(next.alertTitle, next.alertMessage);
      }
    } catch (error) {
      Alert.alert(
        'Subscription setup failed',
        resolveUserErrorMessage(error, 'Could not start subscription. Please try again.'),
      );
    }
  };

  const handleRefresh = async () => {
    try {
      const next = await refreshSubscription();
      if (next) {
        Alert.alert(next.alertTitle, next.alertMessage);
      }
    } catch (error) {
      Alert.alert(
        'Refresh failed',
        resolveUserErrorMessage(error, 'Could not refresh subscription status.'),
      );
    }
  };

  const handleCancel = () => {
    Alert.alert(
      'Cancel auto pay',
      'Auto pay will be cancelled at the end of the paid billing cycle.',
      [
        { text: 'Keep Auto Pay', style: 'cancel' },
        {
          text: 'Cancel Auto Pay',
          style: 'destructive',
          onPress: async () => {
            try {
              const next = await cancelSubscription();
              Alert.alert(next.alertTitle, next.alertMessage);
            } catch (error) {
              Alert.alert(
                'Cancel failed',
                resolveUserErrorMessage(error, 'Could not cancel auto pay.'),
              );
            }
          },
        },
      ],
    );
  };

  return (
    <GlassCard intense style={[styles.card, isFrozen && styles.frozenCard]}>
      <View style={styles.headerRow}>
        <View style={styles.iconWrap}>
          <Feather
            name={hasFullAccess ? 'check-circle' : 'lock'}
            size={18}
            color={hasFullAccess ? '#86EFAC' : palette.saffron}
          />
        </View>
        <View style={styles.copy}>
          <AppText variant="subtitle">{currentSubscription.alertTitle}</AppText>
          <AppText variant="caption" style={styles.message}>
            {currentSubscription.alertMessage}
          </AppText>
        </View>
      </View>

      <View style={styles.metaRow}>
        <View style={styles.metaPill}>
          <AppText variant="caption" style={styles.metaLabel}>
            {`${amountLabel}/month`}
          </AppText>
        </View>
        {renewalLabel ? (
          <View style={styles.metaPill}>
            <AppText variant="caption" style={styles.metaLabel}>
              {`Next: ${renewalLabel}`}
            </AppText>
          </View>
        ) : null}
        {accessEndLabel && !hasFullAccess ? (
          <View style={styles.metaPill}>
            <AppText variant="caption" style={styles.metaLabel}>
              {`Access: ${accessEndLabel}`}
            </AppText>
          </View>
        ) : null}
      </View>

      <View style={styles.actions}>
        <View style={styles.primaryAction}>
          {hasFullAccess ? (
            <View accessibilityRole="text" style={styles.activeStatus}>
              <Feather name="check-circle" size={17} color="#86EFAC" />
              <View style={styles.activeStatusCopy}>
                <AppText variant="label" style={styles.activeStatusLabel}>
                  {activeStatusLabel}
                </AppText>
                <AppText variant="caption" style={styles.activeStatusDetail}>
                  {activeStatusDetail}
                </AppText>
              </View>
            </View>
          ) : (
            <GradientButton
              label={loading ? 'Please wait...' : 'Set Auto Pay'}
              onPress={handleStart}
              disabled={loading}
              icon={<Feather name="repeat" size={16} color="#0B1120" />}
            />
          )}
        </View>
        <View style={styles.secondaryActions}>
          {currentSubscription.shortUrl && !currentSubscription.canUseFeatures ? (
            <SecondaryAction
              label="Open Link"
              icon="external-link"
              onPress={() => {
                void openSubscriptionUrl(currentSubscription.shortUrl);
              }}
              disabled={loading}
            />
          ) : null}
          <SecondaryAction
            label="Refresh"
            icon="refresh-cw"
            onPress={handleRefresh}
            disabled={loading}
          />
          {currentSubscription.autoPayEnabled ? (
            <SecondaryAction
              label="Cancel"
              icon="x-circle"
              onPress={handleCancel}
              disabled={loading}
              danger
            />
          ) : null}
        </View>
      </View>
    </GlassCard>
  );
};

const styles = StyleSheet.create({
  card: {
    gap: 12,
  },
  frozenCard: {
    borderColor: 'rgba(252,165,165,0.35)',
  },
  headerRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
  },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: {
    flex: 1,
    gap: 3,
  },
  message: {
    color: '#CBD5E1',
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  metaPill: {
    minHeight: 30,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    paddingHorizontal: 10,
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  metaLabel: {
    color: '#E2E8F0',
  },
  actions: {
    gap: 8,
  },
  activeStatus: {
    minHeight: 52,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: 'rgba(134,239,172,0.32)',
    backgroundColor: 'rgba(34,197,94,0.14)',
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  activeStatusCopy: {
    alignItems: 'center',
  },
  activeStatusLabel: {
    color: '#DCFCE7',
  },
  activeStatusDetail: {
    color: '#BBF7D0',
  },
  primaryAction: {
    width: '100%',
  },
  secondaryActions: {
    flexDirection: 'row',
    gap: 8,
  },
  secondaryAction: {
    flex: 1,
    height: 46,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    paddingHorizontal: 8,
    gap: 6,
  },
  secondaryActionDanger: {
    borderColor: 'rgba(252,165,165,0.24)',
    backgroundColor: 'rgba(127,29,29,0.18)',
  },
  secondaryActionLabel: {
    color: '#E2E8F0',
    maxWidth: 80,
  },
  secondaryActionDangerLabel: {
    color: '#FECACA',
  },
  disabledAction: {
    opacity: 0.5,
  },
});
