import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import sharp from 'sharp';

const root = resolve(import.meta.dirname, '..');
const manifest = JSON.parse(readFileSync(resolve(root, 'assets/apparel-masters/2026-27/manifest.json'), 'utf8'));
const supplied = manifest.filter((item) => item.image_supplied);
const missing = manifest.filter((item) => !item.image_supplied);
const failures = [];
function check(label, pass) {
  console.log(`${pass ? 'PASS' : 'FAIL'}: ${label}`);
  if (!pass) failures.push(label);
}

check('exactly 20 products have verified artwork', supplied.length === 20);
check('exactly 2 products remain unpublished pending supplied artwork', missing.length === 2);
check('missing artwork is limited to the two products absent from both supplied files',
  missing.map((item) => item.slug).sort().join(',') === 'baggy-cap,wide-brim-hat');

for (const item of supplied) {
  const pngPath = resolve(root, 'assets/apparel-masters/2026-27', item.png_filename);
  const webpPath = resolve(root, 'public', item.public_asset.slice(1));
  const [pngMeta, webpMeta] = await Promise.all([sharp(pngPath).metadata(), sharp(webpPath).metadata()]);
  const { data, info } = await sharp(webpPath).extract({ left: 0, top: 510, width: 800, height: 130 }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const footerIsWhite = info.channels === 3 && data.every((value) => value === 255);
  check(`${item.slug} master and public asset are 800 x 640`,
    pngMeta.width === 800 && pngMeta.height === 640 && webpMeta.width === 800 && webpMeta.height === 640);
  check(`${item.slug} public asset is WebP with a clean pricing-free footer`,
    webpMeta.format === 'webp' && footerIsWhite && item.embedded_pricing_absent === true);
  check(`${item.slug} records its deterministic generator`, item.generated_by === 'scripts/generate-apparel-assets.mjs');
}
for (const item of missing) check(`${item.slug} has no public asset`, item.public_asset === null && item.embedded_pricing_absent === null);
if (failures.length) process.exit(1);
console.log(`Verified ${supplied.length} generated price-free public images and ${missing.length} products awaiting supplied artwork.`);
