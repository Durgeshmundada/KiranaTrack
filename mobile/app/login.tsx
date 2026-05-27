import { AntDesign, Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Redirect } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useMemo, useState } from 'react';

WebBrowser.maybeCompleteAuthSession();
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';

import { AppText } from '@/components/ui/AppText';
import { GradientButton } from '@/components/ui/GradientButton';
import { isSupabaseConfigured, supabaseConfigError } from '@/services/supabaseClient';
import { useAuthStore } from '@/store/authStore';
import { radii, shadows, typography } from '@/theme/tokens';

type AuthMode = 'signin' | 'signup';

const isEmail = (value: string): boolean => /\S+@\S+\.\S+/.test(value);

const isWrongCredentialsError = (error: unknown): boolean => {
  const status =
    typeof error === 'object' && error !== null && 'status' in error
      ? (error as { status?: unknown }).status
      : undefined;
  if (status === 400 || status === 401) {
    return true;
  }

  if (!(error instanceof Error)) {
    return false;
  }

  const normalized = error.message.trim().toLowerCase();
  return (
    normalized.includes('invalid login credentials') ||
    normalized.includes('invalid email or password') ||
    normalized.includes('wrong email or password') ||
    normalized.includes('incorrect password') ||
    normalized.includes('invalid credentials')
  );
};

export default function LoginScreen() {
  const session = useAuthStore((state) => state.session);
  const loading = useAuthStore((state) => state.loading);
  const signIn = useAuthStore((state) => state.signIn);
  const signUp = useAuthStore((state) => state.signUp);
  const signInWithGoogle = useAuthStore((state) => state.signInWithGoogle);

  const [mode, setMode] = useState<AuthMode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const buttonLabel = useMemo(() => {
    if (loading) {
      return mode === 'signin' ? 'Signing in...' : 'Creating account...';
    }

    return mode === 'signin' ? 'Sign in securely' : 'Create account';
  }, [loading, mode]);

  if (session) {
    return <Redirect href="/home" />;
  }

  const handleGoogleSignIn = async () => {
    try {
      await signInWithGoogle();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Google sign-in failed. Please try again.';
      Alert.alert('Google sign-in failed', message);
    }
  };

  const submit = async () => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!isEmail(normalizedEmail)) {
      Alert.alert('Invalid email', 'Enter a valid email address.');
      return;
    }

    if (password.length < 6) {
      Alert.alert('Weak password', 'Password must be at least 6 characters.');
      return;
    }

    try {
      if (mode === 'signin') {
        await signIn(normalizedEmail, password);
        return;
      }

      await signUp(normalizedEmail, password);
      if (useAuthStore.getState().session) {
        return;
      }
      Alert.alert(
        'Account created',
        'If email confirmation is enabled in Supabase, verify your email before signing in.',
      );
      setMode('signin');
    } catch (error) {
      if (mode === 'signin' && isWrongCredentialsError(error)) {
        Alert.alert('Sign in failed', 'Wrong email or password.');
        return;
      }

      const message =
        error instanceof Error ? error.message : 'Authentication failed. Please try again.';
      Alert.alert('Auth failed', message);
    }
  };

  return (
    <LinearGradient colors={['#050816', '#0B1C35', '#112C4E']} style={styles.container}>
      <Image
        source={require('@/assets/images/brand-image.png')}
        style={styles.bgBrandTop}
        resizeMode="contain"
      />
      <Image
        source={require('@/assets/images/brand-banner.png')}
        style={styles.bgBrandBottom}
        resizeMode="contain"
      />

      <KeyboardAvoidingView
        style={styles.keyboardWrap}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Animated.View entering={FadeIn.duration(500)} style={styles.brandWrap}>
          <AppText variant="caption" style={styles.brandMini}>
            KIRANATRACK
          </AppText>
          <AppText variant="title" style={styles.brandTitle}>
            Secure Login
          </AppText>
          <AppText variant="caption" style={styles.brandSubtitle}>
            Manage bills, suppliers, and udhaar from one protected workspace.
          </AppText>
        </Animated.View>

        <Animated.View entering={FadeInDown.duration(650)} style={styles.card}>
          {!isSupabaseConfigured ? (
            <View style={styles.configAlert}>
              <AppText variant="caption" style={styles.configAlertText}>
                {supabaseConfigError}
              </AppText>
            </View>
          ) : null}

          <View style={styles.modeSwitch}>
            <Pressable
              style={[styles.modeBtn, mode === 'signin' && styles.modeBtnActive]}
              onPress={() => setMode('signin')}>
              <AppText
                variant="label"
                style={[styles.modeCopy, mode === 'signin' && styles.modeCopyActive]}>
                Sign In
              </AppText>
            </Pressable>
            <Pressable
              style={[styles.modeBtn, mode === 'signup' && styles.modeBtnActive]}
              onPress={() => setMode('signup')}>
              <AppText
                variant="label"
                style={[styles.modeCopy, mode === 'signup' && styles.modeCopyActive]}>
                Create Account
              </AppText>
            </Pressable>
          </View>

          <View style={styles.field}>
            <AppText variant="caption" style={styles.fieldLabel}>
              Email
            </AppText>
            <View style={styles.inputWrap}>
              <Feather name="mail" size={16} color="#9FB7D6" />
              <TextInput
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                placeholder="you@example.com"
                placeholderTextColor="#7E96B6"
                style={styles.input}
                value={email}
                onChangeText={setEmail}
              />
            </View>
          </View>

          <View style={styles.field}>
            <AppText variant="caption" style={styles.fieldLabel}>
              Password
            </AppText>
            <View style={styles.inputWrap}>
              <Feather name="lock" size={16} color="#9FB7D6" />
              <TextInput
                secureTextEntry
                placeholder="Minimum 6 characters"
                placeholderTextColor="#7E96B6"
                style={styles.input}
                value={password}
                onChangeText={setPassword}
              />
            </View>
          </View>

          <GradientButton label={buttonLabel} onPress={submit} disabled={loading} />

          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <AppText variant="caption" style={styles.dividerText}>
              OR
            </AppText>
            <View style={styles.dividerLine} />
          </View>

          <Pressable
            style={styles.googleBtn}
            onPress={handleGoogleSignIn}
            disabled={loading}>
            <AntDesign name="google" size={18} color="#E2E8F0" />
            <AppText variant="label" style={styles.googleLabel}>
              Continue with Google
            </AppText>
          </Pressable>

          <AppText variant="caption" style={styles.helper}>
            {mode === 'signin'
              ? 'Use the same account on family devices for shared records.'
              : 'Create once, then sign in on every device with the same credentials.'}
          </AppText>
        </Animated.View>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 20,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  keyboardWrap: {
    gap: 14,
  },
  bgBrandTop: {
    position: 'absolute',
    width: 260,
    height: 260,
    top: -72,
    right: -74,
    opacity: 0.13,
  },
  bgBrandBottom: {
    position: 'absolute',
    width: 300,
    height: 300,
    bottom: -130,
    left: -98,
    opacity: 0.1,
  },
  brandWrap: {
    gap: 6,
  },
  brandMini: {
    letterSpacing: 2,
    color: '#C8DAF7',
  },
  brandTitle: {
    fontSize: 34,
    lineHeight: 40,
    color: '#F8FAFC',
  },
  brandSubtitle: {
    color: '#B7CCE9',
    maxWidth: 330,
  },
  card: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    backgroundColor: 'rgba(8,16,31,0.64)',
    padding: 14,
    gap: 12,
    ...shadows.strong,
  },
  modeSwitch: {
    borderRadius: radii.pill,
    backgroundColor: 'rgba(255,255,255,0.08)',
    padding: 4,
    flexDirection: 'row',
    gap: 6,
  },
  modeBtn: {
    flex: 1,
    minHeight: 40,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modeBtnActive: {
    backgroundColor: 'rgba(249,115,22,0.24)',
    borderWidth: 1,
    borderColor: 'rgba(251,146,60,0.55)',
  },
  modeCopy: {
    color: '#AFC4E2',
  },
  modeCopyActive: {
    color: '#FFE7C2',
  },
  field: {
    gap: 5,
  },
  fieldLabel: {
    color: '#C8DAF7',
  },
  inputWrap: {
    minHeight: 50,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    backgroundColor: 'rgba(10,19,38,0.72)',
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  input: {
    flex: 1,
    color: '#F8FAFC',
    fontFamily: typography.body,
    fontSize: 15,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  dividerText: {
    color: '#7E96B6',
  },
  googleBtn: {
    minHeight: 50,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    backgroundColor: 'rgba(255,255,255,0.06)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 12,
  },
  googleLabel: {
    color: '#E2E8F0',
  },
  helper: {
    textAlign: 'center',
    color: '#AFC4E2',
  },
  configAlert: {
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: 'rgba(248,113,113,0.6)',
    backgroundColor: 'rgba(127,29,29,0.4)',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  configAlertText: {
    color: '#FECACA',
  },
});
