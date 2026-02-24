import React, { useEffect } from 'react';
import { Dimensions, ScrollView, StyleSheet, View, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';

import { gradients, palette } from '@/theme/tokens';

interface ScreenContainerProps {
  children: React.ReactNode;
  scroll?: boolean;
  contentStyle?: ViewStyle;
}

const { width } = Dimensions.get('window');

const Blob = ({ index }: { index: number }) => {
  const drift = useSharedValue(0);

  useEffect(() => {
    drift.value = withRepeat(
      withTiming(1, {
        duration: 7000 + index * 1300,
        easing: Easing.inOut(Easing.quad),
      }),
      -1,
      true,
    );
  }, [drift, index]);

  const style = useAnimatedStyle(() => ({
    transform: [
      { translateY: interpolate(drift.value, [0, 1], [-10 - index * 5, 16 + index * 6]) },
      { translateX: interpolate(drift.value, [0, 1], [6 + index * 3, -8 - index * 4]) },
      { scale: interpolate(drift.value, [0, 1], [1, 1.06]) },
    ],
  }));

  return <Animated.View style={[styles.blob, styles[`blob${index}` as keyof typeof styles], style]} />;
};

export const ScreenContainer: React.FC<ScreenContainerProps> = ({ children, scroll = true, contentStyle }) => {
  const content = scroll ? (
    <ScrollView contentContainerStyle={[styles.scrollContent, contentStyle]} showsVerticalScrollIndicator={false}>
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.flexContent, contentStyle]}>{children}</View>
  );

  return (
    <LinearGradient colors={gradients.screen} style={styles.gradient}>
      <Blob index={1} />
      <Blob index={2} />
      <Blob index={3} />
      <SafeAreaView style={styles.safe}>{content}</SafeAreaView>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  gradient: {
    flex: 1,
    backgroundColor: palette.black,
  },
  safe: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 120,
    paddingTop: 12,
    gap: 16,
  },
  flexContent: {
    flex: 1,
    paddingHorizontal: 16,
    paddingBottom: 110,
    paddingTop: 12,
  },
  blob: {
    position: 'absolute',
    borderRadius: 999,
    opacity: 0.15,
  },
  blob1: {
    width: width * 0.62,
    height: width * 0.62,
    backgroundColor: '#F97316',
    top: -100,
    left: -90,
  },
  blob2: {
    width: width * 0.52,
    height: width * 0.52,
    backgroundColor: '#22D3EE',
    top: 180,
    right: -80,
  },
  blob3: {
    width: width * 0.7,
    height: width * 0.7,
    backgroundColor: '#1D4ED8',
    bottom: -140,
    left: width * 0.1,
  },
});
