import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { radii } from '@/theme/tokens';

interface SkeletonLoaderProps {
  height?: number;
  width?: number;
}

export const SkeletonLoader: React.FC<SkeletonLoaderProps> = ({ height = 18, width = 320 }) => {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withRepeat(
      withTiming(1, {
        duration: 1000,
        easing: Easing.linear,
      }),
      -1,
      false,
    );
  }, [progress]);

  const animated = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.5, 1], [0.35, 0.95, 0.35]),
  }));

  return <Animated.View style={[styles.box, { height, width }, animated]} />;
};

const styles = StyleSheet.create({
  box: {
    borderRadius: radii.sm,
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
});
