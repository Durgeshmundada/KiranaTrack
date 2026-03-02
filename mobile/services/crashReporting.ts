import Constants from 'expo-constants';

const crashWebhookUrl = process.env.EXPO_PUBLIC_CRASH_WEBHOOK_URL?.trim() ?? '';
let crashReportingInitialized = false;

type CrashContext = {
  source: 'global' | 'promise';
  isFatal?: boolean;
};

const reportCrash = async (error: Error, context: CrashContext): Promise<void> => {
  if (!crashWebhookUrl) {
    return;
  }

  const payload = {
    timestamp: new Date().toISOString(),
    appVersion: Constants.expoConfig?.version ?? 'unknown',
    runtimeVersion: Constants.expoConfig?.runtimeVersion ?? 'unknown',
    source: context.source,
    isFatal: context.isFatal ?? false,
    message: error.message,
    stack: error.stack ?? null,
  };

  await fetch(crashWebhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  }).catch(() => {});
};

export const initializeCrashReporting = (): void => {
  if (crashReportingInitialized) {
    return;
  }

  crashReportingInitialized = true;

  const errorUtils = (globalThis as { ErrorUtils?: unknown }).ErrorUtils as
    | {
        getGlobalHandler?: () => (error: Error, isFatal?: boolean) => void;
        setGlobalHandler?: (handler: (error: Error, isFatal?: boolean) => void) => void;
      }
    | undefined;

  const previousHandler =
    typeof errorUtils?.getGlobalHandler === 'function'
      ? errorUtils.getGlobalHandler()
      : null;

  if (typeof errorUtils?.setGlobalHandler === 'function') {
    errorUtils.setGlobalHandler((error: Error, isFatal?: boolean) => {
      void reportCrash(error, {
        source: 'global',
        isFatal,
      });
      previousHandler?.(error, isFatal);
    });
  }

  const maybeProcess = globalThis as { process?: { on?: (event: string, handler: (error: Error) => void) => void } };
  maybeProcess.process?.on?.('unhandledRejection', (reason: unknown) => {
    const error =
      reason instanceof Error ? reason : new Error(`Unhandled rejection: ${String(reason)}`);
    void reportCrash(error, { source: 'promise', isFatal: false });
  });
};
