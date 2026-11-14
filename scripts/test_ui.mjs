import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

// Browser reale, nessuna dipendenza npm: node scripts/test_ui.mjs [url] [--quick]
// Per gli screenshot aggiungere --screenshots <cartella>.
const root = fileURLToPath(new URL('../', import.meta.url));
const base = process.argv[2] || 'http://127.0.0.1:8932/';
const quick = process.argv.includes('--quick');
const shotArg = process.argv.indexOf('--screenshots');
const shotDir = shotArg >= 0 ? process.argv[shotArg + 1] : '';
const chromePath = [
  process.env.CHROME_BIN,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].find((item) => item && existsSync(item));
assert(chromePath, 'Impostare CHROME_BIN sul percorso di Chrome/Chromium');

const css = readFileSync(path.join(root, 'styles.css'), 'utf8');
const stripped = css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, '');
let depth = 0;
for (const char of stripped) {
  if (char === '{') depth += 1;
  if (char === '}') depth -= 1;
  assert(depth >= 0, 'CSS: parentesi chiusa senza apertura');
}
assert.equal(depth, 0, 'CSS: blocco non chiuso');

const data = JSON.parse(readFileSync(path.join(root, 'data/schedule.json'), 'utf8'));
const parseDate = (s) => {
  const [day, month, year] = s.split('/').map(Number);
  return new Date(year, month - 1, day);
};
const dates = [...new Set(data.movies.flatMap((movie) => movie.shows.map((group) => group.date)))]
  .sort((a, b) => parseDate(a) - parseDate(b));
const date = parseDate(dates[0]);
const fakeClock = `{
  const OriginalDate = Date;
  const now = new OriginalDate(${date.getFullYear()}, ${date.getMonth()}, ${date.getDate()}, 19, 45);
  window.Date = class extends OriginalDate {
    constructor(...args) { super(...(args.length ? args : [now.getTime()])); }
    static now() { return now.getTime(); }
  };
}`;

const chrome = spawn(chromePath, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--remote-debugging-port=0',
  `--user-data-dir=${path.join(tmpdir(), 'opencode', `fp-ui-${randomUUID()}`)}`,
  'about:blank',
], { stdio: ['ignore', 'ignore', 'pipe'] });
let ws;
const errors = [];
const reports = [];

try {
  const endpoint = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Chrome startup timeout')), 15000);
    let output = '';
    chrome.stderr.on('data', (chunk) => {
      output += chunk;
      const match = output.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (match) { clearTimeout(timer); resolve(match[1]); }
    });
    chrome.once('exit', (code) => { clearTimeout(timer); reject(new Error(`Chrome exit ${code}`)); });
  });
  ws = new WebSocket(endpoint);
  await new Promise((resolve) => ws.addEventListener('open', resolve, { once: true }));
  let id = 0;
  const pending = new Map();
  const loadWaiters = new Set();
  ws.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (pending.has(message.id)) {
      const item = pending.get(message.id);
      pending.delete(message.id);
      clearTimeout(item.timer);
      if (message.error) item.reject(new Error(JSON.stringify(message.error)));
      else item.resolve(message.result);
    }
    if (message.method === 'Runtime.exceptionThrown') {
      errors.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
    }
    if (message.method === 'Page.loadEventFired') {
      for (const resolve of loadWaiters) resolve();
      loadWaiters.clear();
    }
  });
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const n = ++id;
    const timer = setTimeout(() => { pending.delete(n); reject(new Error(`CDP timeout: ${method}`)); }, 30000);
    pending.set(n, { resolve, reject, timer });
    ws.send(JSON.stringify({ id: n, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  const cdp = (method, params = {}) => send(method, params, sessionId);
  const waitLoad = () => new Promise((resolve, reject) => {
    const done = () => { clearTimeout(timer); resolve(); };
    const timer = setTimeout(() => { loadWaiters.delete(done); reject(new Error('Page load timeout')); }, 30000);
    loadWaiters.add(done);
  });
  const navigate = async (url) => {
    const loaded = waitLoad();
    await cdp('Page.navigate', { url });
    await loaded;
  };
  const evaluate = async (expression) => {
    const result = await cdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description);
    return result.result.value;
  };
  const frames = () => evaluate('new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))');
  const assertContrast = async (context) => {
    const problems = await evaluate(`(() => {
      const selectors='.movie-state,.rating-source,.rating-unavailable,.movie-rating,.view-hint,.filter-dropdown label,.chip.active,.layout-button.active,.card-genres,.film-duration,.preview-label,.preview-time,.showtime-room,.showtime-end,.calendar-dialog-kicker,.calendar-dialog-intro,.calendar-app-link,.calendar-app-link small,.calendar-summary';
      const rgb=value=>(value.match(/[\\d.]+/g)||[]).map(Number);
      const lum=values=>{const v=values.slice(0,3).map(x=>x/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4);return v[0]*.2126+v[1]*.7152+v[2]*.0722;};
      return [...document.querySelectorAll(selectors)].filter(e=>e.getBoundingClientRect().height &&
        !e.closest(':disabled,[aria-disabled=true]')).flatMap(e=>{
          let parent=e, bg=[255,255,255];
          while(parent) {
            const color=rgb(getComputedStyle(parent).backgroundColor);
            if(color.length===3 || color[3]===1) {bg=color;break;}
            parent=parent.parentElement;
          }
          const a=lum(rgb(getComputedStyle(e).color)), b=lum(bg);
          const ratio=(Math.max(a,b)+.05)/(Math.min(a,b)+.05);
          return ratio<4.5 ? [e.className+': '+ratio.toFixed(2)] : [];
        });
    })()`);
    assert.equal(problems.length, 0, `Contrasti ${context}: ${problems.join(', ')}`);
  };
  await cdp('Page.enable');
  await cdp('Runtime.enable');
  await cdp('Network.enable');
  await cdp('Network.setCacheDisabled', { cacheDisabled: true });
  await cdp('Network.setBypassServiceWorker', { bypass: true });
  await cdp('DOM.enable');
  await cdp('CSS.enable');
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: fakeClock });
  const shot = async (name, selector) => {
    if (!shotDir) return;
    mkdirSync(shotDir, { recursive: true });
    await evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({behavior:'instant',block:'start'})`);
    await evaluate(`Promise.race([
      Promise.all([...document.images].filter(img => {
        const r=img.getBoundingClientRect();return r.top<innerHeight && r.bottom>0;
      }).map(img => img.decode().catch(() => {}))),
      new Promise(resolve=>setTimeout(resolve,8000))
    ])`);
    await frames();
    const image = await cdp('Page.captureScreenshot', { format: 'png' });
    writeFileSync(path.join(shotDir, `${name}.png`), Buffer.from(image.data, 'base64'));
  };

  for (const width of quick ? [390, 1280] : [320, 360, 390, 430, 768, 960, 1280, 1440]) {
    await cdp('Emulation.setDeviceMetricsOverride', { width, height: 960, deviceScaleFactor: 1, mobile: width < 700 });
    for (const scheme of ['light', 'dark']) {
      await cdp('Emulation.setEmulatedMedia', { features: [
        { name: 'prefers-color-scheme', value: scheme },
        { name: 'prefers-reduced-motion', value: 'reduce' },
      ] });
      for (const view of ['movies', 'schedule']) {
        await navigate(new URL(`?view=${view}`, base).href);
        await evaluate(`new Promise((resolve,reject) => {
          const start = performance.now();
          const tick = () => {
            if (document.readyState === 'complete' && document.querySelector('.movie-grid:not([hidden]) article')) resolve(true);
            else if (performance.now() - start > 20000) reject(new Error('App render timeout'));
            else requestAnimationFrame(tick);
          };
          tick();
        })`);
        await frames();
        await assertContrast(`${width}/${scheme}/${view}`);
        const measure = await evaluate(`(() => {
          const grid = document.querySelector('.movie-grid:not([hidden])');
          const cards = [...grid.querySelectorAll('article')];
          const visible = (e) => e.getBoundingClientRect().height > 0;
          const heights = cards.map(c => c.getBoundingClientRect().height);
          const buttons = [...grid.querySelectorAll('.movie-actions > *')];
          const horizontalScroll = [...grid.querySelectorAll('*')].filter(e => visible(e) &&
            ['auto','scroll'].includes(getComputedStyle(e).overflowX) && e.scrollWidth > e.clientWidth + 1);
          const actionProblems = buttons.filter(b => {
            const r=b.getBoundingClientRect(), p=b.closest('article').getBoundingClientRect();
            return r.width<43.9 || r.left<p.left || r.right>p.right;
          });
          const ids = [...document.querySelectorAll('[id]')].map(e => e.id);
          return {
            cards:cards.length,columns:getComputedStyle(grid).gridTemplateColumns.split(' ').length,
            minHeight:Math.min(...heights),maxHeight:Math.max(...heights),
            actionHeights:[...new Set(buttons.map(b => b.getBoundingClientRect().height))],
            pageOverflow:document.documentElement.scrollWidth > innerWidth,
            horizontalScroll:horizontalScroll.length,actionProblems:actionProblems.length,
            oldRails:grid.querySelectorAll('.scroll-rail,.rail-hint').length,
            duplicateIds:ids.length !== new Set(ids).size,
            nestedVerticalScroll:[...grid.querySelectorAll('*')].filter(e => visible(e) &&
              getComputedStyle(e).overflowY === 'auto' && e.scrollHeight > e.clientHeight + 1).length,
            oldPosterMenu:!!grid.querySelector('.poster-venue-menu'),
            oldTicketCTA:!!grid.querySelector('.day-card-more')
          };
        })()`);
        const context = `${width}/${scheme}/${view}`;
        assert.equal(measure.columns, width >= 960 ? 3 : 2, context);
        assert(measure.maxHeight - measure.minHeight < 1, `Altezze diverse: ${context}`);
        assert.deepEqual(measure.actionHeights, [44], `Azioni disallineate: ${context}`);
        assert.equal(measure.pageOverflow, false, `Overflow pagina: ${context}`);
        assert.equal(measure.horizontalScroll + measure.nestedVerticalScroll + measure.actionProblems + measure.oldRails, 0, `Scroll/comandi errati: ${context}`);
        assert.equal(measure.duplicateIds || measure.oldPosterMenu || measure.oldTicketCTA, false, context);
        reports.push({ context, ...measure });
        const prefix = `${width}-${scheme}-${view}`;
        if ([320, 390, 1280].includes(width)) await shot(prefix, '.movie-grid:not([hidden]) article');
        if ([320, 390, 1280].includes(width) && view==='movies') await shot(`${prefix}-controls`, '.schedule-controls');

        // La stessa azione funziona da locandina, tastiera e pulsante in entrambe le viste.
        assert(await evaluate(`(() => {
          const card=document.querySelector('.movie-grid:not([hidden]) article');
          card.querySelector('[data-card-open]').click();
          return card.classList.contains('is-expanded') && !card.querySelector('.movie-full-schedule-panel').hidden;
        })()`), context);
        await frames();
        const opened = await evaluate(`(() => {
          const card=document.querySelector('.movie-grid:not([hidden]) .is-expanded');
          const panel=card.querySelector('.movie-full-schedule-panel');
          const heading=panel.querySelector('h4');
          const body=card.querySelector('.movie-card-body').getBoundingClientRect();
          const button=panel.querySelector('[data-showtime]');
          return {pageOverflow:document.documentElement.scrollWidth > innerWidth,
            fullWidthSynopsis:Math.abs(card.querySelector('.movie-extra').getBoundingClientRect().left-body.left) < 25,
            posterDisabled:card.querySelector('[data-card-open]').disabled,
            focused:document.activeElement === heading,
            timeFont:button ? parseFloat(getComputedStyle(button.querySelector('strong')).fontSize) : 17,
            timeHeight:button ? button.getBoundingClientRect().height : 60,
            arrows:panel.querySelectorAll('.time-cue').length};
        })()`);
        assert(!opened.pageOverflow && opened.fullWidthSynopsis && opened.posterDisabled && opened.focused, `Apertura: ${context}`);
        assert(opened.timeFont >= 16 && opened.timeHeight >= 44 && opened.arrows === 0, `Orari: ${context}`);
        if ([320, 390, 1280].includes(width)) await shot(`${prefix}-open`, '.movie-grid:not([hidden]) .is-expanded');
        const hasShowtime = await evaluate(`!!document.querySelector('.movie-grid:not([hidden]) .is-expanded [data-showtime]')`);
        if (hasShowtime) {
          await evaluate(`document.querySelector('.movie-grid:not([hidden]) .is-expanded [data-showtime]').scrollIntoView({behavior:'instant',block:'center'})`);
          await frames();
          const menu = await evaluate(`(() => {
            const button=document.querySelector('.movie-grid:not([hidden]) .is-expanded [data-showtime]');
            button.click();
            const menu=document.querySelector('#showtime-menu');
            const r=menu.getBoundingClientRect();
            return {visible:!menu.hidden,inBounds:r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight,
              hasCinema:menu.textContent.includes(button.dataset.eventVenue)};
          })()`);
          assert(menu.visible && menu.inBounds && menu.hasCinema, `Menu orario: ${context}`);
          assert(await evaluate(`(() => {
            const expected=activeShowtime.eventUrl;
            const original=window.open;
            let opened='';
            window.open=url=>{opened=url;};
            document.querySelector('[data-time-action=open]').click();
            window.open=original;
            return opened===expected;
          })()`), `Biglietti: ${context}`);
        }
        await evaluate(`document.querySelector('.movie-grid:not([hidden]) .is-expanded [data-card-close]').click()`);
        await frames();
        assert(await evaluate(`document.activeElement.matches('[data-card-open]')`), `Focus non restituito: ${context}`);

        const rootDoc = await cdp('DOM.getDocument');
        const { nodeId } = await cdp('DOM.querySelector', { nodeId: rootDoc.root.nodeId, selector: '.movie-grid:not([hidden]) a.trailer-link' });
        if (nodeId) {
          await cdp('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: ['hover'] });
          const contrast = await evaluate(`(() => {
            const e=document.querySelector('.movie-grid:not([hidden]) a.trailer-link');
            const s=getComputedStyle(e);
            const lum=c=>{const v=c.match(/[\\d.]+/g).slice(0,3).map(Number).map(x=>x/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4);return v[0]*.2126+v[1]*.7152+v[2]*.0722;};
            const a=lum(s.color),b=lum(s.backgroundColor);
            return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);
          })()`);
          assert(contrast >= 4.5, `Contrasto trailer: ${context}`);
          await cdp('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: [] });
        }
        const layoutSelector = view === 'movies' ? '[data-movie-layout=list]' : '[data-layout=list]';
        await evaluate(`document.querySelector('${layoutSelector}').click()`);
        await frames();
        assert(await evaluate(`(() => {
          const grid=document.querySelector('${view === 'movies' ? '#movies-grid' : '#film-list'}');
          return !grid.classList.contains('movie-grid') && document.documentElement.scrollWidth <= innerWidth;
        })()`), `Vista lista: ${context}`);
        if ([390, 1280].includes(width)) await shot(`${prefix}-list`, `${view === 'movies' ? '#movies-grid' : '#film-list'} article`);
        await evaluate('openCalendarDialog()');
        await assertContrast(`${width}/${scheme}/calendar`);
        assert(await evaluate(`(() => {
          const r=calendarDialog.getBoundingClientRect();
          const boxes=[...document.querySelectorAll('#calendar-venues input')];
          return r.left>=0 && r.right<=innerWidth && r.top>=0 && r.bottom<=innerHeight &&
            calendarDialog.scrollWidth<=calendarDialog.clientWidth+1 && boxes.length===5 &&
            document.activeElement.closest('#calendar-dialog') &&
            [...document.querySelectorAll('.calendar-app-link')].every(e=>e.getBoundingClientRect().height>=44);
        })()`), `Dialog calendario: ${context}`);
        if ([320, 390, 1280].includes(width) && view==='movies') await shot(`${width}-${scheme}-calendar`, '#calendar-dialog');
        await evaluate('closeCalendarDialog()');
      }
    }
  }

  // Regressioni: film con soli orari passati, selezione cinema e URL di fallback.
  await evaluate(`currentView='schedule'; selectedDate=getTodayString(); showPastShowsToday=false; dayLayout='grid'; render()`);
  assert(await evaluate(`(() => {
    const shown=[...filmList.querySelectorAll('[data-showtime]')];
    const expected=scheduleData.movies.filter(m=>m.shows.some(g=>g.date===getTodayString() &&
      g.shows.some(s=>wallClockDate(g.date,s.time)>=new Date())) || (m.announcedDates||[]).some(a=>
      a.date===getTodayString() && !m.shows.some(g=>g.date===a.date && g.venue===a.venue && g.shows.length)));
    return shown.every(b=>wallClockDate(b.dataset.eventDate,b.dataset.eventTime)>=new Date()) &&
      filmList.querySelectorAll('article').length===expected.length;
  })()`), 'Spettacoli già iniziati visibili di default');
  assert(await evaluate(`(() => {
    showPastShowsToday=true; render();
    const movies=scheduleData.movies;
    const expected=movies.flatMap(m=>m.shows).filter(g=>g.date===getTodayString())
      .flatMap(g=>g.shows).filter(s=>wallClockDate(getTodayString(),s.time)<new Date()).length;
    return filmList.querySelectorAll('[data-showtime].is-past').length===expected;
  })()`), 'Toggle passati perde spettacoli');
  assert(await evaluate(`(() => {
    const button=filmList.querySelector('[data-showtime].is-past');
    if (!button) return true;
    button.setAttribute('aria-expanded','true');
    const sample=document.createElement('span');
    sample.style.color='var(--on-blue)';
    document.body.appendChild(sample);
    const valid=getComputedStyle(button).color===getComputedStyle(sample).color;
    sample.remove();button.setAttribute('aria-expanded','false');
    return valid;
  })()`), 'Contrasto orario passato selezionato');
  assert(await evaluate(`(() => {
    showPastShowsToday=false; activeChip='today'; currentView='movies'; render();
    const number=moviesGrid.querySelectorAll('[data-showtime]').length;
    const total=Number(resultSummary.querySelectorAll('strong')[1].textContent);
    venueFilter.value=scheduleData.venues[0].id; currentView='schedule'; render();
    const matches=Array.from(filmList.querySelectorAll('[data-showtime]')).every(b=>
      b.dataset.eventVenue===scheduleData.venues[0].name);
    const filterVisible=!!venueFilter.getBoundingClientRect().height;
    venueFilter.value='all'; activeChip='all';
    return number===total && matches && filterVisible;
  })()`), 'Conteggio Solo oggi / filtro cinema');
  assert(await evaluate(`(() => {
    const movie={title:'Test',duration:'',url:'https://wrong.example',venueUrls:{right:'https://right.example/film'}};
    const wrap=document.createElement('div');
    wrap.innerHTML=showtimeChipHtml(movie,{id:'right',name:'Cinema giusto'},getTodayString(),{time:'22:00'},'showtime');
    return wrap.firstElementChild.dataset.eventUrl==='https://right.example/film';
  })()`), 'Fallback biglietti sul cinema sbagliato');
  assert(await evaluate(`(() => {
    currentView='movies'; movieLayout='grid'; activeChip='all'; render();
    const movie={id:'fixture',title:'Titolo molto lungo '.repeat(20),genres:Array(15).fill('Fantascienza'),shows:[],announcedDates:[]};
    moviesGrid.insertAdjacentHTML('beforeend',movieCardHtml(movie,{venuesMap:{},shows:[],programming:[]}));
    const heights=[...moviesGrid.querySelectorAll('article')].map(c=>c.getBoundingClientRect().height);
    const bad=moviesGrid.lastElementChild;
    return Math.max(...heights)-Math.min(...heights)<1 && bad.querySelector('.is-unavailable').disabled;
  })()`), 'Dati mancanti/titolo lungo alterano la griglia');
  assert(await evaluate(`(() => {
    openCalendarDialog();
    const s=calendarSelection();
    const events=collectCalendarShows(s.mode,s.value);
    const text=buildCalendarDocument(events,{alarm:true});
    const valid=calendarDialog.open && text.includes('BEGIN:VCALENDAR') &&
      (text.match(/BEGIN:VEVENT/g)||[]).length===events.length;
    closeCalendarDialog();
    return valid;
  })()`), 'Calendario');

  assert(await evaluate(`(() => {
    const a={title:'Alfa',releaseDateIT:'2026-11-12',firstSeenAt:'2026-11-10T12:00:00Z'};
    const b={title:'Beta',releaseDateIT:'2026-11-01',firstSeenAt:'2026-11-12T12:00:00Z'};
    const c={title:'Gamma',releaseDateIT:'2026-12-01',firstSeenAt:'invalid'};
    const d={title:'Delta'};
    const films=[d,c,b,a];
    if(sortMovies(films,'release').map(m=>m.title).join()!=='Alfa,Beta,Delta,Gamma') return false;
    if(sortMovies(films,'added')[0]!==b || sortMovies(films,'title')[0]!==a) return false;
    const source={url:'https://www.mymovies.it/film/2026/test/'};
    const popular={title:'Affidabile',external:{...source,rating:4,ratingCount:1000}};
    const tiny={title:'Due voti',external:{...source,rating:5,ratingCount:2}};
    return sortMovies([tiny,d,popular],'rating')[0]===popular &&
      sortMovies([tiny,d,popular],'rating').at(-1)===d &&
      !ratingInfo({external:{rating:5,url:'javascript:alert(1)'}}).rating &&
      !renderMovieRating({}).includes('0/5') &&
      renderRatingDetails({external:{...source,rating:3,criticsRating:4,audienceRating:2,ratingCount:2}}).includes('Campione ancora piccolo');
  })()`), 'Ordinamenti e voti mancanti/non attendibili');
  assert(await evaluate(`(() => {
    activeChip='tonight'; currentView='movies'; venueFilter.value='all'; render();
    if(![...moviesGrid.querySelectorAll('[data-showtime]')].every(b=>b.dataset.eventDate===getTodayString() && b.dataset.eventTime>='18:00')) return false;
    activeChip='weekend'; render();
    if(![...moviesGrid.querySelectorAll('[data-showtime]')].every(b=>[0,5,6].includes(parseDate(b.dataset.eventDate).getDay()))) return false;
    const sunday=new Date(2026,10,15,12);
    if(!periodDateMatches('15/11/2026','weekend',sunday) || periodDateMatches('20/11/2026','weekend',sunday)) return false;
    activeChip='all'; render();
    const first=scheduleData.movies.find(m=>parseDurationMinutes(m.duration));
    const wrap=document.createElement('div');
    wrap.innerHTML=showtimeChipHtml({title:'Test',duration:'2h 10m'}, {id:'test',name:'Test'},getTodayString(),{time:'23:30',version:'OV',subtitles:true,format:'3D'},'showtime');
    const labels=wrap.textContent;
    return labels.includes('01:40') && labels.includes('V.O.') && labels.includes('Sottotitoli') && labels.includes('3D') &&
      showtimeFormats({language:'Italiano'}).length===0 && showtimeFormats({room:'Sala 1'}).length===0;
  })()`), 'Stasera, weekend, fine indicativa e formati dichiarati');
  assert(await evaluate(`(() => {
    const inputs=[...document.querySelectorAll('#preferred-venues input')];
    inputs[0].checked=true;inputs[0].dispatchEvent(new Event('change',{bubbles:true}));
    inputs[2].checked=true;inputs[2].dispatchEvent(new Event('change',{bubbles:true}));
    document.querySelector('#preferred-venues-apply').click();
    const ids=[inputs[0].value,inputs[2].value];
    const valid=venueFilter.value==='preferred' &&
      [...moviesGrid.querySelectorAll('[data-showtime]')].every(b=>ids.some(id=>scheduleData.venues.find(v=>v.id===id).name===b.dataset.eventVenue)) &&
      JSON.parse(localStorage.getItem('fp_preferred_venues')).length===2;
    inputs.forEach(input=>{input.checked=false;input.dispatchEvent(new Event('change',{bubbles:true}));});
    const empty=emptyState.hidden===false && document.querySelector('#preferred-venues-apply').disabled;
    venueFilter.value='all';writeStore('fp_venue_filter','all');render();
    return valid && empty;
  })()`), 'Cinema preferiti multipli, persistenza e selezione vuota');
  assert(await evaluate(`(async () => {
    openCalendarDialog();
    const boxes=[...document.querySelectorAll('#calendar-venues input')];
    boxes.forEach((b,i)=>{b.checked=i===0 || i===2;});
    updateCalendarSummary();
    const ids=selectedCalendarVenues(), feed=calendarFeedUrl();
    const valid=ids.length===2 && feed.endsWith(ids.join('_')+'.ics') &&
      new URL(document.querySelector('#calendar-google').href).searchParams.get('cid')===feed &&
      document.querySelector('#calendar-apple').href===feed.replace(/^https?:/,'webcal:') &&
      new URL(document.querySelector('#calendar-outlook').href).searchParams.get('url')===feed &&
      collectCalendarShows('venues','').every(e=>ids.includes(e.venueId));
    boxes.forEach(b=>{b.checked=false;});updateCalendarSummary();
    const disabled=!document.querySelector('#calendar-google').hasAttribute('href') &&
      document.querySelector('#calendar-copy').disabled && document.querySelector('#calendar-download').disabled;
    document.querySelector('#calendar-select-all').click();
    const all=calendarFeedUrl().endsWith('/all.ics');
    const response=await fetch(feed);
    const text=await response.text();
    const ics=response.ok && text.startsWith('BEGIN:VCALENDAR') && text.includes('TZID:Europe/Rome') &&
      !text.includes('BEGIN:VALARM');
    closeCalendarDialog();
    return valid && disabled && all && ics;
  })()`), 'Abbonamento multi-cinema, provider, nessuna selezione e feed pubblico');
  // Telefono stretto, landscape/viewport basso: chiusura sempre raggiungibile.
  await cdp('Emulation.setDeviceMetricsOverride', { width:320,height:600,deviceScaleFactor:1,mobile:true });
  await evaluate('openCalendarDialog();calendarDialog.scrollTop=calendarDialog.scrollHeight');
  await frames();
  assert(await evaluate(`(() => {
    const close=document.querySelector('#calendar-close').getBoundingClientRect();
    return close.top>=0 && close.bottom<=innerHeight && calendarDialog.scrollWidth<=calendarDialog.clientWidth+1;
  })()`), 'Calendario su schermo 320×600');
  await evaluate('closeCalendarDialog()');
  assert(await evaluate(`(() => {
    const event={date:getTodayString(),time:'23:30',venue:'Test',title:'Film',duration:'2h 10m',room:'Sala 1'};
    return icsUid(event)!==icsUid({...event,room:'Sala 2'}) &&
      buildCalendarDocument([event]).includes('DURATION:PT130M');
  })()`), 'UID distinti per sala e durata iCalendar');
  await cdp('Network.setBypassServiceWorker', { bypass: false });
  await navigate(new URL('?view=movies', base).href);
  await evaluate(`navigator.serviceWorker.ready.then(() => new Promise(resolve => {
    const check=()=>navigator.serviceWorker.controller && document.querySelector('.movie-grid article') &&
      document.readyState==='complete' ? resolve(true) : requestAnimationFrame(check);
    check();
  }))`);
  await cdp('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
  const offlineLoad = waitLoad();
  await cdp('Page.reload');
  await offlineLoad;
  assert(await evaluate(`new Promise((resolve,reject) => {
    const start=performance.now();
    const check=()=>document.readyState==='complete' && document.querySelector('.movie-grid article')
      ? resolve(document.querySelectorAll('#movies-grid article').length===${data.movies.length})
      : performance.now()-start>15000 ? reject(new Error('Offline timeout')) : requestAnimationFrame(check);
    check();
  })`), 'Programmazione offline');
  await cdp('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  assert.equal(errors.length, 0, errors.join('\n'));
  console.log(JSON.stringify({
    passed: reports.length, offline: true,
    widths: [...new Set(reports.map((r) => Number(r.context.split('/')[0])))],
    maxCardHeightDifference: Math.max(...reports.map((r) => r.maxHeight - r.minHeight)),
    actionHeight: 44, runtimeErrors: errors,
    ...(process.argv.includes('--verbose') ? { reports } : {}),
  }, null, 2));
  if (shotDir) console.log(`Screenshots: ${shotDir}`);
  await send('Browser.close');
} finally {
  ws?.close();
  chrome.kill();
}
