import { createHash } from 'node:crypto';
import type { RequestHandler } from './$types';

const escapeText = (value: string) => value.replace(/\\/g, '\\\\').replace(/\r\n|\r|\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,');

function fold(line: string) {
  const parts: string[] = [];
  let current = '';
  let bytes = 0;
  for (const char of line) {
    const size = new TextEncoder().encode(char).length;
    if (bytes + size > 73) {
      parts.push(current);
      current = ` ${char}`;
      bytes = 1 + size;
    } else {
      current += char;
      bytes += size;
    }
  }
  parts.push(current);
  return parts.join('\r\n');
}

export const GET: RequestHandler = ({ url }) => {
  const title = (url.searchParams.get('title') || '').trim().slice(0, 180);
  const venue = (url.searchParams.get('venue') || '').trim().slice(0, 140);
  const date = url.searchParams.get('date') || '';
  const time = url.searchParams.get('time') || '';
  const room = (url.searchParams.get('room') || '').trim().slice(0, 80);
  const link = url.searchParams.get('url') || '';
  const minutes = Number(url.searchParams.get('minutes') || 110);
  const [year, month, day] = date.split('-').map(Number);
  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10) === date;
  if (!title || !venue || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time) ||
      !validDate ||
      !Number.isInteger(minutes) || minutes < 30 || minutes > 360 ||
      (link && (!/^https:\/\//.test(link) || /[\r\n]/.test(link)))) {
    return new Response('Parametri evento non validi', { status: 400 });
  }
  const start = `${date.replaceAll('-', '')}T${time.replace(':', '')}00`;
  const uidSeed = [date, time, venue.toLocaleLowerCase('it'), room.toLocaleLowerCase('it'), title.toLocaleLowerCase('it')].join('|');
  const uid = `${createHash('sha256').update(uidSeed).digest('hex').slice(0, 32)}@fuori-programma-cosenza`;
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const desc = [`Film: ${title}`, `Cinema: ${venue}`, room ? `Sala: ${room}` : '', `Durata indicativa: ${minutes} minuti, escluse pubblicità e intervallo.`, link ? `Biglietti: ${link}` : ''].filter(Boolean).join('\n');
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Fuori Programma Cosenza//Evento//IT',
    'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'BEGIN:VTIMEZONE', 'TZID:Europe/Rome',
    'X-LIC-LOCATION:Europe/Rome', 'BEGIN:DAYLIGHT', 'TZOFFSETFROM:+0100', 'TZOFFSETTO:+0200',
    'TZNAME:CEST', 'DTSTART:19700329T020000', 'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU',
    'END:DAYLIGHT', 'BEGIN:STANDARD', 'TZOFFSETFROM:+0200', 'TZOFFSETTO:+0100', 'TZNAME:CET',
    'DTSTART:19701025T030000', 'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU', 'END:STANDARD',
    'END:VTIMEZONE', 'BEGIN:VEVENT', `UID:${uid}`, `DTSTAMP:${stamp}`,
    `DTSTART;TZID=Europe/Rome:${start}`, `DURATION:PT${minutes}M`,
    `SUMMARY:${escapeText(`${title} — ${venue}`)}`, `LOCATION:${escapeText([venue, room].filter(Boolean).join(', '))}`,
    `DESCRIPTION:${escapeText(desc)}`, ...(link ? [`URL:${link}`] : []),
    'BEGIN:VALARM', 'TRIGGER:-PT45M', 'ACTION:DISPLAY',
    `DESCRIPTION:${escapeText(`${title} tra 45 minuti`)}`, 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR'
  ];
  return new Response(`${lines.map(fold).join('\r\n')}\r\n`, {
    headers: {
      'content-type': 'text/calendar; charset=utf-8; method=PUBLISH',
      'content-disposition': `inline; filename="${date}-${time.replace(':', '')}.ics"`,
      'cache-control': 'no-store',
      'x-robots-tag': 'noindex',
      'x-content-type-options': 'nosniff'
    }
  });
};
