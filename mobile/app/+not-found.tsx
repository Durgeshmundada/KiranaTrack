import { Link } from 'expo-router';
import { StyleSheet } from 'react-native';

import { ScreenContainer } from '@/components/common/ScreenContainer';
import { AppText } from '@/components/ui/AppText';
import { GlassCard } from '@/components/ui/GlassCard';
import { GradientButton } from '@/components/ui/GradientButton';

export default function NotFoundScreen() {
  return (
    <ScreenContainer contentStyle={styles.container}>
      <GlassCard style={styles.card}>
        <AppText variant="title" style={styles.title}>
          Page not found
        </AppText>
        <AppText variant="body" style={styles.subtitle}>
          This route does not exist in KiranaTrack.
        </AppText>
        <Link href="/" asChild>
          <GradientButton label="Go Home" onPress={() => {}} />
        </Link>
      </GlassCard>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    flex: 1,
  },
  card: {
    gap: 10,
    alignItems: 'center',
  },
  title: {
    textAlign: 'center',
  },
  subtitle: {
    textAlign: 'center',
  },
});
