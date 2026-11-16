import type { RequestHandler } from './$types';
import { siteOrigin } from '../../lib/server/site';

export const GET: RequestHandler = () => {
  const preview = process.env.VERCEL_ENV && process.env.VERCEL_ENV !== 'production';
  const body = preview
    ? 'User-agent: *\nDisallow: /\n'
    : `User-agent: *\nAllow: /\nSitemap: ${siteOrigin}/sitemap.xml\n`;
  return new Response(body, { headers: { 'content-type': 'text/plain; charset=utf-8' } });
};
