// Genera le immagini Open Graph (1200x630) a partire dalle locandine pubblicate
// dal bot. Scrive static/og/default.png, una immagine per film in
// static/og/<slug>.jpg e l'elenco dei file riusciti in src/lib/og-manifest.json.
// Se la rete non risponde il film viene omesso dal manifest: la pagina ricade
// sull'immagine di default invece di mostrare un'anteprima rotta.
import { mkdir, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const root = path.resolve(import.meta.dirname, '..');
const schedule = JSON.parse(readFileSync(path.join(root, 'data/schedule.json'), 'utf8'));
const outDir = path.join(root, 'static/og');
const manifestPath = path.join(root, 'src/lib/og-manifest.json');

const WIDTH = 1200;
const HEIGHT = 630;
const ACCENT = '#d93a2b';
const TEXT = '#f2f4f7';
const MUTED = '#9aa4b2';
const SANS = "'Segoe UI', 'Helvetica Neue', Arial, sans-serif";
const MONO = "Consolas, 'Liberation Mono', monospace";

const escapeXml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;'
}[char]));

const slugify = (value) => String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const filmSlug = (movie) => `${slugify(movie.title)}-${movie.year || movie.id}`;

/** Spezza il testo in righe che stanno dentro `maxWidth` px. */
function wrap(text, fontSize, maxWidth, maxLines = 3) {
  const perChar = fontSize * 0.53;
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (candidate.length * perChar > maxWidth && line) {
      lines.push(line);
      line = word;
      if (lines.length === maxLines) break;
    } else {
      line = candidate;
    }
  }
  if (line && lines.length < maxLines) lines.push(line);
  const joined = lines.join(' ');
  if (joined.length < String(text).length - 1) {
    lines[lines.length - 1] = `${lines[lines.length - 1].replace(/[,;:\s]+$/, '')}…`;
  }
  return lines;
}

const backdrop = `
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#1d232b"/>
      <stop offset="100%" stop-color="#0c0f14"/>
    </linearGradient>
    <pattern id="grid" width="48" height="48" patternUnits="userSpaceOnUse">
      <path d="M48 0H0V48" fill="none" stroke="#ffffff" stroke-opacity="0.035" stroke-width="1"/>
    </pattern>
  </defs>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#bg)"/>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#grid)"/>
  <rect x="0" y="0" width="${WIDTH}" height="7" fill="${ACCENT}"/>`;

function svgFrame(inner) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">${backdrop}${inner}</svg>`;
}

const mark = (x, y) => `
  <rect x="${x}" y="${y}" width="84" height="84" rx="6" fill="none" stroke="${TEXT}" stroke-opacity="0.35" stroke-width="2"/>
  <text x="${x + 42}" y="${y + 54}" font-family="${SANS}" font-size="34" font-weight="700" fill="${TEXT}" text-anchor="middle" letter-spacing="-1">fp</text>`;

const venueNames = (schedule.venues || []).map((venue) => venue.name.toUpperCase()).join('  ·  ');

function defaultSvg() {
  return svgFrame(`
    <rect x="86" y="176" width="7" height="150" fill="${ACCENT}"/>
    <text x="120" y="238" font-family="${SANS}" font-size="84" font-weight="700" fill="${TEXT}" letter-spacing="-3">fuori</text>
    <text x="120" y="322" font-family="${SANS}" font-size="84" font-weight="700" fill="${TEXT}" letter-spacing="-3">programma</text>
    <text x="122" y="392" font-family="${SANS}" font-size="30" fill="${MUTED}">Orari dei cinema a Cosenza, Rende e Zumpano</text>
    ${mark(1030, 92)}
    <line x1="86" y1="520" x2="1114" y2="520" stroke="#ffffff" stroke-opacity="0.12" stroke-width="1"/>
    <text x="86" y="566" font-family="${MONO}" font-size="19" fill="${MUTED}" letter-spacing="2">${escapeXml(venueNames)}</text>`);
}

function filmSvg(movie) {
  const titleLines = wrap(movie.title, 56, 660, 3);
  const startY = titleLines.length > 2 ? 214 : 236;
  const title = titleLines.map((line, index) => (
    `<text x="86" y="${startY + index * 66}" font-family="${SANS}" font-size="56" font-weight="700" fill="${TEXT}" letter-spacing="-1.5">${escapeXml(line)}</text>`
  )).join('');
  const metaY = startY + titleLines.length * 66 + 22;
  const meta = [movie.year, movie.duration, (movie.genres || []).slice(0, 3).join(' · ')].filter(Boolean).join('  ·  ');
  return svgFrame(`
    <rect x="86" y="150" width="7" height="${Math.max(120, titleLines.length * 66 + 70)}" fill="${ACCENT}"/>
    <text x="86" y="140" font-family="${MONO}" font-size="18" fill="${ACCENT}" letter-spacing="3">IN PROGRAMMAZIONE</text>
    ${title}
    <text x="88" y="${metaY}" font-family="${SANS}" font-size="24" fill="${MUTED}">${escapeXml(meta)}</text>
    <text x="86" y="560" font-family="${SANS}" font-size="28" font-weight="700" fill="${TEXT}" letter-spacing="-1">fuori programma</text>
    <text x="86" y="594" font-family="${MONO}" font-size="17" fill="${MUTED}" letter-spacing="2">CINEMA A COSENZA E RENDE</text>`);
}

async function download(url, budget) {
  const response = await fetch(url, { signal: AbortSignal.timeout(budget) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

async function buildFilm(movie) {
  const slug = filmSlug(movie);
  const base = await sharp(Buffer.from(filmSvg(movie))).png().toBuffer();
  let poster;
  try {
    poster = await download(movie.poster, 12000);
  } catch {
    return null;
  }
  const cover = await sharp(poster).resize(420, HEIGHT, { fit: 'cover', position: 'attention' })
    .modulate({ brightness: 0.96 }).jpeg({ quality: 86 }).toBuffer();
  const composed = await sharp(base)
    .composite([
      { input: cover, left: 780, top: 0 },
      { input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="4" height="${HEIGHT}"><rect width="4" height="${HEIGHT}" fill="#000000" fill-opacity="0.45"/></svg>`), left: 780, top: 0 }
    ])
    .jpeg({ quality: 84, mozjpeg: true })
    .toBuffer();
  await writeFile(path.join(outDir, `${slug}.jpg`), composed);
  return `/og/${slug}.jpg`;
}

async function pool(items, size, worker) {
  const results = [];
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => {
    while (cursor < items.length) {
      const item = items[cursor++];
      results.push({ item, result: await worker(item) });
    }
  }));
  return results;
}

await mkdir(outDir, { recursive: true });

await sharp(Buffer.from(defaultSvg())).png({ compressionLevel: 9 }).toFile(path.join(outDir, 'default.png'));

const films = {};
const candidates = (schedule.movies || []).filter((movie) => movie.poster && movie.title);
const built = await pool(candidates, 4, async (movie) => {
  try {
    return await buildFilm(movie);
  } catch {
    return null;
  }
});
for (const { item, result } of built) {
  if (result) films[filmSlug(item)] = result;
}

await writeFile(manifestPath, `${JSON.stringify({ default: '/og/default.png', films }, null, 2)}\n`);
console.log(`og: default.png + ${Object.keys(films).length}/${candidates.length} film`);
