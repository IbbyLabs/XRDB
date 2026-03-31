import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const NATIVE_PACKAGE_NAME = 'better-sqlite3';
const DEFAULT_PACKAGE_JSON_PATH = fileURLToPath(new URL('../package.json', import.meta.url));

export function getVerifyScript(packageName = NATIVE_PACKAGE_NAME) {
  return [
    `const Database = require(${JSON.stringify(packageName)});`,
    `const db = new Database(':memory:');`,
    'db.close();',
  ].join('\n');
}

const VERIFY_ARGS = ['-e', getVerifyScript()];

export function isNativeAbiMismatch(output) {
  const text = String(output || '');
  return text.includes(NATIVE_PACKAGE_NAME) && text.includes('NODE_MODULE_VERSION');
}

export function getDeclaredPackageManager({ packageJsonPath = DEFAULT_PACKAGE_JSON_PATH } = {}) {
  try {
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
    return typeof packageJson.packageManager === 'string' ? packageJson.packageManager : '';
  } catch {
    return '';
  }
}

export function getRebuildCommand({ userAgent = '', packageManager = '' } = {}) {
  if (String(userAgent).startsWith('pnpm/') || String(packageManager).startsWith('pnpm@')) {
    return {
      command: 'pnpm',
      args: ['rebuild', NATIVE_PACKAGE_NAME],
    };
  }

  return {
    command: 'npm',
    args: ['rebuild', NATIVE_PACKAGE_NAME],
  };
}

function formatCommandFailure(command, args, result) {
  const output = [result.stdout, result.stderr]
    .filter((value) => String(value || '').trim())
    .join('\n')
    .trim();

  return output || `${command} ${args.join(' ')} failed.`;
}

function verifyNativePackage() {
  return spawnSync(process.execPath, VERIFY_ARGS, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

export function ensureNativeDeps({ env = process.env, log = console } = {}) {
  const verifyBefore = verifyNativePackage();
  if (!verifyBefore.error && verifyBefore.status === 0) {
    return false;
  }

  const beforeOutput = verifyBefore.error
    ? String(verifyBefore.error)
    : formatCommandFailure(process.execPath, VERIFY_ARGS, verifyBefore);

  if (!isNativeAbiMismatch(beforeOutput)) {
    throw new Error(beforeOutput || `${NATIVE_PACKAGE_NAME} failed to load.`);
  }

  const { command, args } = getRebuildCommand({
    userAgent: env.npm_config_user_agent,
    packageManager: env.npm_package_json
      ? getDeclaredPackageManager({ packageJsonPath: env.npm_package_json })
      : '',
  });

  log.warn(
    `[native] Detected ${NATIVE_PACKAGE_NAME} binary mismatch for Node ${process.version}. Rebuilding.`,
  );

  const rebuildResult = spawnSync(command, args, {
    env,
    stdio: 'inherit',
  });

  if (rebuildResult.error) {
    throw rebuildResult.error;
  }

  if (rebuildResult.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} exited with status ${rebuildResult.status ?? 1}.`);
  }

  const verifyAfter = verifyNativePackage();
  if (verifyAfter.error || verifyAfter.status !== 0) {
    throw new Error(
      formatCommandFailure(process.execPath, VERIFY_ARGS, verifyAfter) ||
        `${NATIVE_PACKAGE_NAME} still failed to load after rebuild.`,
    );
  }

  log.warn(`[native] ${NATIVE_PACKAGE_NAME} is ready for Node ${process.version}.`);
  return true;
}

function main() {
  try {
    ensureNativeDeps();
  } catch (error) {
    console.error(error instanceof Error ? error.stack || error.message : String(error));
    process.exit(1);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
