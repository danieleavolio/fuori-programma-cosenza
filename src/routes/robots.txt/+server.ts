import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ url }) => {
  const preview = process.env.VERCEL_ENV && process.env.VERCEL_ENV !== 'production';
  const body = preview
    ? 'User-agent: *\nDisallow: /\n'
    : `User-agent: *\nAllow: /\nDisallow: /legacy/\nSitemap: ${url.origin}/sitemap.xml\n`;
  return new Response(body, { headers: { 'content-type': 'text/plain; charset=utf-8' } });
};
