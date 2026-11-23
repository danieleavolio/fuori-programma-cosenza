import { titleToken } from './normalize_schedule.mjs';

const day = 86400000;
const spaceImage = /^https:\/\/www\.thespacecinema\.it\/-\/(?:jssmedia|media)\/the-space-cinema\/schede-film\/[^?#]+\.(?:jpe?g|png|webp)(?:\?rev=[a-f0-9]+)?$/i;

export const effectiveWidth = ({ width, height }) => Math.min(width, height * 2 / 3);
const portrait = ({ width, height }) => width / height >= .48 && width / height <= .84;

export function curatedSourcesForMovie(entries, movie, cinemaSources = []) {
  const title = titleToken(movie.title);
  return entries.filter(entry => titleToken(entry.title) === title && (
    movie.year
      ? entry.year === String(movie.year)
      : entry.announcementPosters?.some(poster => cinemaSources.includes(poster))
  ));
}

export function selectPoster(current, options) {
  const currentWidth = current && portrait(current) ? effectiveWidth(current) : 0;
  // Beyond the size we actually serve, extra source pixels don't improve the
  // card. For a tie, prefer the verified external poster.
  const servedWidth = (width) => Math.min(780, width);
  return options.filter(({ image, external }) => image && portrait(image)
    && (external
      ? effectiveWidth(image) >= 540 && servedWidth(effectiveWidth(image)) >= servedWidth(currentWidth)
      : effectiveWidth(image) >= currentWidth * 1.1)
  ).sort((a, b) => servedWidth(effectiveWidth(b.image)) - servedWidth(effectiveWidth(a.image))
    || Number(b.external) - Number(a.external))[0] ?? null;
}

export function spaceFilmPaths(xml) {
  return new Set([...xml.matchAll(/<loc>\s*https:\/\/www\.thespacecinema\.it(\/film\/[a-z0-9-]+)\/?\s*<\/loc>/gi)].map((match) => match[1]));
}

export function posterFromSpaceHTML(html, expected, updatedAt) {
  const payload = html.match(/<script\b[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i)?.[1];
  if (!payload) return null;
  let film;
  try { film = JSON.parse(payload)?.props?.pageProps?.layoutData?.sitecore?.context?.film; } catch { return null; }
  if (!film || titleToken(film.filmName?.value) !== titleToken(expected.title)) return null;
  const image = film.posterImage?.src;
  const release = film.releaseDate?.dateValue;
  if (!spaceImage.test(image) || !Number.isFinite(release) || release <= 0) return null;
  const director = titleToken(expected.director);
  const foundDirector = titleToken(film.director?.value);
  if (director && foundDirector && director !== foundDirector) return null;
  const releaseYear = String(new Date(release).getUTCFullYear());
  const years = [expected.year, expected.releaseDateIT?.slice(0, 4)].filter(Boolean).map(String);
  if (years.length) {
    if (!years.includes(releaseYear) && !(director && director === foundDirector)) return null;
  } else {
    // Un annuncio senza anno si confronta solo con un'uscita recente o
    // imminente: una scheda d'archivio omonima non è una corrispondenza.
    const reference = Date.parse(updatedAt);
    if (!Number.isFinite(reference) || release < reference - 14 * day || release > reference + 370 * day) return null;
  }
  return image;
}
