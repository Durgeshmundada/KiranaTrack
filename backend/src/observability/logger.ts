import { env } from '../config/env';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

type LogContext = Record<string, unknown>;

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const ACTIVE_LOG_LEVEL = env.LOG_LEVEL;
const activePriority = LOG_LEVEL_PRIORITY[ACTIVE_LOG_LEVEL];

const shouldLog = (level: LogLevel): boolean =>
  LOG_LEVEL_PRIORITY[level] >= activePriority;

const writeLog = (
  level: LogLevel,
  event: string,
  context: LogContext = {},
): void => {
  if (!shouldLog(level)) {
    return;
  }

  const payload = {
    timestamp: new Date().toISOString(),
    level,
    event,
    ...context,
  };
  const line = JSON.stringify(payload);

  if (level === 'error') {
    // eslint-disable-next-line no-console
    console.error(line);
    return;
  }

  // eslint-disable-next-line no-console
  console.log(line);
};

export const logDebug = (event: string, context?: LogContext): void =>
  writeLog('debug', event, context);

export const logInfo = (event: string, context?: LogContext): void =>
  writeLog('info', event, context);

export const logWarn = (event: string, context?: LogContext): void =>
  writeLog('warn', event, context);

export const logError = (event: string, context?: LogContext): void =>
  writeLog('error', event, context);
