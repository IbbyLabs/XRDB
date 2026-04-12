import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const standaloneDir = join(rootDir, '.next', 'standalone');

const copyDir = (source, destination) => {
  if (!existsSync(source)) {
    throw new Error(`Missing required standalone asset source: ${source}`);
  }

  mkdirSync(dirname(destination), { recursive: true });
  rmSync(destination, { recursive: true, force: true });
  cpSync(source, destination, { recursive: true });
};

if (!existsSync(standaloneDir)) {
  throw new Error('Missing .next/standalone. Run npm run build before npm run start.');
}

copyDir(join(rootDir, '.next', 'static'), join(standaloneDir, '.next', 'static'));
copyDir(join(rootDir, 'public'), join(standaloneDir, 'public'));
