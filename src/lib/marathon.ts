// Pianificatore "maratona": dato un giorno e alcuni film, trova le sequenze di
// spettacoli che si possono vedere una dopo l'altra. Modulo puro, senza
// dipendenze dal server: gira sia in SSR sia nel browser.

export type PlanShow = {
  venue: string;
  venueName: string;
  time: string;
  /** Minuti dalla mezzanotte. */
  start: number;
  room?: string;
  url: string;
};

export type PlanFilm = {
  slug: string;
  title: string;
  poster?: string;
  filmPath: string;
  /** Durata in minuti; null se la sala non l'ha pubblicata. */
  duration: number | null;
  durationLabel?: string;
  shows: PlanShow[];
};

export type PlanDay = { iso: string; label: string; films: PlanFilm[] };

export type PlanOptions = {
  /** Minuti di spostamento tra due sale diverse. */
  travel: number;
  /** Minuti di pubblicità e trailer prima del film. */
  ads: number;
};

export type Step = {
  film: PlanFilm;
  show: PlanShow;
  /** Fine stimata in minuti dalla mezzanotte. */
  end: number;
  estimatedDuration: boolean;
  /** Minuti liberi prima di questo spettacolo, spostamento escluso (null per il primo). */
  slack: number | null;
  /** True se c'è da cambiare sala rispetto allo spettacolo precedente. */
  moves: boolean;
};

export type Itinerary = { steps: Step[]; idle: number };

export type PlanResult = {
  /** Numero massimo di film selezionati che si riescono a vedere insieme. */
  size: number;
  itineraries: Itinerary[];
  /** Totale delle combinazioni trovate con quel numero di film. */
  total: number;
};

/** Durata usata quando la sala non pubblica quella del film. */
export const FALLBACK_DURATION = 120;
export const MAX_FILMS = 5;
/** Sotto questa soglia di minuti liberi il cambio è segnalato come stretto. */
export const TIGHT_SLACK = 10;

export function parseDuration(value?: string): number | null {
  if (!value) return null;
  const hours = Number(value.match(/(\d+)\s*h/i)?.[1] || 0);
  const minutes = Number(value.match(/(\d+)\s*(?:m|min)\b/i)?.[1] || 0);
  const total = hours * 60 + minutes;
  if (total) return total;
  const bare = Number(value.match(/^\s*(\d+)\s*$/)?.[1]);
  return bare || null;
}

export function toMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + (m || 0);
}

export function formatMinutes(total: number): string {
  const day = ((total % 1440) + 1440) % 1440;
  return `${String(Math.floor(day / 60)).padStart(2, '0')}:${String(day % 60).padStart(2, '0')}`;
}

export function formatSpan(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

const LIMIT = 12;

export function plan(films: PlanFilm[], options: PlanOptions): PlanResult {
  const found: Itinerary[] = [];
  let size = 0;

  const visit = (steps: Step[], remaining: PlanFilm[]) => {
    if (steps.length) {
      if (steps.length > size) { size = steps.length; found.length = 0; }
      if (steps.length === size) {
        found.push({ steps: [...steps], idle: steps.reduce((sum, step) => sum + (step.slack || 0), 0) });
      }
    }
    const last = steps.at(-1);
    for (const film of remaining) {
      const rest = remaining.filter((item) => item !== film);
      for (const show of film.shows) {
        const moves = Boolean(last && last.show.venue !== show.venue);
        const ready = last ? last.end + (moves ? options.travel : 0) : -Infinity;
        if (show.start < ready) continue;
        const estimatedDuration = film.duration === null;
        const end = show.start + options.ads + (film.duration ?? FALLBACK_DURATION);
        steps.push({ film, show, end, estimatedDuration, slack: last ? show.start - ready : null, moves });
        visit(steps, rest);
        steps.pop();
      }
    }
  };

  visit([], films);
  const tight = (item: Itinerary) => item.steps.some((step) => step.slack !== null && step.slack < TIGHT_SLACK) ? 1 : 0;
  // Prima le combinazioni comode, poi quelle con meno attesa.
  found.sort((a, b) => tight(a) - tight(b)
    || a.idle - b.idle
    || a.steps[0].show.start - b.steps[0].show.start
    || a.steps.at(-1)!.end - b.steps.at(-1)!.end);
  return { size, itineraries: found.slice(0, LIMIT), total: found.length };
}

/** True se `candidate` si può aggiungere ai film già scelti mantenendoli tutti. */
export function fits(chosen: PlanFilm[], candidate: PlanFilm, options: PlanOptions): boolean {
  return plan([...chosen, candidate], options).size === chosen.length + 1;
}
