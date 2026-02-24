import React, { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';

import { AppText } from '@/components/ui/AppText';
import { gradients, radii, spacing, typography } from '@/theme/tokens';

interface GradientButtonProps {
  label: string;
  onPress: () => void;
  fullWidth?: boolean;
  variant?: 'primary' | 'accent';
  icon?: React.ReactNode;
  disabled?: boolean;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export const GradientButton: React.FC<GradientButtonProps> = ({
  label,
  onPress,
  fullWidth = true,
  variant = 'primary',
  icon,
  disabled = false,
}) => {
  const scale = useSharedValue(1);
  const colors: readonly [string, string, ...string[]] = useMemo(
    () => (variant === 'accent' ? gradients.accent : gradients.primaryButton),
    [variant],
  );

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: disabled ? 0.5 : 1,
  }));

  return (
    <AnimatedPressable
      onPressIn={() => {
        scale.value = withSpring(0.97, { damping: 12 });
      }}
      onPressOut={() => {
        scale.value = withSpring(1, { damping: 10 });
      }}
      onPress={onPress}
      disabled={disabled}
      style={[animatedStyle, fullWidth && styles.fullWidth]}>
      <LinearGradient colors={colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.button}>
        <View style={styles.inner}>
          {icon}
          <AppText style={styles.label}>{label}</AppText>
        </View>
      </LinearGradient>
    </AnimatedPressable>
  );
};

const styles = StyleSheet.create({
  fullWidth: {
    width: '100%',
  },
  button: {
    borderRadius: radii.md,
    minHeight: 52,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  label: {
    fontFamily: typography.bodyBold,
    color: '#0B1120',
    fontSize: 15,
  },
});
