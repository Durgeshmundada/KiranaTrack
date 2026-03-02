import { env } from '../config/env';
import { getMetricsSnapshot } from './metrics';
import { logError, logInfo, logWarn } from './logger';

const lastAlertByType = new Map<string, number>();
let alertInterval: NodeJS.Timeout | null = null;

const canSendAlert = (type: string): boolean => {
  const now = Date.now();
  const lastSentAt = lastAlertByType.get(type) ?? 0;
  if (now - lastSentAt < env.ALERT_COOLDOWN_MS) {
    return false;
  }

  lastAlertByType.set(type, now);
  return true;
};

const sendWebhookAlert = async (
  type: string,
  summary: string,
  details: Record<string, unknown>,
): Promise<void> => {
  if (!env.ALERT_WEBHOOK_URL) {
    return;
  }

  if (!canSendAlert(type)) {
    return;
  }

  try {
    const response = await fetch(env.ALERT_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type,
        summary,
        service: 'kiranatrack-backend',
        timestamp: new Date().toISOString(),
        details,
      }),
    });

    if (!response.ok) {
      logWarn('observability.alert.delivery_failed', {
        type,
        status: response.status,
      });
      return;
    }

    logInfo('observability.alert.sent', {
      type,
      summary,
    });
  } catch (error) {
    logError('observability.alert.delivery_error', {
      type,
      summary,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};

export const evaluateAndSendAlerts = async (): Promise<void> => {
  if (!env.ALERT_WEBHOOK_URL) {
    return;
  }

  const snapshot = getMetricsSnapshot();

  if (
    snapshot.requests.samples >= env.ALERT_MIN_REQUESTS &&
    snapshot.requests.p95LatencyMs > env.ALERT_P95_LATENCY_MS
  ) {
    await sendWebhookAlert(
      'high_p95_latency',
      `HTTP p95 latency is ${snapshot.requests.p95LatencyMs}ms`,
      {
        thresholdMs: env.ALERT_P95_LATENCY_MS,
        samples: snapshot.requests.samples,
        windowMs: snapshot.windowMs,
      },
    );
  }

  if (snapshot.authFailures.windowCount >= env.ALERT_AUTH_FAILURES_THRESHOLD) {
    await sendWebhookAlert(
      'auth_failure_spike',
      `Auth failures in window reached ${snapshot.authFailures.windowCount}`,
      {
        threshold: env.ALERT_AUTH_FAILURES_THRESHOLD,
        windowMs: snapshot.windowMs,
      },
    );
  }

  if (snapshot.dbErrors.windowCount >= env.ALERT_DB_ERRORS_THRESHOLD) {
    await sendWebhookAlert(
      'db_error_spike',
      `DB errors in window reached ${snapshot.dbErrors.windowCount}`,
      {
        threshold: env.ALERT_DB_ERRORS_THRESHOLD,
        windowMs: snapshot.windowMs,
      },
    );
  }
};

export const startAlertLoop = (): void => {
  if (!env.ALERT_WEBHOOK_URL || alertInterval) {
    return;
  }

  alertInterval = setInterval(() => {
    void evaluateAndSendAlerts();
  }, env.ALERT_EVALUATION_INTERVAL_MS);

  alertInterval.unref();

  logInfo('observability.alert.loop_started', {
    intervalMs: env.ALERT_EVALUATION_INTERVAL_MS,
  });
};

export const stopAlertLoop = (): void => {
  if (!alertInterval) {
    return;
  }

  clearInterval(alertInterval);
  alertInterval = null;
};
