import fs from 'node:fs';
import path from 'node:path';
import { parseEnv } from 'node:util';
import { fileURLToPath } from 'node:url';

const ROOT_DIR = fileURLToPath(new URL('..', import.meta.url));
const DEFAULT_ENV_FILES = ['.env', '.env.local'];

export function loadLocalEnv({ rootDir = ROOT_DIR, files = DEFAULT_ENV_FILES, env = process.env } = {}) {
  const mergedEnv = {};
  const loadedFiles = [];

  for (const fileName of files) {
    const filePath = path.join(rootDir, fileName);
    if (!fs.existsSync(filePath)) {
      continue;
    }

    Object.assign(mergedEnv, parseEnv(fs.readFileSync(filePath, 'utf8')));
    loadedFiles.push(filePath);
  }

  for (const [key, value] of Object.entries(mergedEnv)) {
    if (!Object.hasOwn(env, key)) {
      env[key] = value;
    }
  }

  return loadedFiles;
}
