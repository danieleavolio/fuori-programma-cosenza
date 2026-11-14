import manifest from '../og-manifest.json';

// Le immagini sono prodotte da scripts/make_og.mjs: se una locandina non era
// raggiungibile il manifest non la elenca e si usa l'immagine di default.
const films = manifest.films as Record<string, string>;

export const ogDefault: string = manifest.default;

export function ogForFilm(slug: string): string {
  return films[slug] ?? ogDefault;
}
