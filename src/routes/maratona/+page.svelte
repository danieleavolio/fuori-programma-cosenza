<script lang="ts">
  import { goto } from '$app/navigation';
  import { flip } from 'svelte/animate';
  import { fade, fly, scale } from 'svelte/transition';
  import { cubicOut, backOut } from 'svelte/easing';
  import { page } from '$app/state';
  import JsonLd from '../../lib/JsonLd.svelte';
  import Seo from '../../lib/Seo.svelte';
  import { fits, formatMinutes, formatSpan, MAX_FILMS, plan, TIGHT_SLACK, FALLBACK_DURATION, type Itinerary } from '../../lib/marathon';

  let { data } = $props();

  const TRAVEL_OPTIONS = [0, 10, 15, 20, 30];
  const ADS_OPTIONS = [0, 10, 15, 20];
  const COLORS = ['#2f6fbf', '#c25a1c', '#2f8a4e', '#8250c4', '#b3871a'];

  const params = $derived(page.url.searchParams);
  const day = $derived(data.days.find((item) => item.iso === params.get('giorno')) ?? data.days[0]);
  const selected = $derived(day
    ? params.getAll('film').filter((slug, index, all) => all.indexOf(slug) === index && day.films.some((film) => film.slug === slug)).slice(0, MAX_FILMS)
    : []);
  const travel = $derived(pick(params.get('viaggio'), TRAVEL_OPTIONS, 15));
  const ads = $derived(pick(params.get('pubblicita'), ADS_OPTIONS, 0));
  const options = $derived({ travel, ads });
  // Ordine di selezione: serve per i colori stabili nella timeline.
  const chosen = $derived(day ? selected.map((slug) => day.films.find((film) => film.slug === slug)!).filter(Boolean) : []);
  const result = $derived(chosen.length >= 2 ? plan(chosen, options) : null);
  const reachable = $derived(new Set(day && chosen.length < MAX_FILMS
    ? day.films.filter((film) => !selected.includes(film.slug) && (chosen.length === 0 || fits(chosen, film, options))).map((film) => film.slug)
    : []));
  // I film che non si incastrano scendono in fondo: in alto restano quelli utili.
  const orderedFilms = $derived(day ? [...day.films].sort((a, b) => Number(isOff(a.slug)) - Number(isOff(b.slug))) : []);
  const missingDuration = $derived(chosen.filter((film) => film.duration === null).length);

  function isOff(slug: string) { return !selected.includes(slug) && !reachable.has(slug); }

  function pick(value: string | null, allowed: number[], fallback: number): number {
    const number = Number(value);
    return value !== null && allowed.includes(number) ? number : fallback;
  }

  const color = (slug: string) => COLORS[Math.max(0, selected.indexOf(slug)) % COLORS.length];
  const uniqueTimes = (times: string[]) => times.filter((time, index) => times.indexOf(time) === index);

  let form: HTMLFormElement | undefined = $state();

  // Animazioni spente per chi chiede meno movimento al sistema.
  let reduced = $state(false);
  $effect(() => {
    const query = matchMedia('(prefers-reduced-motion: reduce)');
    reduced = query.matches;
    const listener = () => (reduced = query.matches);
    query.addEventListener('change', listener);
    return () => query.removeEventListener('change', listener);
  });
  const ms = (value: number) => (reduced ? 0 : value);
  const planKey = (itinerary: Itinerary) => itinerary.steps.map((step) => `${step.film.slug}@${step.show.venue}@${step.show.time}`).join('|');

  function update(event?: Event) {
    if (!form) return;
    const fields = new FormData(form);
    const target = event?.target as HTMLInputElement | null;
    // Cambiando giorno la selezione precedente non ha più senso.
    if (target?.name === 'giorno') fields.delete('film');
    const query = new URLSearchParams();
    // Mantiene l'ordine in cui i film sono stati scelti.
    const films = fields.getAll('film').map(String);
    const ordered = [...selected.filter((slug) => films.includes(slug)), ...films.filter((slug) => !selected.includes(slug))];
    for (const [key, value] of fields) if (key !== 'film') query.append(key, String(value));
    for (const slug of ordered) query.append('film', slug);
    goto(`?${query}`, { replace: true, reset: false });
  }

  function submit(event: SubmitEvent) {
    event.preventDefault();
    update();
  }

  function timeline(itinerary: Itinerary) {
    const first = itinerary.steps[0].show.start;
    const span = Math.max(1, itinerary.steps.at(-1)!.end - first);
    const pct = (value: number) => `${((value - first) / span) * 100}%`;
    return itinerary.steps.flatMap((step, index) => {
      const blocks = [{ kind: 'film', left: pct(step.show.start), width: pct(first + step.end - step.show.start), color: color(step.film.slug), label: step.film.title }];
      const previous = itinerary.steps[index - 1];
      if (previous && step.moves && travel) {
        blocks.push({ kind: 'travel', left: pct(previous.end), width: pct(first + travel), color: '', label: `${travel} min di strada` });
      }
      return blocks;
    });
  }
</script>

<Seo title={data.title} description={data.description} canonical={data.canonical} image={data.ogImage} imageAlt="Maratona al cinema: film da vedere di fila a Cosenza e Rende" />
<svelte:head>
  <JsonLd schema={data.schema} />
</svelte:head>

<section class="page-heading" aria-labelledby="page-title">
  <h1 id="page-title">Maratona</h1>
  <p>Scegli i film della serata: ti mostro solo quelli che si incastrano e il percorso migliore fra le sale.</p>
</section>

{#if !day}
  <p class="no-times-note">Le sale non hanno ancora pubblicato spettacoli per i prossimi giorni. Riprova più tardi.</p>
{:else}
  <form class="planner" method="get" action="/maratona" bind:this={form} onchange={update} onsubmit={submit}>
    <div class="step-head"><span class="step-no">1</span><h2>Quando?</h2></div>
    <div class="chips" role="radiogroup" aria-label="Giorno">
      {#each data.days as item (item.iso)}
        <label class="chip" class:on={item.iso === day.iso}>
          <input type="radio" name="giorno" value={item.iso} checked={item.iso === day.iso} />
          <span>{item.iso === data.today ? 'Oggi' : item.label}</span>
        </label>
      {/each}
    </div>

    <div class="step-head">
      <span class="step-no">2</span><h2>Quali film?</h2>
      <p class="step-hint">
        {#if chosen.length === 0}Scegli il primo: poi restano attivi solo quelli compatibili.
        {:else if chosen.length >= MAX_FILMS}Hai raggiunto il massimo di {MAX_FILMS} film.
        {:else if reachable.size}{reachable.size} {reachable.size === 1 ? 'film si incastra' : 'film si incastrano'} con {chosen.length === 1 ? 'la tua scelta' : `i ${chosen.length} scelti`}.
        {:else}Nessun altro film si incastra con questa selezione.{/if}
      </p>
    </div>

    <ul class="posters">
      {#each orderedFilms as film (film.slug)}
        {@const on = selected.includes(film.slug)}
        {@const off = !on && !reachable.has(film.slug)}
        <li animate:flip={{ duration: ms(420), easing: cubicOut }}>
          <label class="poster-card" class:on class:off style:--accent={on ? color(film.slug) : undefined}>
            <input type="checkbox" name="film" value={film.slug} checked={on} disabled={off} />
            <span class="poster-frame">
              {#if film.poster}
                <img src={film.poster} alt="" width="300" height="450" loading="lazy" />
              {:else}
                <span class="poster-missing" aria-hidden="true">fp</span>
              {/if}
              {#if on}
                <span class="badge pick" aria-hidden="true" in:scale={{ duration: ms(260), start: 0.3, easing: backOut }} out:scale={{ duration: ms(140), start: 0.6 }}>{selected.indexOf(film.slug) + 1}</span>
              {:else if off}
                <span class="badge no" in:fly={{ y: 8, duration: ms(220) }} out:fade={{ duration: ms(120) }}>{chosen.length >= MAX_FILMS ? 'Massimo raggiunto' : 'Non si incastra'}</span>
              {/if}
            </span>
            <span class="poster-title" title={film.title}>{film.title}</span>
            <span class="poster-meta">{film.durationLabel || 'durata n.d.'}</span>
            <span class="times">
              {#each uniqueTimes(film.shows.map((show) => show.time)) as time}<span>{time}</span>{/each}
            </span>
          </label>
        </li>
      {/each}
    </ul>

    <div class="step-head"><span class="step-no">3</span><h2>Margini</h2></div>
    <div class="settings">
      <div class="setting" role="radiogroup" aria-label="Spostamento fra sale diverse">
        <span class="setting-label">Strada fra due sale</span>
        <div class="segmented">
          {#each TRAVEL_OPTIONS as option}
            <label class:on={travel === option}><input type="radio" name="viaggio" value={option} checked={travel === option} /><span>{option ? `${option}′` : 'No'}</span></label>
          {/each}
        </div>
      </div>
      <div class="setting" role="radiogroup" aria-label="Pubblicità e trailer prima del film">
        <span class="setting-label">Pubblicità e trailer</span>
        <div class="segmented">
          {#each ADS_OPTIONS as option}
            <label class:on={ads === option}><input type="radio" name="pubblicita" value={option} checked={ads === option} /><span>{option ? `${option}′` : 'No'}</span></label>
          {/each}
        </div>
      </div>
    </div>
    <noscript><button class="planner-submit" type="submit">Calcola</button></noscript>
  </form>

  {#if chosen.length >= 2 && result && result.size >= 2}
    <a class="jump" href="#piani" in:fly|global={{ y: 24, duration: ms(300), easing: backOut }} out:fade={{ duration: ms(150) }}>{result.size === chosen.length ? `${result.total} ${result.total === 1 ? 'piano' : 'piani'}` : `Max ${result.size} su ${chosen.length}`} <span aria-hidden="true">↓</span></a>
  {/if}

  <section class="plans" id="piani" aria-live="polite" aria-labelledby="plans-title">
    {#if chosen.length < 2}
      <div class="plans-empty" in:fade={{ duration: ms(200) }}>
        <h2 id="plans-title">I tuoi piani</h2>
        <p>{chosen.length ? 'Un film scelto: aggiungine almeno un altro tra quelli ancora attivi.' : 'Seleziona almeno due film per vedere come combinarli.'}</p>
      </div>
    {:else if result}
      {#key `${result.size}-${result.total}`}
      <header class="plans-head" in:fly|global={{ y: 10, duration: ms(300), easing: cubicOut }}>
        <h2 id="plans-title">
          {#if result.size === chosen.length}
            {result.total === 1 ? 'Un solo modo' : `${result.total} modi`} per vederli tutti{chosen.length > 2 ? ` e ${chosen.length}` : ''}
          {:else if result.size <= 1}
            Questi film non si incastrano
          {:else}
            Al massimo {result.size} su {chosen.length}
          {/if}
        </h2>
        <p>
          {#if result.size <= 1}Gli orari si sovrappongono anche con {travel ? `${travel} min` : 'zero minuti'} di strada fra le sale.
          {:else}Prima i piani comodi, poi quelli con meno attesa.{result.total > result.itineraries.length ? ` Mostro i migliori ${result.itineraries.length}.` : ''}{/if}
        </p>
      </header>
      {/key}

      {#if result.size >= 2}
        <ol class="itineraries">
          {#each result.itineraries as itinerary, index (planKey(itinerary))}
            {@const first = itinerary.steps[0]}
            {@const last = itinerary.steps.at(-1)!}
            {@const tight = itinerary.steps.some((step) => step.slack !== null && step.slack < TIGHT_SLACK)}
            <li class="plan" class:best={index === 0 && !tight}
              in:fly|global={{ y: 22, duration: ms(380), delay: ms(Math.min(index, 6) * 70), easing: cubicOut }}
              out:fade={{ duration: ms(140) }}
              animate:flip={{ duration: ms(320), easing: cubicOut }}>
              <div class="plan-top">
                <div>
                  {#if index === 0 && !tight}<span class="tag best-tag">Consigliato</span>{:else if tight}<span class="tag tight-tag">Margine stretto</span>{:else}<span class="tag ghost" aria-hidden="true">&nbsp;</span>{/if}
                  <p class="plan-range">{first.show.time}<span aria-hidden="true">→</span>{formatMinutes(last.end)}</p>
                </div>
                <p class="plan-stats">
                  <span>{formatSpan(last.end - first.show.start)}</span>
                  <span>{itinerary.idle ? `${formatSpan(itinerary.idle)} di attesa` : 'zero attese'}</span>
                </p>
              </div>

              <div class="bar" aria-hidden="true">
                {#each timeline(itinerary) as block, blockIndex}
                  <span class="bar-block {block.kind}" style:--i={blockIndex} style:left={block.left} style:width={block.width} style:background={block.color || undefined} title={block.label}></span>
                {/each}
              </div>

              <ol class="steps">
                {#each itinerary.steps as step, stepIndex (stepIndex)}
                  {#if step.slack !== null}
                    <li class="hop" class:tight={step.slack < TIGHT_SLACK}>
                      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                        {#if step.moves}<path d="M5 17h14M6 17l1.5-5h9L18 17M7 17v2M17 17v2M8.5 12l1-3h5l1 3"/>{:else}<path d="M12 6v6l4 2"/><circle cx="12" cy="12" r="9"/>{/if}
                      </svg>
                      <span>
                        {step.moves ? `${travel ? `${travel} min di strada` : 'Cambio sala'}` : 'Stessa sala'}
                        · {step.slack ? `${formatSpan(step.slack)} liberi` : 'nessun margine'}
                      </span>
                    </li>
                  {/if}
                  <li class="stop" style:--accent={color(step.film.slug)}>
                    {#if step.film.poster}<img class="thumb" src={step.film.poster} alt="" width="300" height="450" loading="lazy" />{:else}<span class="thumb poster-missing" aria-hidden="true">fp</span>{/if}
                    <div class="stop-body">
                      <p class="stop-time">{step.show.time}<span>fino alle ~{formatMinutes(step.end)}{step.estimatedDuration ? '*' : ''}</span></p>
                      <a class="stop-title" href={step.film.filmPath}>{step.film.title}</a>
                      <p class="stop-place">{step.show.venueName}{step.show.room ? ` · ${step.show.room}` : ''}</p>
                    </div>
                    <a class="ticket" href={step.show.url} target="_blank" rel="noopener" aria-label={`Biglietti per ${step.film.title} alle ${step.show.time}, ${step.show.venueName}`}>Biglietti</a>
                  </li>
                {/each}
              </ol>
            </li>
          {/each}
        </ol>
      {/if}
      <p class="plans-note">
        Orari di fine indicativi: inizio più durata del film{ads ? ` più ${ads} min di pubblicità` : ''}.
        {#if missingDuration}* Durata non pubblicata dalla sala: considero {FALLBACK_DURATION} min.{/if}
      </p>
    {/if}
  </section>

{/if}

<style>
  .planner { display: grid; gap: 14px; margin: 0 0 32px; }
  .planner > * { min-width: 0; }
  .step-head { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; margin-top: 12px; }
  .step-head h2 { margin: 0; font-size: 17px; }
  .step-no { display: inline-grid; place-items: center; width: 26px; height: 26px; border-radius: 50%; background: var(--ink); color: var(--on-ink); font-size: 13px; font-weight: 800; }
  .step-hint { flex-basis: 100%; margin: 0; color: var(--muted); font-size: 13px; }
  input[type='radio'], input[type='checkbox'] { position: absolute; opacity: 0; width: 1px; height: 1px; margin: 0; pointer-events: none; }

  .chips { display: flex; gap: 8px; overflow-x: auto; padding: 2px 2px 6px; scrollbar-width: thin; }
  .chip, .segmented label, .poster-card { position: relative; }
  .chip { flex: none; cursor: pointer; }
  .chip span { display: inline-flex; align-items: center; min-height: 44px; padding: 6px 16px; border: 1px solid var(--line); border-radius: 999px; background: var(--surface); font-size: 13px; font-weight: 600; white-space: nowrap; transition: background-color 140ms ease, border-color 140ms ease; }
  .chip span::first-letter { text-transform: uppercase; }
  .chip:hover span { border-color: var(--ink); }
  .chip.on span { background: var(--ink); color: var(--on-ink); border-color: var(--ink); }
  label:has(input:focus-visible) > span:last-child, .poster-card:has(input:focus-visible) { outline: 2px solid var(--focus); outline-offset: 2px; }

  .posters { list-style: none; margin: 0; padding: 0; display: grid; gap: 14px; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); }
  @media (max-width: 520px) {
    .posters { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px 8px; }
    .poster-title { font-size: 12px; }
    .times span { font-size: 10px; padding: 1px 4px; }
    .badge.no { left: 4px; right: 4px; bottom: 4px; font-size: 10px; padding: 4px; }
    .badge.pick { width: 26px; height: 26px; top: 6px; right: 6px; }
  }
  .poster-card { display: flex; flex-direction: column; gap: 4px; height: 100%; cursor: pointer; transition: opacity 160ms ease, transform 160ms var(--ease); }
  .poster-frame { position: relative; display: block; aspect-ratio: 2 / 3; overflow: hidden; border-radius: 8px; background: var(--surface); outline: 1px solid var(--line); outline-offset: -1px; transition: box-shadow 160ms ease; }
  .poster-frame img { width: 100%; height: 100%; object-fit: cover; display: block; transition: filter 200ms ease, transform 300ms var(--ease); }
  .poster-missing { display: grid; place-items: center; width: 100%; height: 100%; font-weight: 800; font-size: 28px; color: var(--muted); background: var(--surface-alt); }
  .poster-card:not(.off):hover .poster-frame img { transform: scale(1.03); }
  .poster-card.on .poster-frame { box-shadow: 0 0 0 3px var(--accent), 0 8px 22px rgb(0 0 0 / .25); }
  .poster-card.off { cursor: not-allowed; opacity: .45; }
  .poster-card.off .poster-frame img { filter: grayscale(1); }
  .badge { position: absolute; font-weight: 800; }
  .badge.pick { top: 8px; right: 8px; display: grid; place-items: center; width: 30px; height: 30px; border-radius: 50%; background: var(--accent); color: #fff; font-size: 14px; box-shadow: 0 2px 8px rgb(0 0 0 / .35); }
  .badge.no { left: 8px; right: 8px; bottom: 8px; padding: 5px 8px; border-radius: 6px; background: rgb(0 0 0 / .78); color: #fff; font-size: 11px; text-align: center; }
  .poster-title { margin-top: 4px; font-weight: 700; font-size: 13px; line-height: 1.25; min-height: 2.5em; display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .poster-meta { color: var(--muted); font-size: 12px; }
  .times { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 2px; }
  .times span { padding: 1px 6px; border-radius: 4px; background: var(--green); color: var(--body-copy); font-size: 11px; font-variant-numeric: tabular-nums; }

  .settings { display: flex; flex-wrap: wrap; gap: 12px 28px; }
  .setting { display: grid; gap: 6px; }
  .setting-label { font-size: 13px; font-weight: 600; color: var(--muted); }
  .segmented { display: inline-flex; border: 1px solid var(--line); border-radius: 10px; overflow: hidden; background: var(--surface); }
  .segmented label { cursor: pointer; }
  .segmented label + label span { border-left: 1px solid var(--line); }
  .segmented span { display: grid; place-items: center; min-width: 48px; min-height: 44px; padding: 0 10px; font-size: 13px; font-weight: 600; font-variant-numeric: tabular-nums; transition: background-color 140ms ease; }
  .segmented label.on span { background: var(--ink); color: var(--on-ink); }
  .planner-submit { justify-self: start; min-height: 44px; padding: 6px 18px; border: 0; border-radius: 8px; background: var(--ink); color: var(--on-ink); font: inherit; font-weight: 700; cursor: pointer; }

  .plans { scroll-margin-top: 16px; }
  .plans-empty { padding: 28px 20px; border: 1px dashed var(--line); border-radius: 12px; text-align: center; color: var(--muted); }
  .plans-empty h2 { margin: 0 0 4px; color: var(--ink); font-size: 17px; }
  .plans-empty p { margin: 0; }
  .plans-head h2 { margin: 0; font-size: 22px; }
  .plans-head p { margin: 4px 0 16px; color: var(--muted); font-size: 13px; }
  .itineraries { list-style: none; margin: 0; padding: 0; display: grid; gap: 16px; grid-template-columns: repeat(auto-fill, minmax(min(100%, 360px), 1fr)); align-items: stretch; }
  .plan { display: grid; align-content: start; gap: 14px; padding: 16px; border: 1px solid var(--line); border-radius: 14px; background: var(--surface); }
  .plan.best { border-color: var(--status-ok); box-shadow: 0 0 0 1px var(--status-ok); }
  @media (prefers-color-scheme: dark) { .plan.best { border-color: #6fcf8f; box-shadow: 0 0 0 1px #6fcf8f; } }
  .plan-top { display: flex; justify-content: space-between; align-items: flex-end; gap: 12px; }
  .tag { display: inline-block; margin-bottom: 4px; padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 800; letter-spacing: .02em; text-transform: uppercase; }
  .tag.ghost { visibility: hidden; }
  .best-tag { background: #2f8a4e; color: #fff; }
  .tight-tag { background: color-mix(in srgb, var(--live) 18%, transparent); color: var(--live); }
  .plan-range { display: flex; align-items: baseline; gap: 8px; margin: 0; font-size: 26px; font-weight: 800; font-variant-numeric: tabular-nums; line-height: 1.1; }
  .plan-range span { color: var(--muted); font-weight: 400; font-size: 20px; }
  .plan-stats { display: grid; justify-items: end; gap: 2px; margin: 0; color: var(--muted); font-size: 12px; text-align: right; }
  .plan-stats span:first-child { color: var(--ink); font-weight: 700; font-size: 13px; }
  .bar { position: relative; height: 10px; border-radius: 999px; background: var(--green); overflow: hidden; }
  .bar-block { position: absolute; top: 0; bottom: 0; border-radius: 999px; transform-origin: left center; animation: grow 520ms var(--ease) both; animation-delay: calc(var(--i, 0) * 110ms + 180ms); }
  @keyframes grow { from { transform: scaleX(0); } }
  .poster-card.on .poster-frame { animation: pop 300ms var(--ease); }
  @keyframes pop { 40% { transform: scale(.95); } }
  .stop, .hop { animation: rise 360ms var(--ease) both; }
  .steps > :nth-child(2) { animation-delay: 120ms; }
  .steps > :nth-child(3) { animation-delay: 200ms; }
  .steps > :nth-child(4) { animation-delay: 260ms; }
  .steps > :nth-child(5) { animation-delay: 320ms; }
  .steps > :nth-child(n + 6) { animation-delay: 380ms; }
  @keyframes rise { from { opacity: 0; transform: translateY(6px); } }
  @media (prefers-reduced-motion: reduce) {
    .bar-block, .poster-card.on .poster-frame, .stop, .hop { animation: none; }
    .poster-card, .poster-frame img { transition: none; }
  }
  .bar-block.travel { background: repeating-linear-gradient(135deg, var(--muted) 0 3px, transparent 3px 6px); opacity: .6; border-radius: 0; }

  .steps { list-style: none; margin: 0; padding: 0; display: grid; gap: 0; }
  .stop { display: grid; grid-template-columns: 52px 1fr auto; gap: 12px; align-items: center; padding: 8px 0 8px 10px; border-left: 4px solid var(--accent); border-radius: 2px; }
  .thumb { width: 52px; height: 78px; object-fit: cover; border-radius: 6px; display: block; font-size: 14px; }
  .stop-body { min-width: 0; }
  .stop-time { display: flex; flex-wrap: wrap; align-items: baseline; gap: 2px 8px; margin: 0; font-size: 20px; font-weight: 800; font-variant-numeric: tabular-nums; }
  .stop-time span { color: var(--muted); font-size: 12px; font-weight: 500; }
  .stop-title { display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; min-height: 2.5em; margin-top: 2px; color: var(--ink); font-weight: 700; font-size: 14px; line-height: 1.25; text-decoration: none; overflow-wrap: anywhere; }
  .stop-title:hover { text-decoration: underline; }
  .stop-place { margin: 2px 0 0; color: var(--muted); font-size: 12px; }
  .ticket { display: inline-flex; align-items: center; min-height: 40px; padding: 0 12px; border: 1px solid var(--line); border-radius: 8px; color: var(--link); font-size: 12px; font-weight: 700; text-decoration: none; white-space: nowrap; }
  .ticket:hover { border-color: var(--link); }
  .hop { display: flex; align-items: center; gap: 8px; margin-left: 12px; padding: 10px 0 10px 18px; border-left: 2px dashed var(--line); color: var(--muted); font-size: 12px; }
  .hop.tight { color: var(--live); border-left-color: var(--live); font-weight: 700; }
  .plans-note { margin: 18px 0 0; color: var(--muted); font-size: 12px; }

  .jump { position: sticky; bottom: 14px; z-index: 5; display: none; width: max-content; margin: 16px 0 0 auto; padding: 12px 18px; border-radius: 999px; background: var(--ink); color: var(--on-ink); font-weight: 700; font-size: 14px; text-decoration: none; box-shadow: 0 6px 20px rgb(0 0 0 / .3); }
  @media (max-width: 699px) { .jump { display: block; } .plan-range { font-size: 22px; } }
</style>
