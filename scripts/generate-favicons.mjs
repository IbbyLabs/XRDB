/**
 * Generates PNG favicon variants from public/favicon.svg using sharp.
 * Run: node scripts/generate-favicons.mjs
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const src = join(root, 'public', 'favicon.svg');
const svgBuffer = readFileSync(src);

const sizes = [
  { name: 'favicon-16x16.png', size: 16 },
  { name: 'favicon-32x32.png', size: 32 },
  { name: 'favicon-96x96.png', size: 96 },
  { name: 'apple-touch-icon.png', size: 180 },
  { name: 'favicon-512x512.png', size: 512 },
];

for (const { name, size } of sizes) {
  const dest = join(root, 'public', name);
  await sharp(svgBuffer, { density: Math.ceil((size / 16) * 72) })
    .resize(size, size)
    .png()
    .toFile(dest);
  console.log(`  ${name} (${size}x${size})`);
}

console.log('Done.');
