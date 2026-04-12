import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createXrdbLogger,
  parseXrdbLogLevel,
  parseXrdbRequestLogLevel,
  shouldEmitLogLevel,
} from '../lib/serverLogger.ts';

const createCapturedLogger = (env = {}) => {
  const stdout = [];
  const stderr = [];
  const logger = createXrdbLogger({
    env,
    stdoutWrite: (message) => {
      stdout.push(message);
    },
    stderrWrite: (message) => {
      stderr.push(message);
    },
  });

  return { logger, stdout, stderr };
};

test('server logger filters messages below the configured global level', () => {
  const { logger, stdout, stderr } = createCapturedLogger({ XRDB_LOG_LEVEL: 'warn' });

  assert.equal(logger.debug('debug hidden'), false);
  assert.equal(logger.info('info hidden'), false);
  assert.equal(logger.warn('warn visible'), true);
  assert.equal(logger.error('error visible'), true);

  assert.deepEqual(stdout, []);
  assert.deepEqual(stderr, ['warn visible\n', 'error visible\n']);
});

test('server logger routes info to stdout and warn to stderr', () => {
  const { logger, stdout, stderr } = createCapturedLogger({ XRDB_LOG_LEVEL: 'debug' });

  logger.info('info visible');
  logger.warn('warn visible');

  assert.deepEqual(stdout, ['info visible\n']);
  assert.deepEqual(stderr, ['warn visible\n']);
});

test('server logger keeps request logging disabled unless explicitly enabled', () => {
  const disabled = createCapturedLogger({ XRDB_LOG_LEVEL: 'debug' });
  assert.equal(disabled.logger.request('request hidden'), false);
  assert.deepEqual(disabled.stdout, []);
  assert.deepEqual(disabled.stderr, []);

  const enabled = createCapturedLogger({
    XRDB_LOG_LEVEL: 'error',
    XRDB_REQUEST_LOG_LEVEL: 'info',
  });
  assert.equal(enabled.logger.request('request visible'), true);
  assert.deepEqual(enabled.stdout, ['request visible\n']);
  assert.deepEqual(enabled.stderr, []);
});

test('server logger parsing falls back for invalid values', () => {
  assert.equal(parseXrdbLogLevel(' loud '), 'info');
  assert.equal(parseXrdbRequestLogLevel(' noisy '), 'off');
  assert.equal(parseXrdbLogLevel('DEBUG'), 'debug');
  assert.equal(parseXrdbRequestLogLevel('WARN'), 'warn');
  assert.equal(shouldEmitLogLevel('error', 'warn'), true);
  assert.equal(shouldEmitLogLevel('info', 'warn'), false);
});