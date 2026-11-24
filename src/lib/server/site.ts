// Un solo dominio pubblico, anche quando la richiesta arriva da una preview.
// Su Vercel FP_SITE_URL vale https://fuoriprogramma.dpdns.org; il default è lo stesso
// dominio, così build e test locali producono gli stessi canonical della produzione.
const configured = new URL(process.env.FP_SITE_URL || 'https://fuoriprogramma.dpdns.org');
if (configured.protocol !== 'https:' || configured.pathname !== '/' || configured.search || configured.hash || configured.username || configured.password) {
  throw new Error('FP_SITE_URL deve essere un origin HTTPS, senza percorso o parametri');
}
export const siteOrigin = configured.origin;
