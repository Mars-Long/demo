// Generate placeholder extension icons (solid color PNGs)
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const iconsDir = resolve(__dirname, 'src/icons');
if (!existsSync(iconsDir)) mkdirSync(iconsDir, { recursive: true });

// Minimal valid PNG generator — creates solid-color squares
function createPNG(size, r, g, b) {
  // Build a minimal PNG with IHDR + IDAT + IEND chunks
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR chunk
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(size, 0);  // width
  ihdrData.writeUInt32BE(size, 4);  // height
  ihdrData[8] = 8;   // bit depth
  ihdrData[9] = 2;   // color type (RGB)
  ihdrData[10] = 0;  // compression
  ihdrData[11] = 0;  // filter
  ihdrData[12] = 0;  // interlace
  const ihdr = createChunk('IHDR', ihdrData);

  // IDAT chunk — raw image data (filter byte + RGB rows)
  const rawData = Buffer.alloc(size * (1 + 3 * size)); // filter + RGB per row
  for (let y = 0; y < size; y++) {
    const offset = y * (1 + 3 * size);
    rawData[offset] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const px = offset + 1 + x * 3;
      rawData[px] = r;
      rawData[px + 1] = g;
      rawData[px + 2] = b;
    }
  }
  const zlib = deflateSync(rawData);
  const idat = createChunk('IDAT', zlib);

  // IEND chunk
  const iend = createChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdr, idat, iend]);
}

function createChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeB = Buffer.from(type, 'ascii');
  // CRC: type + data
  const crcData = Buffer.concat([typeB, data]);
  const crc = crc32(crcData);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc, 0);
  return Buffer.concat([length, typeB, data, crcBuf]);
}

function crc32(buf) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
    }
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

// Use zlib from Node.js
import { deflateSync } from 'zlib';

// Generate three icon sizes
const icons = [
  { size: 16, r: 52, g: 211, b: 153, name: 'icon16.png' },    // green
  { size: 48, r: 52, g: 211, b: 153, name: 'icon48.png' },    // green
  { size: 128, r: 16, g: 185, b: 129, name: 'icon128.png' },   // darker green
];

for (const { size, r, g, b, name } of icons) {
  const png = createPNG(size, r, g, b);
  const path = resolve(iconsDir, name);
  writeFileSync(path, png);
  console.log(`  ✓ ${name} (${size}x${size})`);
}

console.log('✅ Icons generated');
