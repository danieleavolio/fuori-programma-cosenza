// Un solo dominio pubblico, anche quando la richiesta arriva da una preview.
// Un eventuale dominio personalizzato si configura con FP_SITE_URL su Vercel.
const configured = new URL(process.env.FP_SITE_URL || 'https://fuori-programma-cosenza.vercel.app');
if (configured.protocol !== 'https:' || configured.pathname !== '/' || configured.search || configured.hash || configured.username || configured.password) {
  throw new Error('FP_SITE_URL deve essere un origin HTTPS, senza percorso o parametri');
}
export const siteOrigin = configured.origin;
