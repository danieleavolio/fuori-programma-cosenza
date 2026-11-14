import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ url }) => {
  return new Response(null, {
    status: 307,
    headers: { location: `/legacy/index.html${url.search}` }
  });
};
