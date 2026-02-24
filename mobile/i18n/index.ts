import { I18n } from 'i18n-js';
import * as Localization from 'expo-localization';

import type { AppLanguage } from '@/types/models';

import en from '@/i18n/en.json';
import hi from '@/i18n/hi.json';
import mr from '@/i18n/mr.json';

const i18n = new I18n({ en, hi, mr });
i18n.defaultLocale = 'en';
i18n.enableFallback = true;

export const supportedLanguages: AppLanguage[] = ['en', 'hi', 'mr'];

export const resolveDeviceLanguage = (): AppLanguage => {
  const languageTag = Localization.getLocales()[0]?.languageCode?.toLowerCase();
  if (languageTag === 'hi') {
    return 'hi';
  }
  if (languageTag === 'mr') {
    return 'mr';
  }
  return 'en';
};

export const setAppLanguage = (language: AppLanguage): void => {
  i18n.locale = language;
};

setAppLanguage(resolveDeviceLanguage());

export const t = (key: string, values?: Record<string, string | number>): string =>
  i18n.t(key, values) as string;
