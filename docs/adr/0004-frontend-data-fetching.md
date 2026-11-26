# 0004 — Frontend data fetching

Cache scopes, tags, `no-store` endpoints and `ApiError` are covered in `CLAUDE.md`. This ADR keeps
what is not.

### The clock only picks a TTL

Where: `apps/web/lib/api.ts` — `cacheScopeFor`

`cacheScopeFor` reads the current UTC year to give finished seasons the long TTL. That is the one acceptable use of the render-time clock in a cached fetch, because it chooses how long an entry lives, never anything in the response.

### The records explorer goes through a same-origin route handler

Where: `apps/web/lib/api.ts` — `recordsExploreQuery`, `fetchRecordsExplore`, `api.records.explore`; `apps/web/app/api/records/explore/route.ts`

The explorer's filters change without a navigation, so its fetch happens in the browser. Calling FastAPI directly would make it the only endpoint whose failure is a CORS rejection, and it would need `NEXT_PUBLIC_API_URL` to be reachable from visitors' machines. The browser calls `/api/records/explore` on its own origin instead, and that handler calls FastAPI from the server. Both sides build the query with `recordsExploreQuery`, so they cannot disagree on spelling: `nationality` and `country` are one control in the UI but two parameters upstream. `fetchRecordsExplore` throws `ApiError` like `fetchApi`, so a rejected filter combination (4xx) stays distinct from an outage (5xx) in the browser too.

### Records explorer mirrors filters with history.replaceState

Where: `apps/web/components/records/records-explorer.tsx` — `RecordsExplorer`, `readFilters`; `apps/web/components/best-seasons/best-seasons-table.tsx` — `BestSeasonsTable`

The opening filters are read once through `useSearchParams` in a Suspense-wrapped client component, and every later change is client state mirrored into the query string with `history.replaceState`. The page never reads `searchParams` on the server, so the route stays in the full route cache; `ListFilter` and `Pagination` cannot be used because they `router.push`, which would navigate the route on each change. The opening filters are read once through `useSearchParams` in a Suspense-wrapped client component, and every later change is client state mirrored into the query string with `history.replaceState`. The page never reads `searchParams` on the server, so the route stays in the full route cache; `ListFilter` and `Pagination` cannot be used because they `router.push`, which would navigate the route on each change. Request status is derived from a per-filter key compared with the last settled request, so each request causes one state update, in the async callback and none in an effect body.

### Clock reads that only change on 1 January

Where: `apps/web/app/seasons/[year]/page.tsx` — `seasonNeighbours` call; `apps/web/app/drivers/[ref]/page.tsx` — `currentYear`; `apps/web/app/drivers/[ref]/page.tsx` — `currentYear`; `apps/web/app/constructors/[ref]/page.tsx` — `currentYear`

A cached page may read the clock when the value only changes on 1 January: the season page uses the year to bound its "next season" arrow, and the driver page passes it to the summary to decide whether a table is final. The page output therefore stays deterministic between purges. The driver page passes the current year to its summary only to decide whether a table is final, so the value changes on 1 January and nowhere else. The constructor page passes the current year to its summary only to decide whether a P1 counts as a title or a lead, so the value changes on 1 January and nowhere else.

### The explorer proxy transcribes its parameters

Where: `apps/web/app/api/records/explore/route.ts` — `readParams`

The records route handler reads each upstream parameter by name instead of forwarding the query string. That keeps it a front door for one endpoint rather than a general proxy, and hands FastAPI's own validation a shape it recognises.

### The purge reads the API uncached

Where: `apps/web/app/api/revalidate/route.ts` — `fetchFresh`

The purge handler asks FastAPI directly, never through the Data Cache. It runs right after an import, and the cached copies are exactly what is about to be expired.

### Purge tags must match the cache scopes

Where: `apps/web/app/api/revalidate/route.ts` — `tagsForYears`; `apps/web/lib/api.ts` — `cacheScopeFor`

`tagsForYears` names the same tags `cacheScopeFor` hands out: each season, every entity that appears in it (a race in 2026 changes Hamilton's profile but not Fangio's) and the global lists. A tag one side does not know leaves pages stale or purges nothing.

### Explorer filter options are fetched on the server

Where: `apps/web/app/records/page.tsx` — `RecordsPage`, the `systems` / nationality lists

The explorer's dropdown options are fetched in the server render so they ride the page's own cache instead of costing the browser three extra round trips. They are settled rather than awaited, so a missing list only hides one filter.

### useSearchParams sits inside the tightest Suspense boundary

Where: `apps/web/app/records/page.tsx` — the `Suspense` around the explorer; `apps/web/app/compare/page.tsx` — `ComparePicker`; `apps/web/app/records/page.tsx` — the `Suspense` around the explorer; `apps/web/app/compare/page.tsx` — `ComparePicker`; `apps/web/app/best-seasons/page.tsx` — the table

`useSearchParams` bails out of server rendering up to the nearest `Suspense` boundary, so the boundary wraps only the client piece that reads it (the explorer, the compare forms). The rest of the page, including the curated tables and the headings and links, stays in the prerendered HTML a crawler reads. `useSearchParams` bails out of server rendering up to the nearest `Suspense` boundary, so the boundary wraps only the forms. The heading and links stay in the HTML instead of a page a crawler sees as blank. `useSearchParams` bails out of server rendering up to the nearest `Suspense` boundary, so the boundary wraps only the client piece that reads it. Everything outside it stays in the prerendered HTML.

### The home page revalidates hourly, not more often

Where: `apps/web/app/page.tsx` — `revalidate`

The home page's one-hour TTL bounds only the render-time clock split (next race and countdown), which moves only when a race starts. New results arrive with an ingest, whose purge already refreshes the page. Every regeneration is a function invocation, so a five-minute TTL would cost twelve times as many for the same page, and a shorter value buys no freshness.
