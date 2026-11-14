import { venues } from '../../lib/server/data';
import type { PageServerLoad } from './$types';

// Keep subscriptions on the existing publisher: deploy previews must not become
// a second, potentially stale source of calendar updates.
const feedBase = 'https://danieleavolio.github.io/fuori-programma-cosenza/calendars/';

export const load: PageServerLoad = ({ url }) => {
  const requested = url.searchParams.getAll('cinema');
  const selected = requested.length
    ? venues.filter((venue) => requested.includes(venue.id)).map((venue) => venue.id).sort()
    : venues.map((venue) => venue.id).sort();
  const file = selected.length === venues.length ? 'all' : selected.join('_');
  const feed = selected.length ? `${feedBase}${file}.ics` : '';
  const name = 'Fuori programma — ' + venues.filter((venue) => selected.includes(venue.id)).map((venue) => venue.name).join(', ');
  return {
    venues, selected, feed,
    canonical: `${url.origin}/calendario`,
    apple: feed.replace(/^https:/, 'webcal:'),
    google: feed ? `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(feed)}` : '',
    outlook: feed ? `https://outlook.live.com/calendar/0/addfromweb?${new URLSearchParams({ url: feed, name })}` : ''
  };
};
