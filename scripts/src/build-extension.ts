/**
 * Build script: generates extension icons and packages everything as a zip.
 * Run: pnpm --filter @workspace/scripts run build-extension
 */

import { deflateSync } from "zlib";
import { writeFileSync, readFileSync, readdirSync, mkdirSync, statSync } from "fs";
import { join, resolve, relative } from "path";

const ROOT = resolve(import.meta.dirname, "../..");
const EXT_DIR = join(ROOT, "browser-extension");
const OUT_DIR = join(ROOT, "artifacts/pccscribe/public");

// ─── PNG Generator (pure Node.js, no deps) ───────────────────────────────────

function crc32(buf: Buffer): number {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c;
  }
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function makeChunk(type: string, data: Buffer): Buffer {
  const tb = Buffer.from(type, "ascii");
  const crcInput = Buffer.concat([tb, data]);
  const chunk = Buffer.allocUnsafe(4 + 4 + data.length + 4);
  chunk.writeUInt32BE(data.length, 0);
  tb.copy(chunk, 4);
  data.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(crcInput), 8 + data.length);
  return chunk;
}

function createPNG(size: number, pixels: (x: number, y: number) => [number, number, number, number]): Buffer {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdr = Buffer.allocUnsafe(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0; // RGBA

  const rows: Buffer[] = [];
  for (let y = 0; y < size; y++) {
    const row = Buffer.allocUnsafe(1 + size * 4);
    row[0] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixels(x, y);
      row[1 + x * 4] = r; row[2 + x * 4] = g; row[3 + x * 4] = b; row[4 + x * 4] = a;
    }
    rows.push(row);
  }

  const raw = Buffer.concat(rows);
  const compressed = deflateSync(raw, { level: 9 });

  return Buffer.concat([
    sig,
    makeChunk("IHDR", ihdr),
    makeChunk("IDAT", compressed),
    makeChunk("IEND", Buffer.alloc(0)),
  ]);
}

function drawIcon(size: number): Buffer {
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2;
  const innerR = r * 0.75;

  return createPNG(size, (x, y) => {
    const dx = x + 0.5 - cx;
    const dy = y + 0.5 - cy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const antialias = Math.max(0, Math.min(1, r - dist));

    if (dist > r) return [0, 0, 0, 0]; // transparent outside

    // Blue circle
    const bg: [number, number, number, number] = [37, 99, 235, Math.round(255 * antialias)];

    // White stethoscope-like cross in center
    if (dist < innerR) {
      const barW = size * 0.10;
      const barH = size * 0.40;
      const inH = Math.abs(dy) < barH / 2 && Math.abs(dx) < barW / 2;
      const inV = Math.abs(dx) < barH / 2 && Math.abs(dy) < barW / 2;
      if (inH || inV) return [255, 255, 255, Math.round(255 * antialias)];
    }

    return bg;
  });
}

// ─── ZIP Creator (pure Node.js) ───────────────────────────────────────────────
// Implements PKZIP local file header format

function dosDate(d: Date): number {
  return ((d.getFullYear() - 1980) << 25) | ((d.getMonth() + 1) << 21) | (d.getDate() << 16) |
    (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
}

function crc32Buf(buf: Buffer): number {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c;
  }
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

interface ZipEntry {
  name: string;
  data: Buffer;
  offset: number;
  crc: number;
  dosDate: number;
}

function buildZip(files: { name: string; data: Buffer }[]): Buffer {
  const now = new Date();
  const dd = dosDate(now);
  const entries: ZipEntry[] = [];
  const localParts: Buffer[] = [];
  let offset = 0;

  for (const { name, data } of files) {
    const crc = crc32Buf(data);
    const nameBuf = Buffer.from(name, "utf8");
    const local = Buffer.allocUnsafe(30 + nameBuf.length);
    local.writeUInt32LE(0x04034b50, 0); // signature
    local.writeUInt16LE(20, 4);         // version needed
    local.writeUInt16LE(0, 6);          // flags
    local.writeUInt16LE(0, 8);          // compression: stored
    local.writeUInt32LE(dd, 10);        // mod date
    local.writeUInt32LE(crc, 14);       // crc
    local.writeUInt32LE(data.length, 18); // compressed size
    local.writeUInt32LE(data.length, 22); // uncompressed size
    local.writeUInt16LE(nameBuf.length, 26); // name length
    local.writeUInt16LE(0, 28);         // extra length
    nameBuf.copy(local, 30);

    entries.push({ name, data, offset, crc, dosDate: dd });
    localParts.push(local, data);
    offset += local.length + data.length;
  }

  // Central directory
  const centralParts: Buffer[] = [];
  for (const e of entries) {
    const nameBuf = Buffer.from(e.name, "utf8");
    const cd = Buffer.allocUnsafe(46 + nameBuf.length);
    cd.writeUInt32LE(0x02014b50, 0); // signature
    cd.writeUInt16LE(20, 4);         // version made by
    cd.writeUInt16LE(20, 6);         // version needed
    cd.writeUInt16LE(0, 8);          // flags
    cd.writeUInt16LE(0, 10);         // compression
    cd.writeUInt32LE(e.dosDate, 12); // mod date
    cd.writeUInt32LE(e.crc, 16);     // crc
    cd.writeUInt32LE(e.data.length, 20); // compressed size
    cd.writeUInt32LE(e.data.length, 24); // uncompressed size
    cd.writeUInt16LE(nameBuf.length, 28); // name length
    cd.writeUInt16LE(0, 30);         // extra length
    cd.writeUInt16LE(0, 32);         // comment length
    cd.writeUInt16LE(0, 34);         // disk start
    cd.writeUInt16LE(0, 36);         // internal attrs
    cd.writeUInt32LE(0, 38);         // external attrs
    cd.writeUInt32LE(e.offset, 42);  // local header offset
    nameBuf.copy(cd, 46);
    centralParts.push(cd);
  }

  const centralBuf = Buffer.concat(centralParts);
  const eocd = Buffer.allocUnsafe(22);
  eocd.writeUInt32LE(0x06054b50, 0); // signature
  eocd.writeUInt16LE(0, 4);          // disk number
  eocd.writeUInt16LE(0, 6);          // disk with cd
  eocd.writeUInt16LE(entries.length, 8);  // entries on disk
  eocd.writeUInt16LE(entries.length, 10); // total entries
  eocd.writeUInt32LE(centralBuf.length, 12); // cd size
  eocd.writeUInt32LE(offset, 16);    // cd offset
  eocd.writeUInt16LE(0, 20);         // comment length

  return Buffer.concat([...localParts, centralBuf, eocd]);
}

// ─── Collect Extension Files ──────────────────────────────────────────────────

function collectFiles(dir: string, base: string = dir): { name: string; data: Buffer }[] {
  const results: { name: string; data: Buffer }[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const rel = relative(base, full).replace(/\\/g, "/");
    const stat = statSync(full);
    if (stat.isDirectory()) {
      results.push(...collectFiles(full, base));
    } else {
      results.push({ name: rel, data: readFileSync(full) });
    }
  }
  return results;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

console.log("Generating extension icons...");
const iconsDir = join(EXT_DIR, "icons");
mkdirSync(iconsDir, { recursive: true });

for (const size of [16, 48, 128]) {
  const png = drawIcon(size);
  const path = join(iconsDir, `icon${size}.png`);
  writeFileSync(path, png);
  console.log(`  icon${size}.png — ${png.length} bytes`);
}

console.log("Collecting extension files...");
const files = collectFiles(EXT_DIR);
console.log(`  ${files.length} files collected`);

console.log("Building zip...");
const zip = buildZip(files);

mkdirSync(OUT_DIR, { recursive: true });
const outPath = join(OUT_DIR, "pccscribe-extension.zip");
writeFileSync(outPath, zip);
console.log(`\n✓ Extension packaged: ${outPath} (${(zip.length / 1024).toFixed(1)} KB)`);
console.log("\nInstall instructions:");
console.log("  1. Unzip the file");
console.log("  2. Go to chrome://extensions");
console.log("  3. Enable Developer Mode");
console.log("  4. Click 'Load unpacked' and select the unzipped folder");
