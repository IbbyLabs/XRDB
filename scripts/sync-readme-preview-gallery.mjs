import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  renderReadmePreviewGallerySection,
  replaceReadmePreviewGallerySection,
  selectReadmePreviewGallery,
} from '../lib/readmePreview.ts';

const ROOT_DIR = fileURLToPath(new URL('..', import.meta.url));
const README_PATH = path.join(ROOT_DIR, 'README.md');
const PACKAGE_JSON_PATH = path.join(ROOT_DIR, 'package.json');
const STATE_PATH = path.join(ROOT_DIR, 'data', 'readme-preview-gallery.json');

const readJsonIfPresent = async (filePath) => {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
};

const resolveVersion = async (version) => {
  const trimmedVersion = String(version || '').trim();
  if (trimmedVersion) {
    return trimmedVersion;
  }

  const packageJson = JSON.parse(await fs.readFile(PACKAGE_JSON_PATH, 'utf8'));
  const packageVersion = String(packageJson.version || '').trim();
  if (!packageVersion) {
    throw new Error('package.json version is missing.');
  }

  return packageVersion;
};

export const syncReadmePreviewGallery = async ({
  version,
  seed = process.env.XRDB_README_PREVIEW_SELECTION_SEED || '',
  selectedAt = new Date().toISOString(),
} = {}) => {
  const resolvedVersion = await resolveVersion(version);
  const resolvedSeed = String(seed || '').trim() || resolvedVersion;
  const previousState = await readJsonIfPresent(STATE_PATH);
  const selection = selectReadmePreviewGallery({
    seed: resolvedSeed,
    version: resolvedVersion,
    previousState,
    selectedAt,
  });

  const readme = await fs.readFile(README_PATH, 'utf8');
  const renderedSection = renderReadmePreviewGallerySection({
    definitions: selection.definitions,
    version: resolvedVersion,
  });
  const updatedReadme = replaceReadmePreviewGallerySection({
    readme,
    section: renderedSection,
  });
  const serializedState = `${JSON.stringify(selection.state, null, 2)}\n`;
  const existingState = await fs.readFile(STATE_PATH, 'utf8').catch(() => '');

  let readmeUpdated = false;
  if (updatedReadme !== readme) {
    await fs.writeFile(README_PATH, updatedReadme);
    readmeUpdated = true;
  }

  let stateUpdated = false;
  if (serializedState !== existingState) {
    await fs.mkdir(path.dirname(STATE_PATH), { recursive: true });
    await fs.writeFile(STATE_PATH, serializedState);
    stateUpdated = true;
  }

  return {
    version: resolvedVersion,
    seed: resolvedSeed,
    readmeUpdated,
    stateUpdated,
    selection: selection.state,
  };
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await syncReadmePreviewGallery();
  console.log(
    `Synced README preview gallery for version ${result.version} using seed ${result.seed}.`,
  );
}