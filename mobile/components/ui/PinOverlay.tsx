import React, { useEffect, useState } from 'react';
import {
  Modal,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { GlassCard } from '@/components/ui/GlassCard';
import { GradientButton } from '@/components/ui/GradientButton';
import { palette, radii, typography } from '@/theme/tokens';
import { getRemainingLockoutSeconds, verifyPin } from '@/utils/pin';

interface PinOverlayProps {
  visible: boolean;
  title?: string;
  onClose: () => void;
  onVerified: () => void;
  disableClose?: boolean;
}

export const PinOverlay: React.FC<PinOverlayProps> = ({
  visible,
  title = 'Enter PIN',
  onClose,
  onVerified,
  disableClose = false,
}) => {
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [lockoutSeconds, setLockoutSeconds] = useState(0);

  useEffect(() => {
    if (!visible) {
      setPin('');
      setError(null);
      setLockoutSeconds(0);
      return;
    }

    getRemainingLockoutSeconds().then(setLockoutSeconds);
  }, [visible]);

  useEffect(() => {
    if (lockoutSeconds <= 0) {
      return;
    }

    const interval = setInterval(() => {
      setLockoutSeconds((value) => Math.max(0, value - 1));
    }, 1000);

    return () => clearInterval(interval);
  }, [lockoutSeconds]);

  const submit = async () => {
    if (pin.length !== 4) {
      setError('Enter a 4-digit PIN');
      return;
    }

    const result = await verifyPin(pin);
    if (result.ok) {
      setPin('');
      setError(null);
      onVerified();
      return;
    }

    if (result.remainingLockoutSeconds > 0) {
      setLockoutSeconds(result.remainingLockoutSeconds);
      setError('Too many wrong attempts. Try again later.');
      return;
    }

    setError('Incorrect PIN');
  };

  return (
    <Modal
      transparent
      visible={visible}
      animationType="fade"
      onRequestClose={() => {
        if (!disableClose) {
          onClose();
        }
      }}>
      <View style={styles.backdrop}>
        <GlassCard intense style={styles.card}>
          <AppText variant="subtitle">{title}</AppText>
          <AppText variant="caption" style={styles.caption}>
            PIN required for secure action
          </AppText>

          <TextInput
            keyboardType="number-pad"
            secureTextEntry
            maxLength={4}
            value={pin}
            onChangeText={(value) => {
              setError(null);
              setPin(value.replace(/\D/g, ''));
            }}
            style={styles.input}
            placeholder="••••"
            placeholderTextColor="#94A3B8"
          />

          {lockoutSeconds > 0 ? (
            <AppText variant="caption" style={styles.lockoutText}>
              Locked for {lockoutSeconds}s
            </AppText>
          ) : null}

          {error ? (
            <AppText variant="caption" style={styles.error}>
              {error}
            </AppText>
          ) : null}

          <View style={styles.actions}>
            {!disableClose ? (
              <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
                <AppText variant="label">Cancel</AppText>
              </TouchableOpacity>
            ) : null}
            <GradientButton label="Verify" onPress={submit} />
          </View>
        </GlassCard>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(2,6,23,0.74)',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  card: {
    gap: 10,
  },
  caption: {
    color: '#B7C5DA',
  },
  input: {
    marginTop: 4,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    minHeight: 52,
    color: palette.white,
    fontFamily: typography.bodyBold,
    fontSize: 20,
    textAlign: 'center',
    letterSpacing: 8,
    backgroundColor: 'rgba(15,23,42,0.35)',
  },
  actions: {
    marginTop: 6,
    gap: 10,
  },
  cancelBtn: {
    minHeight: 46,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
  },
  error: {
    color: palette.crimson,
  },
  lockoutText: {
    color: '#FDBA74',
  },
});
