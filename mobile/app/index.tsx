import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

import { AppText } from '@/components/ui/AppText';
import { useAuthStore } from '@/store/authStore';
import { gradients, radii } from '@/theme/tokens';

const INTRO_DURATION_MS = 2500;

export default function IntroScreen() {
  const authReady = useAuthStore((state) => state.ready);
  const session = useAuthStore((state) => state.session);
  const progress = useSharedValue(0);
  const pulse = useSharedValue(0);

  useEffect(() => {
    progress.value = withTiming(1, {
      duration: INTRO_DURATION_MS - 200,
      easing: Easing.inOut(Easing.cubic),
    });
    pulse.value = withDelay(
      250,
      withTiming(1, {
        duration: 1400,
        easing: Easing.inOut(Easing.sin),
      }),
    );

    const timer = setTimeout(() => {
      if (!authReady) {
        return;
      }
      router.replace((session ? '/home' : '/login') as never);
    }, INTRO_DURATION_MS);

    return () => clearTimeout(timer);
  }, [authReady, progress, pulse, session]);

  const logoAnim = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [
      { scale: interpolate(progress.value, [0, 1], [0.6, 1], Extrapolation.CLAMP) },
      { translateY: interpolate(progress.value, [0, 1], [26, 0], Extrapolation.CLAMP) },
      { rotate: `${interpolate(pulse.value, [0, 1], [-9, 0], Extrapolation.CLAMP)}deg` },
    ],
  }));

  const ringAnim = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.65, 1], [0, 0.48, 0], Extrapolation.CLAMP),
    transform: [{ scale: interpolate(progress.value, [0, 1], [0.68, 1.24], Extrapolation.CLAMP) }],
  }));

  const textAnim = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0.25, 1], [0, 1], Extrapolation.CLAMP),
    transform: [{ translateY: interpolate(progress.value, [0.25, 1], [12, 0], Extrapolation.CLAMP) }],
  }));

  return (
    <LinearGradient colors={gradients.screen} style={styles.container}>
      <View style={styles.centerContent}>
        <Animated.View style={[styles.glowRing, ringAnim]} />

        <Animated.View style={[styles.logoWrap, logoAnim]}>
          <Image source={require('@/assets/images/icon.png')} style={styles.logo} resizeMode="cover" />
        </Animated.View>

        <Animated.View style={textAnim}>
          <AppText variant="title" style={styles.title}>
            KiranaTrack
          </AppText>
          <AppText variant="caption" style={styles.madeBy}>
            Made by Durgesh Mundada
          </AppText>
        </Animated.View>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  centerContent: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  glowRing: {
    position: 'absolute',
    width: 180,
    height: 180,
    borderRadius: 90,
    borderWidth: 2,
    borderColor: 'rgba(251,146,60,0.5)',
    backgroundColor: 'rgba(56,189,248,0.12)',
  },
  logoWrap: {
    width: 112,
    height: 112,
    borderRadius: radii.xl,
    padding: 12,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.24)',
  },
  logo: {
    width: '100%',
    height: '100%',
    borderRadius: 18,
  },
  title: {
    textAlign: 'center',
  },
  madeBy: {
    marginTop: 2,
    textAlign: 'center',
    color: '#dbeafe',
    fontSize: 12,
  },
});
