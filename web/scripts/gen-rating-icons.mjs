// Rasterises the branded rating logos in web/public/rating-logos into the PNGs
// the Go renderer embeds (internal/compose/assets/ratings). The SVGs are the one
// source of truth; the render PNGs are generated, never hand-edited, so the two
// sets cannot drift apart — which is the divergence that had the renderer drawing
// tinted greyscale while the site showed the branded mark.
//
// Run after changing any logo:  npm run gen:icons   (from web/)
// A .svg is rasterised and a .png (a source with no vector) is fit into the same
// square, both padded rather than stretched so proportions hold.
import sharp from 'sharp';
import { readdirSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, '..', 'public', 'rating-logos');
const out = join(here, '..', '..', 'internal', 'compose', 'assets', 'ratings');
const SIZE = 256;

mkdirSync(out, { recursive: true });
let svg = 0, png = 0;
for (const f of readdirSync(src).sort()) {
  const name = f.replace(/\.(svg|png)$/, '');
  if (f.endsWith('.svg')) {
    await sharp(join(src, f), { density: 384 })
      .resize(SIZE, SIZE, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png({ compressionLevel: 9 }).toFile(join(out, name + '.png'));
    svg++;
  } else if (f.endsWith('.png')) {
    // Fit the mark into the square rather than copy it through: the source PNGs
    // come at assorted sizes and aspect ratios (a wide dots mark, a tall glyph),
    // and padding into the square keeps proportions where stretching would not.
    await sharp(join(src, f))
      .resize(SIZE, SIZE, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png({ compressionLevel: 9 }).toFile(join(out, name + '.png'));
    png++;
  }
}
console.log(`gen:icons — rasterised ${svg} svg, fit ${png} png into internal/compose/assets/ratings`);
