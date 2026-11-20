import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

// Google richiede una favicon quadrata stabile con lato multiplo di 48.
// L'ICO con dentro i PNG a 16/32/48 evita che i client che chiedono
// /favicon.ico ricevano 404 e finiscano sull'icona dell'host (su Vercel
// succede con i domini *.vercel.app).
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(root, 'static/icons/icon-512.png');
const sizes = [16, 32, 48];

const images = await Promise.all(sizes.map((size) =>
  sharp(source).resize(size, size, { fit: 'cover' }).png({ compressionLevel: 9 }).toBuffer()));

const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0); // riservato
header.writeUInt16LE(1, 2); // tipo: icona
header.writeUInt16LE(images.length, 4); // numero di immagini

const entries = [];
let offset = 6 + 16 * images.length;
images.forEach((image, index) => {
  const entry = Buffer.alloc(16);
  const size = sizes[index];
  entry.writeUInt8(size === 256 ? 0 : size, 0); // larghezza
  entry.writeUInt8(size === 256 ? 0 : size, 1); // altezza
  entry.writeUInt8(0, 2); // palette
  entry.writeUInt8(0, 3); // riservato
  entry.writeUInt16LE(1, 4); // piani
  entry.writeUInt16LE(32, 6); // bit per pixel
  entry.writeUInt32LE(image.length, 8); // dimensione
  entry.writeUInt32LE(offset, 12); // posizione
  entries.push(entry);
  offset += image.length;
});

await mkdir(path.join(root, 'static'), { recursive: true });
await writeFile(path.join(root, 'static/favicon.ico'), Buffer.concat([header, ...entries, ...images]));
console.log(`favicon.ico: ${sizes.join(', ')} px`);
