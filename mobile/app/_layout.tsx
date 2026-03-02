import { Manrope_500Medium, Manrope_600SemiBold, Manrope_700Bold } from '@expo-google-fonts/manrope';
import { Syne_600SemiBold, Syne_700Bold } from '@expo-google-fonts/syne';
import NetInfo from '@react-native-community/netinfo';
import { DarkTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { router, Stack, usePathname } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import 'react-native-reanimated';

import { PinOverlay } from '@/components/ui/PinOverlay';
import { initializeCrashReporting } from '@/services/crashReporting';
import { useAppStore } from '@/store/appStore';
import { useAuthStore } from '@/store/authStore';
import { hasPin } from '@/utils/pin';

SplashScreen.preventAutoHideAsync();

const navTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: '#0B1120',
    card: '#0E172A',
    text: '#F8FAFC',
    border: 'rgba(255,255,255,0.12)',
    primary: '#F59E0B',
  },
};

export default function RootLayout() {
  const bootstrap = useAppStore((state) => state.bootstrap);
  const resetData = useAppStore((state) => state.resetData);
  const setOffline = useAppStore((state) => state.setOffline);
  const syncAll = useAppStore((state) => state.syncAll);
  const lockOnOpen = useAppStore((state) => state.settings.lockOnOpen);
  const dataOwnerUserId = useAppStore((state) => state.ownerUserId);
  const authReady = useAuthStore((state) => state.ready);
  const session = useAuthStore((state) => state.session);
  const initializeAuth = useAuthStore((state) => state.initialize);
  const authUserId = session?.user.id ?? null;
  const pathname = usePathname();
  const [isLocked, setIsLocked] = useState(false);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const launchRedirectHandledRef = useRef(false);
  const previousAuthUserRef = useRef<string | null>(null);
  const previousOnlineRef = useRef<boolean | null>(null);

  const [loaded, error] = useFonts({
    Syne_600SemiBold,
    Syne_700Bold,
    Manrope_500Medium,
    Manrope_600SemiBold,
    Manrope_700Bold,
  });

  useEffect(() => {
    initializeCrashReporting();
  }, []);

  useEffect(() => {
    if (error) {
      throw error;
    }
  }, [error]);

  useEffect(() => {
    if (!loaded || authReady) {
      return;
    }

    initializeAuth().catch(() => {
      // Keep auth init errors non-fatal and allow retry on next launch.
    });
  }, [authReady, initializeAuth, loaded]);

  useEffect(() => {
    if (!loaded || !authReady) {
      return;
    }

    const hydrate = async () => {
      try {
        if (authUserId) {
          if (
            previousAuthUserRef.current &&
            previousAuthUserRef.current !== authUserId
          ) {
            resetData();
          }
          await bootstrap(authUserId);
        } else if (previousAuthUserRef.current || dataOwnerUserId) {
          resetData();
        }
        previousAuthUserRef.current = authUserId;
      } finally {
        await SplashScreen.hideAsync();
      }
    };

    void hydrate();
  }, [authReady, authUserId, bootstrap, dataOwnerUserId, loaded, resetData]);

  useEffect(() => {
    if (!loaded || !authReady) {
      return;
    }

    if (!pathname) {
      return;
    }

    const isIntroRoute = pathname === '/' || pathname === '/index';
    const isPublicRoute = isIntroRoute || pathname.startsWith('/login');

    if (!launchRedirectHandledRef.current) {
      launchRedirectHandledRef.current = true;
      if (!isIntroRoute) {
        router.replace('/' as never);
        return;
      }
    }

    if (!authUserId && !isPublicRoute) {
      router.replace('/login' as never);
      return;
    }

    if (authUserId && pathname.startsWith('/login')) {
      router.replace('/home' as never);
    }
  }, [authReady, authUserId, loaded, pathname]);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      const online = Boolean(state.isConnected) && state.isInternetReachable !== false;
      setOffline(!online);
      const wasOnline = previousOnlineRef.current;
      if (wasOnline === false && online && authUserId) {
        void syncAll().catch(() => {
          // Keep reconnect sync non-fatal. User can retry manually if needed.
        });
      }
      previousOnlineRef.current = online;
    });

    return unsubscribe;
  }, [authUserId, setOffline, syncAll]);

  useEffect(() => {
    const evaluateLock = async () => {
      if (!lockOnOpen || !authUserId) {
        setIsLocked(false);
        return;
      }

      const pinExists = await hasPin();
      setIsLocked(pinExists);
    };

    if (loaded) {
      void evaluateLock();
    }
  }, [authUserId, loaded, lockOnOpen]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', async (nextState) => {
      const previous = appStateRef.current;
      appStateRef.current = nextState;

      if (!lockOnOpen || !authUserId) {
        return;
      }

      if (previous.match(/inactive|background/) && nextState === 'active') {
        const pinExists = await hasPin();
        if (pinExists) {
          setIsLocked(true);
        }
      }
    });

    return () => subscription.remove();
  }, [authUserId, lockOnOpen]);

  if (!loaded || !authReady) {
    return null;
  }

  return (
    <ThemeProvider value={navTheme}>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          animation: 'fade',
        }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="login" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="scan" options={{ presentation: 'modal' }} />
        <Stack.Screen name="bill/[id]" />
        <Stack.Screen name="udhaar/[id]" />
        <Stack.Screen name="vendor/[id]" />
        <Stack.Screen name="settings" options={{ presentation: 'card' }} />
      </Stack>
      <PinOverlay
        visible={isLocked}
        onClose={() => {}}
        onVerified={() => setIsLocked(false)}
        title="Unlock KiranaTrack"
        disableClose
      />
    </ThemeProvider>
  );
}
