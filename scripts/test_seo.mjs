// Controlla l'HTML SSR senza browser/JavaScript, come un crawler social.
import assert from 'node:assert/strict';
import sharp from 'sharp';

const base = process.argv[2] || 'http://127.0.0.1:5173';
const origin = new URL(process.env.FP_SITE_URL || 'https://fuoriprogramma.dpdns.org').origin;
const decode = (value) => value.replaceAll('&amp;', '&').replaceAll('&quot;', '"').replaceAll('&#39;', "'").replaceAll('&lt;', '<').replaceAll('&gt;', '>');
const attributes = (tag) => Object.fromEntries([...tag.matchAll(/([\w:-]+)="([^"]*)"/g)].map((match) => [match[1], decode(match[2])]));
const get = (path, userAgent) => fetch(new URL(path, base), { signal: AbortSignal.timeout(20000), headers: userAgent ? { 'user-agent': userAgent } : {} });
const meta = (html, key) => {
  const values = [...html.matchAll(/<meta\b[^>]*>/g)].map((match) => attributes(match[0])).filter((tag) => tag.name === key || tag.property === key);
  assert.equal(values.length, 1, `Un solo meta ${key}`);
  assert.ok(values[0].content?.trim(), `${key} non vuoto`);
  return values[0].content;
};
const canonical = (html) => {
  const tags = [...html.matchAll(/<link\b[^>]*>/g)].map((match) => attributes(match[0])).filter((tag) => tag.rel === 'canonical');
  assert.equal(tags.length, 1, 'Un solo canonical');
  return tags[0].href;
};
const sitemapResponse = await get('/sitemap.xml');
assert.equal(sitemapResponse.status, 200);
assert.match(sitemapResponse.headers.get('content-type'), /xml/);
const sitemap = await sitemapResponse.text();
const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => decode(match[1]));
assert.ok(urls.length >= 10);
assert.equal(new Set(urls).size, urls.length, 'URL sitemap univoci');
const seenTitles = new Set();
const seenDescriptions = new Set();
const images = new Map();
const internalLinks = new Set();
for (const url of urls) {
  assert.equal(new URL(url).origin, origin, 'Dominio sitemap canonico');
  const path = new URL(url).pathname;
  const response = await get(path);
  assert.equal(response.status, 200, path);
  assert.doesNotMatch(response.headers.get('x-robots-tag') || '', /noindex/, path);
  const html = await response.text();
  const head = html.match(/<head[^>]*>([\s\S]*?)<\/head>/)?.[1];
  assert.ok(head, `${path}: head presente in SSR`);
  assert.match(html, /<html\b[^>]*lang="it"/);
  assert.equal((html.match(/<h1\b/g) || []).length, 1, `${path}: un H1`);
  assert.equal((head.match(/<title>/g) || []).length, 1, `${path}: un title`);
  const title = decode(head.match(/<title>([^<]+)<\/title>/)?.[1] || '');
  assert.ok(title);
  assert.ok(!seenTitles.has(title), `Titolo univoco: ${title}`);
  seenTitles.add(title);
  const description = meta(head, 'description');
  assert.ok(!seenDescriptions.has(description), `Descrizione univoca: ${path}`);
  seenDescriptions.add(description);
  assert.equal(canonical(head), url, `${path}: canonical`);
  assert.equal(meta(head, 'og:url'), url);
  assert.match(meta(head, 'robots'), /max-image-preview:large/);
  assert.doesNotMatch(meta(head, 'robots'), /noindex/);
  assert.equal(meta(head, 'og:locale'), 'it_IT');
  assert.equal(meta(head, 'og:site_name'), 'Fuori programma');
  assert.equal(meta(head, 'og:title'), meta(head, 'twitter:title'));
  assert.equal(meta(head, 'og:description'), meta(head, 'twitter:description'));
  assert.equal(meta(head, 'twitter:card'), 'summary_large_image');
  const image = meta(head, 'og:image');
  assert.equal(new URL(image).origin, origin);
  assert.equal(meta(head, 'twitter:image'), image);
  assert.equal(meta(head, 'og:image:secure_url'), image);
  assert.equal(meta(head, 'og:image:alt'), meta(head, 'twitter:image:alt'));
  assert.equal(meta(head, 'og:image:width'), '1200');
  assert.equal(meta(head, 'og:image:height'), '630');
  images.set(image, meta(head, 'og:image:type'));
  const schemas = [];
  for (const match of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    const schema = JSON.parse(match[1]);
    assert.equal(schema['@context'], 'https://schema.org');
    schemas.push(...(schema['@graph'] || [schema]));
  }
  if (path === '/') {
    const websites = schemas.filter((schema) => schema['@type'] === 'WebSite');
    assert.equal(websites.length, 1, 'Una sola identita WebSite sulla home');
    assert.equal(websites[0].name, meta(head, 'og:site_name'));
    assert.equal(websites[0].url, `${origin}/`);
    assert.ok(websites[0].alternateName.includes(new URL(origin).hostname), 'Hostname come nome alternativo di riserva');
    const icons = [...head.matchAll(/<link\b[^>]*>/g)].map((match) => attributes(match[0])).filter((tag) => tag.rel === 'icon');
    const png = icons.find((icon) => icon.type === 'image/png' && icon.sizes === '192x192');
    assert.ok(png, 'Favicon PNG esplicita per Google Search');
    assert.equal(png.href, '/icons/icon-192.png');
    const iconResponse = await get(png.href, 'Googlebot-Image/1.0');
    assert.equal(iconResponse.status, 200);
    assert.match(iconResponse.headers.get('content-type'), /image\/png/);
    assert.doesNotMatch(iconResponse.headers.get('x-robots-tag') || '', /noindex/);
    const iconMetadata = await sharp(Buffer.from(await iconResponse.arrayBuffer())).metadata();
    assert.equal(iconMetadata.width, 192);
    assert.equal(iconMetadata.height, 192);
  }
  if (path !== '/calendario') assert.match(html, /application\/ld\+json/, path);
  if (path === '/prossimamente') {
    assert.doesNotMatch(html, /class="period-nav/);
    assert.match(html, /<h1\b[^>]*id="page-title"[^>]*>Prossimamente<\/h1>/);
    assert.match(html, /I film in arrivo nei cinema/);
  }
  for (const match of html.matchAll(/<a\b[^>]*href="([^"]+)"/g)) {
    const link = new URL(decode(match[1]), url);
    if (link.origin === origin && !link.search && link.pathname !== '/evento.ics') internalLinks.add(link.pathname);
  }
  console.log(`SEO SSR OK ${path}`);
}
for (const path of internalLinks) assert.ok(urls.includes(new URL(path, origin).href), `Link interno indicizzabile in sitemap: ${path}`);
for (const [image, mime] of images) {
  const url = new URL(image);
  const response = await get(url.pathname + url.search, 'Twitterbot/1.0');
  assert.equal(response.status, 200, image);
  assert.ok(response.headers.get('content-type')?.startsWith(mime), image);
  const bytes = Buffer.from(await response.arrayBuffer());
  assert.ok(bytes.length < 5_000_000, `Immagine social <5MB: ${image}`);
  const metadata = await sharp(bytes).metadata();
  assert.equal(metadata.width, 1200, image);
  assert.equal(metadata.height, 630, image);
}
const film = urls.find((url) => new URL(url).pathname.startsWith('/film/'));
for (const agent of ['Googlebot', 'Twitterbot/1.0', 'facebookexternalhit/1.1', 'WhatsApp/2.0']) {
  for (const path of ['/', '/prossimamente', new URL(film).pathname]) {
    const response = await get(path, agent);
    assert.equal(response.status, 200, `${agent}: ${path}`);
    const html = await response.text();
    assert.equal(canonical(html), new URL(path, origin).href);
    assert.ok(meta(html, 'og:image'));
  }
}
for (const path of ['/film/inesistente', '/cinema/inesistente', '/programmazione/inesistente', '/programmazione/toString']) {
  const response = await get(path);
  assert.equal(response.status, 404, path);
  assert.match(response.headers.get('x-robots-tag'), /noindex/);
}
const legacy = await get('/legacy/index.html');
assert.equal(legacy.status, 200);
assert.match(meta(await legacy.text(), 'robots'), /noindex/);
const robots = await (await get('/robots.txt')).text();
assert.match(robots, /Allow: \//);
assert.ok(robots.includes(`Sitemap: ${origin}/sitemap.xml`));
// I parametri dei filtri non devono creare nuove pagine canoniche.
for (const path of ['/?view=schedule&utm_source=test', '/calendario?cinema=garden', '/prossimamente?utm_source=test']) {
  const html = await (await get(path)).text();
  assert.equal(canonical(html), new URL(new URL(path, base).pathname, origin).href);
}
console.log(JSON.stringify({ pages: urls.length, socialImages: images.size, crawlerAgents: 4, canonicalOrigin: origin, result: 'passed' }));
