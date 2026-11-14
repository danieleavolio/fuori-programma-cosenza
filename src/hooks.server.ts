import type { Handle } from '@sveltejs/kit/hooks';

// Le anteprime Vercel non devono finire nei risultati di ricerca. Sul sito
// pubblico, invece, l'HTML puo' stare in cache CDN per pochi minuti: gli orari
// cambiano solo con un nuovo deploy o con l'aggiornamento del bot.
export const handle: Handle = async ({ event, resolve }) => {
  const response = await resolve(event);
  const vercelEnv = process.env.VERCEL_ENV;

  if (vercelEnv && vercelEnv !== 'production') {
    response.headers.set('x-robots-tag', 'noindex, nofollow');
  } else if (event.request.method === 'GET' && response.headers.get('content-type')?.includes('text/html')) {
    response.headers.set('cache-control', 'public, max-age=0, s-maxage=300, stale-while-revalidate=600');
  }

  return response;
};
