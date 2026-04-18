/**
 * Resizes animated PNGs (APNG) in src/emojis/ to 64×64 in-place.
 * Preserves all animation frames and per-frame delays.
 * Run once: node scripts/convert-emojis.mjs
 * Requires: npm install --save-dev sharp upng-js
 */

import sharp from 'sharp';
import { readdir } from 'fs/promises';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

// Resolve path safely regardless of spaces in directory name
const INPUT_DIR = new URL('../src/emojis', import.meta.url).pathname
	.replace(/^\/([A-Z]:)/i, '$1')
	.replace(/%20/g, ' ');

const TARGET_SIZE = 64;

// Lazy-load UPNG (CommonJS module)
const { default: UPNG } = await import('upng-js');

const files = (await readdir(INPUT_DIR)).filter(f => f.endsWith('.png'));
console.log(`Resizing ${files.length} APNGs to ${TARGET_SIZE}×${TARGET_SIZE}...`);

for (const file of files) {
	const inputPath = join(INPUT_DIR, file);
	const inputBuf = readFileSync(inputPath);

	// Decode all APNG frames to raw RGBA8 pixel arrays
	const apng = UPNG.decode(inputBuf.buffer);
	const frames = UPNG.toRGBA8(apng);   // Array<ArrayBuffer>, each width*height*4 bytes
	const delays = apng.frames.map(f => f.delay ?? 100);

	// Resize each frame independently
	const resizedFrames = await Promise.all(
		frames.map(frameBuf =>
			sharp(Buffer.from(frameBuf), {
				raw: { width: apng.width, height: apng.height, channels: 4 }
			})
			.resize(TARGET_SIZE, TARGET_SIZE, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
			.raw()
			.toBuffer()
		)
	);

	// Re-encode as APNG with original delays preserved
	const encoded = UPNG.encode(
		resizedFrames.map(b => b.buffer),
		TARGET_SIZE,
		TARGET_SIZE,
		0,      // 0 = lossless (full color depth)
		delays
	);

	writeFileSync(inputPath, Buffer.from(encoded));
	process.stdout.write('.');
}

console.log('\nDone — all APNGs resized to 64×64 in-place, animation preserved.');
