# SEO e anteprime social

## Obiettivo e dominio

Il sito pubblico di riferimento è `https://fuori-programma-cosenza.vercel.app/`.
La home risponde all'intento «cinema Cosenza / programmazione cinema Cosenza e Rende»;
le pagine Oggi, Stasera, Weekend, film e singole sale rispondono a ricerche più specifiche.
Non sono create pagine quasi identiche per accumulare parole chiave.

`src/lib/server/site.ts` è la fonte per canonical, sitemap, breadcrumb e URL social.
`FP_SITE_URL` consente di configurare un futuro dominio HTTPS, senza percorsi.
Non cambiare questo valore prima di configurare dominio e redirect permanenti in Vercel.
Aggiornare anche il canonical della copia GitHub Pages in `index.html` in caso di migrazione.
Le preview Vercel sono escluse tramite `X-Robots-Tag` e robots.txt.
`/legacy/` resta funzionante ma non indicizzabile; la copia statica riceve anche
il meta noindex, perché il server può servirla senza eseguire gli hook SvelteKit.
La home GitHub Pages indica la home Vercel come canonical senza interrompere dati e calendari.

## Implementazione

- `Seo.svelte`: un unico title, description, canonical, Open Graph e Twitter Card
  per pagina, disponibili nell'HTML SSR. Immagini grandi autorizzate con
  `max-image-preview:large`. Nessun profilo social o rating inventato.
- Home: contesto geografico visibile, guida indipendente, fonti, aggiornamento,
  indirizzi e collegamenti alle schede delle sale e alle viste temporali.
- JSON-LD: WebSite e CollectionPage sulla home; Movie, ScreeningEvent,
  MovieTheater, ItemList e BreadcrumbList dove pertinenti. Non è una garanzia
  di rich result Google; non si inventano prezzi, disponibilità o recensioni.
- Sitemap: tutte le schede film disponibili, comprese quelle senza spettacoli,
  oltre alle sale e alle pagine di programmazione; URL assoluti e locandine.
- Le pagine inesistenti restituiscono HTTP 404 e noindex, non un falso 200.
- Il primo poster della griglia home è eager/high-priority in SSR e dopo il
  ridisegno JavaScript; le immagini hanno dimensioni dichiarate. Preconnect
  al CDN principale delle locandine. Nessuno script Analytics aggiunto.
- I messaggi di condivisione della home includono la scheda film interna quando
  disponibile, invece del solo link della biglietteria esterna.

## Immagini social

### Nome e icona nei risultati Google

La home dichiara `Fuori programma` in un unico nodo WebSite e in `og:site_name`.
I nomi alternativi sono `Fuori programma Cosenza` e, come ultima riserva,
l'hostname pubblico in minuscolo, secondo le indicazioni Google. Il dominio
di hosting non deve essere scambiato per il nome del progetto.

Oltre all'SVG per i browser, dichiariamo esplicitamente il logo PNG 192×192
già disponibile a `/icons/icon-192.png`, con URL stabile e accessibile a
Googlebot-Image. La documentazione Google Search elenca PNG e altri formati
raster tra i formati favicon supportati. Il test SEO verifica nome, fallback,
download e dimensioni della favicon.

Google sceglie autonomamente nome del sito, favicon e snippet. Dopo un deploy
richiedere una nuova scansione della home, se non già richiesta, e attendere
la rielaborazione: anche giorni o settimane. Non è necessario ripetere la
richiesta ogni giorno o cambiare continuamente i metadati. Vedere
[nomi dei siti](https://developers.google.com/search/docs/appearance/site-names) e
[favicon](https://developers.google.com/search/docs/appearance/favicon-in-search).

### Card di condivisione

`npm run og:build` genera immagini 1200×630 per home, le cinque sale,
Oggi, Stasera, Weekend, Prossimamente, Calendario e ogni film disponibile.
Le schede film mostrano titolo e locandina; se il CDN non risponde restano
titolo e brand, senza rompere l'immagine. I testi delle immagini non includono
date mobili che diventerebbero errate dopo la mezzanotte.

Il manifest contiene URL versionati in base al contenuto: un'immagine modificata
non riutilizza lo stesso URL nelle cache dei social. Non tutte le piattaforme
mostrano sempre una card e i messaggi già inviati possono mantenere la vecchia
anteprima. Verificare dopo il deploy con un messaggio nuovo e, per Facebook,
con https://developers.facebook.com/tools/debug/ («Scrape Again»).

## Verifiche ripetibili

```powershell
npm run check
npm run build
npm run test:preview -- --browser
```

Con server di sviluppo acceso:

```powershell
npm run test:seo
node scripts/test_catalog_browser.mjs http://127.0.0.1:5173
```

Dopo la pubblicazione:

```powershell
node scripts/test_seo.mjs https://fuori-programma-cosenza.vercel.app
node scripts/test_catalog_browser.mjs https://fuori-programma-cosenza.vercel.app
```

Il test SEO visita tutte le pagine della sitemap senza eseguire JavaScript,
controlla unicità e coerenza dei metadati, canonical senza parametri, JSON-LD
parsabile, immagini realmente scaricabili e dimensioni 1200×630 / meno di 5 MB.
Prova anche user-agent Googlebot, Twitterbot, Facebook e WhatsApp. Questi test
simulano richieste HTTP: non certificano l'indicizzazione o la resa effettiva
di ogni piattaforma. Per Prossimamente verifica anche l'assenza della barra
Oggi/Stasera/Weekend e la presenza del titolo e della descrizione richiesti.

Misura iniziale sul sito pubblico, 16 novembre 2026, Lighthouse mobile:
Performance 99, SEO 100, LCP 2,0 s, CLS 0, TBT 100 ms. Una singola misura di
laboratorio varia con macchina, rete, film e CDN; non è un dato Core Web Vitals
reale né una prova di ranking. Il primo poster risultava lazy e senza priorità:
questo è stato corretto nel codice.

## Da completare con il proprietario dopo il deploy

1. Aprire Google Search Console con l'account proprietario e selezionare la
   proprietà prefisso URL `https://fuori-programma-cosenza.vercel.app/`.
   Il token di verifica già presente nell'HTML è stato conservato: la sua presenza
   da sola non prova che la proprietà sia verificata o che abbia dati.
2. Inviare `https://fuori-programma-cosenza.vercel.app/sitemap.xml` nella sezione
   Sitemap. In Ispezione URL controllare home, Prossimamente e una scheda cinema;
   confrontare canonical dichiarato e scelto da Google, eseguire il test live e
   richiedere indicizzazione per le pagine principali, non per ogni URL ogni giorno.
3. Provare una scheda film con https://search.google.com/test/rich-results e,
   per la semantica Schema.org generale, https://validator.schema.org/.
   La validità JSON verificata automaticamente non sostituisce questi controlli.
4. Annotare impressioni, clic e query locali in Search Console e confrontarle
   dopo 2–4 settimane; considerare anche tempi più lunghi per un sito nuovo.
   Non è stata verificata qui la posizione o l'indicizzazione effettiva su Google.
5. Ottenere segnalazioni e link genuini da cinema, associazioni universitarie,
   pagine locali e persone che usano il servizio, con il loro consenso. Nessun
   acquisto di link, recensioni finte o scheda Google Business per cinema altrui.
6. Monitorare freschezza degli orari, errori sorgente e Core Web Vitals con dati
   reali quando disponibili. Valutare un dominio personale per il brand, non come
   scorciatoia di ranking. Analytics è un'attività separata con valutazione privacy.

Non esiste una modifica che garantisca il primo posto per «cinema Cosenza».
Google può scegliere titoli, snippet e canonical diversi e impiegare settimane
o mesi a riflettere le modifiche.

Riferimenti: [Google SEO Starter Guide](https://developers.google.com/search/docs/fundamentals/seo-starter-guide),
[Open Graph](https://ogp.me/), [Search Console](https://search.google.com/search-console/).
