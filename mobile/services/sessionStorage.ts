import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

let secureStoreSupportPromise: Promise<boolean> | null = null;

const isSecureStoreSupported = async (): Promise<boolean> => {
  if (!secureStoreSupportPromise) {
    secureStoreSupportPromise = SecureStore.isAvailableAsync().catch(() => false);
  }
  return secureStoreSupportPromise;
};

const readFromFallbackStorage = async (key: string): Promise<string | null> => {
  try {
    return await AsyncStorage.getItem(key);
  } catch {
    return null;
  }
};

const writeToFallbackStorage = async (key: string, value: string): Promise<void> => {
  await AsyncStorage.setItem(key, value);
};

const removeFromFallbackStorage = async (key: string): Promise<void> => {
  await AsyncStorage.removeItem(key);
};

export const getSessionStorageItem = async (key: string): Promise<string | null> => {
  const secureStoreSupported = await isSecureStoreSupported();

  if (secureStoreSupported) {
    try {
      const secureValue = await SecureStore.getItemAsync(key);
      if (secureValue !== null) {
        return secureValue;
      }
    } catch {
      // Continue to fallback storage path.
    }
  }

  const fallbackValue = await readFromFallbackStorage(key);
  if (!fallbackValue) {
    return null;
  }

  if (secureStoreSupported) {
    try {
      await SecureStore.setItemAsync(key, fallbackValue);
      await removeFromFallbackStorage(key).catch(() => {});
    } catch {
      // Keep fallback value if secure migration fails.
    }
  }

  return fallbackValue;
};

export const setSessionStorageItem = async (
  key: string,
  value: string,
): Promise<void> => {
  const secureStoreSupported = await isSecureStoreSupported();

  if (secureStoreSupported) {
    try {
      await SecureStore.setItemAsync(key, value);
      await removeFromFallbackStorage(key).catch(() => {});
      return;
    } catch {
      // Fall through to AsyncStorage fallback.
    }
  }

  await writeToFallbackStorage(key, value);
};

export const removeSessionStorageItem = async (key: string): Promise<void> => {
  const secureStoreSupported = await isSecureStoreSupported();

  if (secureStoreSupported) {
    await SecureStore.deleteItemAsync(key).catch(() => {});
  }

  await removeFromFallbackStorage(key).catch(() => {});
};
