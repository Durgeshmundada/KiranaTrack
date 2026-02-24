import { Feather } from '@expo/vector-icons';
import { Redirect, Tabs } from 'expo-router';

import { t } from '@/i18n';
import { useAuthStore } from '@/store/authStore';
import { palette } from '@/theme/tokens';

const iconMap: Record<string, keyof typeof Feather.glyphMap> = {
  home: 'home',
  bills: 'file-text',
  notepad: 'check-square',
  udhaar: 'users',
  analytics: 'bar-chart-2',
};

export default function TabLayout() {
  const ready = useAuthStore((state) => state.ready);
  const session = useAuthStore((state) => state.session);

  if (!ready) {
    return null;
  }

  if (!session) {
    return <Redirect href={'/login' as never} />;
  }

  return (
    <Tabs
      initialRouteName="home"
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: palette.saffron,
        tabBarInactiveTintColor: '#94A3B8',
        tabBarStyle: {
          position: 'absolute',
          height: 78,
          paddingTop: 10,
          paddingBottom: 10,
          backgroundColor: 'rgba(9,15,30,0.9)',
          borderTopColor: 'rgba(255,255,255,0.14)',
          borderTopWidth: 1,
        },
        tabBarLabelStyle: {
          fontFamily: 'Manrope_600SemiBold',
          fontSize: 11,
          marginBottom: 2,
        },
        tabBarIcon: ({ color, size }) => (
          <Feather name={iconMap[route.name]} size={size - 1} color={color} />
        ),
      })}>
      <Tabs.Screen
        name="home"
        options={{
          title: t('home'),
        }}
      />
      <Tabs.Screen name="bills" options={{ title: t('bills') }} />
      <Tabs.Screen name="notepad" options={{ title: t('notepad') }} />
      <Tabs.Screen name="udhaar" options={{ title: t('udhaar') }} />
      <Tabs.Screen name="analytics" options={{ title: t('analytics') }} />
    </Tabs>
  );
}
