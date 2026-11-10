// Gateway di scaricamento per le fonti protette da challenge anti-bot.
//
// Il WAF di AWS davanti alle sale 18tickets risponde ai runner GitHub con una
// challenge JavaScript. I worker Cloudflare non hanno questo problema, quindi
// possono fare da tramite per il download delle pagine.
//
// Uso: GET https://<worker>.<account>.workers.dev/?url=<url-encoded>
//
// Deploy (richiede un account Cloudflare gratuito):
//   npx wrangler deploy worker/proxy-worker.js --name fp-proxy
//
// Poi impostare la variabile del repository FP_PROXY_GATEWAYS con:
//   worker=https://<worker>.<account>.workers.dev/?url={url}

export default {
  async fetch(request) {
    const target = new URL(request.url).searchParams.get('url');
    if (!target) {
      return new Response('serve ?url=<url da scaricare>', { status: 400 });
    }
    let parsed;
    try {
      parsed = new URL(target);
    } catch {
      return new Response('url non valido', { status: 400 });
    }
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return new Response('protocollo non consentito', { status: 400 });
    }

    const response = await fetch(parsed.toString(), {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
          '(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'it-IT,it;q=0.9,en-US;q=0.8,en;q=0.7',
      },
      redirect: 'follow',
    });

    const body = await response.text();
    return new Response(body, {
      status: response.status,
      headers: {
        'content-type': response.headers.get('content-type') || 'text/html; charset=utf-8',
        'cache-control': 'no-store',
      },
    });
  },
};
