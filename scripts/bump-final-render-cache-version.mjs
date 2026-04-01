import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const CACHE_VERSION_RE =
  /(FINAL_IMAGE_RENDERER_CACHE_VERSION\s*=\s*['"]poster-backdrop-logo-v)(\d+)(['"])/;

export function incrementFinalImageRendererCacheVersion(source) {
  const match = source.match(CACHE_VERSION_RE);
  if (!match) {
    throw new Error('Could not find FINAL_IMAGE_RENDERER_CACHE_VERSION in lib/imageRouteConfig.ts');
  }

  const currentVersion = Number.parseInt(match[2], 10);
  if (!Number.isFinite(currentVersion)) {
    throw new Error(`Invalid FINAL_IMAGE_RENDERER_CACHE_VERSION numeric suffix: ${match[2]}`);
  }

  const nextVersion = currentVersion + 1;
  const updatedSource = source.replace(
    CACHE_VERSION_RE,
    `$1${String(nextVersion)}$3`,
  );

  return {
    currentVersion,
    nextVersion,
    updatedSource,
  };
}

const isDirectRun = (() => {
  const entryArg = process.argv[1];
  if (!entryArg) return false;
  return path.resolve(entryArg) === fileURLToPath(import.meta.url);
})();

if (isDirectRun) {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const targetPath = path.join(repoRoot, 'lib', 'imageRouteConfig.ts');
  const source = readFileSync(targetPath, 'utf8');
  const { currentVersion, nextVersion, updatedSource } = incrementFinalImageRendererCacheVersion(source);

  if (updatedSource !== source) {
    writeFileSync(targetPath, updatedSource);
  }

  console.log(
    `Bumped FINAL_IMAGE_RENDERER_CACHE_VERSION from poster-backdrop-logo-v${currentVersion} to poster-backdrop-logo-v${nextVersion}.`,
  );
}
