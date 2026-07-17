#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import sharp from 'sharp';

const root = resolve(import.meta.dirname, '..');
const mastersDir = resolve(root, 'assets/apparel-masters/2026-27');
const publicDir = resolve(root, 'public/images/cms/apparel/2026-27');
const manifest = JSON.parse(await readFile(resolve(mastersDir, 'manifest.json'), 'utf8'));
const footerTop = 510;
const width = 800;
const height = 640;
const whiteFooter = Buffer.from(`<svg width="${width}" height="${height - footerTop}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#fff"/></svg>`);

await mkdir(publicDir, { recursive: true });
for (const item of manifest.filter((entry) => entry.image_supplied)) {
  const source = resolve(mastersDir, `${item.slug}.png`);
  const master = resolve(mastersDir, item.png_filename);
  const publicAsset = resolve(root, 'public', item.public_asset.slice(1));
  const pipeline = sharp(source)
    .resize(width, height, { fit: 'fill' })
    .composite([{ input: whiteFooter, left: 0, top: footerTop }]);
  await pipeline.clone().png({ compressionLevel: 9 }).toFile(master);
  await pipeline.clone().webp({ quality: 86, effort: 6 }).toFile(publicAsset);
  console.log(`Generated ${item.slug}: ${item.png_filename} and ${item.public_asset}`);
}
