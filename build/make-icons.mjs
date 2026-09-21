// Rasterises the SVG marks into the PNG sizes the manifest and iOS need.
//   node build/make-icons.mjs
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const DIR = path.resolve('app/icons');
const jobs = [
  ['icon.svg', 'icon-192.png', 192],
  ['icon.svg', 'icon-512.png', 512],
  ['maskable.svg', 'maskable-192.png', 192],
  ['maskable.svg', 'maskable-512.png', 512],
  ['icon.svg', 'apple-touch-icon.png', 180],
];

for (const [src, out, size] of jobs) {
  await sharp(path.join(DIR, src), { density: 400 })
    .resize(size, size)
    .png({ compressionLevel: 9 })
    .toFile(path.join(DIR, out));
  console.log(`${out.padEnd(24)} ${size}x${size}  ${(fs.statSync(path.join(DIR, out)).size / 1024).toFixed(1)}KB`);
}
