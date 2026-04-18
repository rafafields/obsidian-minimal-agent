/**
 * Converts animated PNGs in src/emojis/ to animated WebP at 64×64px.
 * Run once: node scripts/convert-emojis.mjs
 * Requires: npm install --save-dev sharp
 */

import sharp from 'sharp';
import { readdir, rename } from 'fs/promises';
import { join, basename, extname } from 'path';

const INPUT_DIR = new URL('../src/emojis', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1').replace(/%20/g, ' ');
const SIZE = 64;

const files = (await readdir(INPUT_DIR)).filter(f => f.endsWith('.png'));

console.log(`Converting ${files.length} files to WebP ${SIZE}×${SIZE}...`);

for (const file of files) {
	const input = join(INPUT_DIR, file);
	const output = join(INPUT_DIR, file.replace(/\.png$/, '.webp'));

	await sharp(input, { animated: true })
		.resize(SIZE, SIZE, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
		.webp({ quality: 85, effort: 4 })
		.toFile(output);

	console.log(`  ✓ ${basename(output)}`);
}

console.log('Done. Update src/emojis/index.ts imports from .png to .webp, then delete the .png files.');
