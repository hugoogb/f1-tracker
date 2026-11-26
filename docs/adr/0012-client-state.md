# 0012 — Client state

Browser storage, hydration and client-only state other than favourites (ADR 0003).

### Records explorer keeps min-starts as text

Where: `apps/web/components/records/records-explorer.tsx` — `Filters.minStarts`

The minimum-starts filter is held as a string so the input can be cleared, and an empty string means the API applies its own per-category floor. Parsing it to a number in state would make the field impossible to empty.

### Changing entity clears the nationality filter

Where: `apps/web/components/records/records-explorer.tsx` — `update`

Driver and constructor nationality lists differ, so switching entity resets the nationality filter. A kept pick would match nothing and empty the table with no visible cause.

### The favourite star draws the same glyph in both states

Where: `apps/web/components/favourites/favourite-button.tsx` — `FavouriteButton`

The star renders in both states and only its fill and colour change, so the swap from the server's 'not favourited' to the stored answer cannot shift layout. Being icon-only, its accessible name carries both the action and the entity, and `aria-pressed` carries the state.

### The weekday travels with the time

Where: `apps/web/components/ui/local-date.tsx` — weekday-and-time component

Which day a session falls on depends on the viewer's timezone, so the weekday is formatted together with the time instead of grouping rows by day. A grouping computed on the server would have to regroup on hydration.

### Stale favourites refresh in small batches

Where: `apps/web/components/favourites/use-stale-refresh.ts` — `BATCH_SIZE`, `useStaleRefresh`

Entries older than a day are refetched in batches of a few, so a long list cannot open a request per favourite at once. Each batch goes through `Promise.allSettled`, so a favourite the API cannot answer keeps its cached data instead of disappearing.

### Records default to the curated tables, and the tab swaps after hydration

Where: `apps/web/app/records/records-tabs.tsx` — `RecordsTabs`, `useHydrated`

The curated tables are the default tab because they are the landing content and the part of the page that gets indexed. A link carrying explorer filters opens on the explorer, read through `useHydrated` so the server pass and first client render agree and the tab swaps afterwards rather than mismatching during hydration.

### The shared clock is re-read on subscribe

Where: `apps/web/lib/client-only.ts` — `subscribeToClock`

`now` is refreshed when a component subscribes, so the first render after hydration does not show whatever the clock read when the module was first evaluated.

### Compare links carry the display name

Where: `apps/web/lib/compare-prefill.ts` — `comparePrefill`, `compareHref`

A prefilled `/compare` link carries the display name next to the ref so the picker can show who is selected without a lookup. An older link with only a ref shows the ref as the name.

### Storage events with a null key mean a clear

Where: `apps/web/lib/recently-viewed.ts` — `subscribe`

A `storage` event with a null key is another tab calling `localStorage.clear()`, so the listener also fires for it and the list is re-read as empty.

### Explorer tab keys mirror the explorer's own query string

Where: `apps/web/app/records/records-tabs.tsx` — `EXPLORER_KEYS`; `apps/web/components/records/records-explorer.tsx` — `serialiseFilters`

`EXPLORER_KEYS` lists exactly the query keys `serialiseFilters` writes (`entity`, `category`, `era`, `nationality`, `minStarts`, `sort`, `page`), and only those keys open `/records` on the Explore tab. Any other query parameter leaves the curated tables as the default view. A filter added to the explorer must also be added to `EXPLORER_KEYS`, or a shared link carrying only that filter opens on the wrong tab.
