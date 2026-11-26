# 0006 — SEO and metadata

Metadata, structured data, page summaries, landing pages, sitemap and social-card routes. The rules in the `CLAUDE.md` Conventions (canonical origin, `buildMetadata`, `satoriText`, `page-summary.ts`) are not repeated.

### Comparison side names are not headings

Where: `apps/web/components/compare/driver-comparison.tsx`, `apps/web/components/compare/constructor-comparison.tsx` — `SIDE_NAME`

The two names beside 'vs' are styled like a heading but are not heading elements, because the page already has its single h1. Promoting them would give the page extra top-level headings.

### JSON-LD escapes the opening angle bracket

Where: `apps/web/components/seo/json-ld.tsx` — `JsonLd`

The graph is injected with `dangerouslySetInnerHTML`, so `<` is replaced with `\u003c` after `JSON.stringify` to stop any string value closing the script tag. The payload comes from the site's own API data, never from visitors.

### Breadcrumb JSON-LD mirrors the visible trail

Where: `apps/web/components/layout/breadcrumbs.tsx` — `Breadcrumbs`

The BreadcrumbList structured data is emitted from the same items as the visible trail, because Google requires the markup to match what the page shows. Emitting it here covers every page that uses the component.

### The home page h1 is its topic, not the headline

Where: `apps/web/app/page.tsx` — the `h1` in the "Right now" section

The home page `h1` names the page topic, because the headline below it changes with every race and a search engine reads the `h1` as the subject.

### Metadata never throws and noindexes a missing resource

Where: `apps/web/app/seasons/[year]/page.tsx`, `apps/web/app/circuits/[ref]/page.tsx`, `apps/web/app/drivers/[ref]/page.tsx`, `apps/web/app/seasons/[year]/races/[round]/page.tsx` — `generateMetadata`; `apps/web/app/seasons/[year]/races/[round]/page.tsx` — `generateMetadata`; `apps/web/app/drivers/[ref]/page.tsx` — `generateMetadata`; `apps/web/app/constructors/[ref]/page.tsx` — `generateMetadata`; `apps/web/app/drivers/nationality/[slug]/page.tsx`, `apps/web/app/records/[entity]/[slug]/page.tsx`, `apps/web/app/compare/drivers/[pair]/page.tsx`, `apps/web/app/compare/constructors/[pair]/page.tsx` — `generateMetadata`; `apps/web/app/records/[entity]/[slug]/page.tsx` — `generateMetadata`; `apps/web/app/compare/constructors/[pair]/page.tsx` — `generateMetadata`; `apps/web/app/compare/drivers/[pair]/page.tsx` — `generateMetadata`

`generateMetadata` catches a failed or invalid lookup and returns `noindex` metadata instead of throwing; the page itself decides between 404 and error. Streaming ships a 404 body with a 200 status, so `noindex` is what keeps a missing resource out of the index. The season page parses the year first, which makes `/seasons/2021abc` (it renders 2021) point to that season's canonical. `generateMetadata` catches a failed or invalid lookup and returns `noindex` metadata instead of throwing; the page itself decides between 404 and error. Streaming ships a 404 body with a 200 status, so `noindex` is what keeps a missing resource out of the index. `generateMetadata` falls back to generic metadata instead of throwing; the page itself decides between 404 and error. `generateMetadata` catches a failed lookup and returns `noindex` metadata instead of throwing. Streaming ships a 404 body with a 200 status, so `noindex` keeps a missing resource out of the index. A landing or head-to-head page whose slug is off the fixed list returns `noindex` metadata, because streaming ships its 404 body with a 200 status. A landing page whose slug is off the fixed list returns `noindex` metadata, because streaming ships its 404 body with a 200 status. A head-to-head slug that is not on the curated list returns `noindex` metadata, because streaming ships its 404 body with a 200 status.

### Pages left out of the sitemap

Where: `apps/web/app/sitemap.ts` — `STATIC_ROUTES`

`/favourites` is absent from the sitemap because it renders one viewer's `localStorage` and is empty for everyone else, a crawler included. `/status` is absent because it is an operations page about the deployment rather than about Formula 1 and changes by the minute. Both are `noindex`.

### Static sitemap entries carry no lastModified

Where: `apps/web/app/sitemap.ts` — `sitemap`, the static entries

Static sitemap entries carry no `lastModified`. It used to be the render time, which made every regeneration of the ~200 KB file differ from the last and cost an ISR write each day with no URL changed, and a date that is not when the page changed is no use to a crawler.

### Each card route exports its own empty generateStaticParams

Where: `apps/web/app/constructors/[ref]/opengraph-image.tsx` and the other `[ref]`/`[year]`/`[round]` `opengraph-image.tsx` routes — `generateStaticParams`

A metadata image route does not inherit its page's `generateStaticParams`, so each card route exports its own empty one. A card is then rendered once on first request and served from the cache until an ingest purges the `f1-data` tag. A metadata image route does not inherit its page's `generateStaticParams`, so each card route exports its own empty one.

### The compare hub links every curated head-to-head outside Suspense

Where: `apps/web/app/compare/page.tsx` — `AllHeadToHeads`

`AllHeadToHeads` renders outside the `Suspense` boundary so its links reach a crawler; they are the only internal links to the curated head-to-head pages.

### metadataBase is set from SITE_URL

Where: `apps/web/app/layout.tsx` — `metadata.metadataBase`

`metadataBase` is set from the site URL because otherwise every relative canonical and Open Graph URL resolves against localhost and Next logs a build-time warning.

### The season card names a champion only after the final round

Where: `apps/web/app/seasons/[year]/opengraph-image.tsx` — `seasonIsOver`

The season card calls the standings leader the champion only once the final round has been run, because naming the current points leader a world champion mid-season would be wrong on the card most likely to be shared. Race dates are midnight UTC, so the comparison is on the day, not the hour.

### Landing page limits mirror the API ceiling

Where: `apps/web/app/drivers/nationality/[slug]/page.tsx` — `WINNERS_LIMIT`; `apps/web/app/records/[entity]/[slug]/page.tsx` — `TOP_N`

The landing pages request 50 rows from the records explorer, which is `MAX_RECORD_LIMIT` in `pipeline/src/api/constants.py`; asking for more is a 422. 50 is more than any nationality has race winners. The landing pages request 50 rows from the records explorer, which is `MAX_RECORD_LIMIT` in `pipeline/src/api/constants.py`; asking for more is a 422.

### robots.txt blocks only the API

Where: `apps/web/app/robots.ts` — `disallow`

robots.txt disallows only `/api/` (the revalidate webhook). The comparison pages stay crawlable and carry `noindex` instead, because a disallowed URL is never fetched, so its `noindex` would never be seen.

### Career span is present tense and counts distinct years

Where: `apps/web/lib/page-summary.ts` — `careerSpan`

The career sentence is in the present tense so it reads true for a career that is over and one still running. Years are deduplicated because a driver who changed teams mid-season has two season rows for that year.

### A running season's first place is a lead, not a title

Where: `apps/web/lib/page-summary.ts` — `driverPeak`, `constructorSummary`

`championshipPosition` is 1 for whoever leads a season still running, so a P1 is only a title once the season is over. Callers pass `currentYear` (no render-time clock), and a season at or after it never counts as a title. A driver's title count comes from the official table, so taking that many P1 seasons from the oldest end leaves out a current lead that is not yet a title. For constructors only seasons before `currentYear` and from 1958 count as titles, so a P1 in a season still running is reported as a lead.

### Shared drives give a race two winners

Where: `apps/web/lib/page-summary.ts` — `raceSummary`

In the 1950s a shared drive classified two drivers first, so a race can have several P1 rows and the summary names them all as sharing the win instead of picking one.

### The site URL falls back to the production domain

Where: `apps/web/lib/seo.ts` — `SITE_URL`

Canonical, Open Graph and sitemap URLs must be absolute, and the fallback is the production domain rather than the `*.vercel.app` alias the project also answers on. An unset env var then still advertises the host that should be indexed instead of quietly pointing every canonical at the alias.

### Theme colour is a literal that mirrors the primary token

Where: `apps/web/lib/seo.ts` — `THEME_COLOR`

The theme colour is a hex literal because browser metadata cannot read CSS variables; it has to be edited together with `--primary` in `app/globals.css`.

### Per-page card alt text defaults to the page title

Where: `apps/web/lib/seo.ts` — `buildMetadata`, `SeoInput.imageAlt`

An entity card's alt text defaults to the page title with the site name, because the card describes the entity; the generic site blurb would caption every driver with the same sentence.

### Each list page is its own canonical, filters canonicalise to the list

Where: `apps/web/lib/seo.ts` — `buildListMetadata`

Pointing later pages at page one makes Google treat them as duplicates and stop following the links that are the only crawl path to the entries on them, so each page is its own canonical. A filtered view is a variation of the same list and canonicalises to it.

### Sitemap lastmod is never in the future

Where: `apps/web/lib/seo.ts` — `raceSitemapEntry`

A race whose date is still ahead gets no `lastmod`, because a future `lastmod` is invalid in a sitemap and the calendar lists races not yet run.

### Maskable and Apple icons are built for the platform's mask

Where: `apps/web/scripts/generate-icons.mjs` — `maskableSvg`, the `apple-icon.png` write

The maskable icon is a full-bleed square with the mark inside the 80% safe zone, because Android crops it to a circle. The Apple icon stays opaque because iOS ignores transparency and applies its own mask. The Apple icon stays opaque because iOS ignores transparency and applies its own mask.

### Landing page lists are fixed

Where: `apps/web/lib/seo-landing.ts` — `RECORD_RANKINGS`, `NATIONALITY_PAGES`

Both lists are fixed so the number of cached pages stays bounded, and a later ingest cannot mint a thin page by adding the first driver of a new nationality.

### Nationality pages filter on the API's spelling

Where: `apps/web/lib/seo-landing.ts` — `NationalityPage.nationality`, `label`

`nationality` is spelled exactly as the API spells it because that is what its filter matches, while `label` is how a headline reads it ("New Zealand", not "New Zealander"). The two are separate fields.

### `favicon.ico` holds PNG entries

Where: `apps/web/scripts/generate-icons.mjs` — `buildIco`

The ICO container holds PNG-compressed entries, which every browser has read since Windows Vista and which are far smaller than BMP payloads.

### Query-string comparisons canonicalise to /compare

Where: `apps/web/app/compare/drivers/page.tsx`, `apps/web/app/compare/constructors/page.tsx` — `generateMetadata` (`seo`)

Every `?d1=&d2=` or `?c1=&c2=` pairing is its own URL, so their metadata is `noindex` and the canonical is `/compare`, not the comparison's own path. Because the canonical is deliberately the hub, it must not be changed to the page's own URL. The curated `[pair]` pages are the only indexable head-to-heads.
