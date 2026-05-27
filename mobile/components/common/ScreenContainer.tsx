import React from 'react';
import { Image, ScrollView, StyleSheet, View, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';

import { gradients, palette } from '@/theme/tokens';

interface ScreenContainerProps {
  children: React.ReactNode;
  scroll?: boolean;
  contentStyle?: ViewStyle;
}

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
      <Image
        source={require('@/assets/images/brand-image.png')}
        style={styles.brandImage}
        resizeMode="contain"
      />
      <Image
        source={require('@/assets/images/brand-banner.png')}
        style={styles.brandBanner}
        resizeMode="contain"
      />
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
  brandImage: {
    position: 'absolute',
    width: 260,
    height: 260,
    top: -74,
    right: -72,
    opacity: 0.11,
  },
  brandBanner: {
    position: 'absolute',
    width: 300,
    height: 300,
    bottom: -120,
    left: -92,
    opacity: 0.09,
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
});
