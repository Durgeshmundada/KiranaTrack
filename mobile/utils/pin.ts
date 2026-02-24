import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

const PIN_HASH_KEY = 'kiranatrack_pin_hash';
const PIN_ATTEMPTS_KEY = 'kiranatrack_pin_attempts';
const PIN_LOCKOUT_KEY = 'kiranatrack_pin_lockout_until';
const MAX_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 10;

const hashPin = async (pin: string): Promise<string> =>
  Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `kiranatrack:${pin}`);

const getAttempts = async (): Promise<number> => {
  const value = await SecureStore.getItemAsync(PIN_ATTEMPTS_KEY);
  return value ? Number(value) : 0;
};

const setAttempts = async (attempts: number): Promise<void> => {
  await SecureStore.setItemAsync(PIN_ATTEMPTS_KEY, String(attempts));
};

const clearAttempts = async (): Promise<void> => {
  await SecureStore.deleteItemAsync(PIN_ATTEMPTS_KEY);
};

const getLockoutUntil = async (): Promise<Date | null> => {
  const value = await SecureStore.getItemAsync(PIN_LOCKOUT_KEY);
  if (!value) {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

export const getRemainingLockoutSeconds = async (): Promise<number> => {
  const lockoutUntil = await getLockoutUntil();
  if (!lockoutUntil) {
    return 0;
  }
  const diffMs = lockoutUntil.getTime() - Date.now();
  return diffMs > 0 ? Math.ceil(diffMs / 1000) : 0;
};

export const savePin = async (pin: string): Promise<void> => {
  const hash = await hashPin(pin);
  await SecureStore.setItemAsync(PIN_HASH_KEY, hash);
  await clearAttempts();
  await SecureStore.deleteItemAsync(PIN_LOCKOUT_KEY);
};

export const hasPin = async (): Promise<boolean> => {
  const hash = await SecureStore.getItemAsync(PIN_HASH_KEY);
  return Boolean(hash);
};

export const verifyPin = async (
  pin: string,
): Promise<{ ok: boolean; remainingLockoutSeconds: number }> => {
  const remaining = await getRemainingLockoutSeconds();
  if (remaining > 0) {
    return { ok: false, remainingLockoutSeconds: remaining };
  }

  const storedHash = await SecureStore.getItemAsync(PIN_HASH_KEY);
  if (!storedHash) {
    return { ok: false, remainingLockoutSeconds: 0 };
  }

  const incomingHash = await hashPin(pin);
  if (incomingHash === storedHash) {
    await clearAttempts();
    await SecureStore.deleteItemAsync(PIN_LOCKOUT_KEY);
    return { ok: true, remainingLockoutSeconds: 0 };
  }

  const nextAttempts = (await getAttempts()) + 1;
  await setAttempts(nextAttempts);

  if (nextAttempts >= MAX_ATTEMPTS) {
    const lockoutUntil = new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000);
    await SecureStore.setItemAsync(PIN_LOCKOUT_KEY, lockoutUntil.toISOString());
    await clearAttempts();
    return {
      ok: false,
      remainingLockoutSeconds: LOCKOUT_MINUTES * 60,
    };
  }

  return { ok: false, remainingLockoutSeconds: 0 };
};
