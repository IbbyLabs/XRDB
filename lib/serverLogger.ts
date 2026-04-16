import { format } from 'node:util';

export type XrdbLogLevel = 'debug' | 'info' | 'warn' | 'error';
export type XrdbRequestLogLevel = XrdbLogLevel | 'off';

type LoggerEnv = Record<string, string | undefined>;

type LoggerWrite = (message: string) => void;

type CreateXrdbLoggerOptions = {
  env?: LoggerEnv;
  stdoutWrite?: LoggerWrite;
  stderrWrite?: LoggerWrite;
};

const LOG_LEVEL_PRIORITY: Record<XrdbLogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const DEFAULT_LOG_LEVEL: XrdbLogLevel = 'info';
const DEFAULT_REQUEST_LOG_LEVEL: XrdbRequestLogLevel = 'off';

const isLogLevel = (value: string): value is XrdbLogLevel =>
  value === 'debug' || value === 'info' || value === 'warn' || value === 'error';

const isRequestLogLevel = (value: string): value is XrdbRequestLogLevel =>
  value === 'off' || isLogLevel(value);

const normalizeLevelInput = (value: string | undefined) => String(value ?? '').trim().toLowerCase();

const withTrailingNewline = (message: string) =>
  message.endsWith('\n') ? message : `${message}\n`;

export const parseXrdbLogLevel = (
  value: string | undefined,
  fallback: XrdbLogLevel = DEFAULT_LOG_LEVEL,
): XrdbLogLevel => {
  const normalized = normalizeLevelInput(value);
  return isLogLevel(normalized) ? normalized : fallback;
};

export const parseXrdbRequestLogLevel = (
  value: string | undefined,
  fallback: XrdbRequestLogLevel = DEFAULT_REQUEST_LOG_LEVEL,
): XrdbRequestLogLevel => {
  const normalized = normalizeLevelInput(value);
  return isRequestLogLevel(normalized) ? normalized : fallback;
};

export const shouldEmitLogLevel = (
  messageLevel: XrdbLogLevel,
  configuredLevel: XrdbLogLevel,
): boolean => LOG_LEVEL_PRIORITY[messageLevel] >= LOG_LEVEL_PRIORITY[configuredLevel];

export const createXrdbLogger = ({
  env = process.env,
  stdoutWrite = (message) => {
    process.stdout.write(message);
  },
  stderrWrite = (message) => {
    process.stderr.write(message);
  },
}: CreateXrdbLoggerOptions = {}) => {
  const write = (level: XrdbLogLevel, args: unknown[]) => {
    const rendered = withTrailingNewline(format(...args));
    if (level === 'warn' || level === 'error') {
      stderrWrite(rendered);
      return;
    }
    stdoutWrite(rendered);
  };

  const log = (level: XrdbLogLevel, ...args: unknown[]) => {
    const configuredLevel = parseXrdbLogLevel(env.XRDB_LOG_LEVEL);
    if (!shouldEmitLogLevel(level, configuredLevel)) {
      return false;
    }
    write(level, args);
    return true;
  };

  const request = (...args: unknown[]) => {
    const requestLevel = parseXrdbRequestLogLevel(env.XRDB_REQUEST_LOG_LEVEL);
    if (requestLevel === 'off') {
      return false;
    }
    write(requestLevel, args);
    return true;
  };

  return {
    log,
    debug: (...args: unknown[]) => log('debug', ...args),
    info: (...args: unknown[]) => log('info', ...args),
    warn: (...args: unknown[]) => log('warn', ...args),
    error: (...args: unknown[]) => log('error', ...args),
    request,
  };
};

export const logger = createXrdbLogger();