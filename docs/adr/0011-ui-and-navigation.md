# 0011 — UI and navigation

Design-system primitives, layout, navigation, search and keyboard shortcuts.

### Reduced motion changes only the transition

Where: `apps/web/components/ui/motion.tsx` — `FadeIn`, `StaggerList`, `PodiumReveal`

The server cannot know the visitor's reduced-motion preference, so the `initial`/`hidden` styles written into the HTML must be identical for everyone or hydration mismatches. The preference therefore only swaps the transition for a duration of 0, which never reaches the markup.

### Search highlight resets during render

Where: `apps/web/components/layout/command-search.tsx` — `highlightedFor`

The highlighted option returns to the top when the query changes, by adjusting state during render rather than in an effect, so the stale highlight is never painted for a frame.

### Podium order is visual only

Where: `apps/web/components/best-seasons/season-podium.tsx` — `desktopOrder`; `apps/web/components/best-seasons/season-podium.tsx` — `SeasonPodium`

The 2-1-3 podium arrangement uses CSS `order` at the desktop breakpoint, so the DOM and the phone layout stay in rank order for reading and screen readers. The desktop podium shows 2-1-3 with `md:order-*` classes while the DOM stays in rank order, so a phone stacks the cards in rank order and a screen reader reads them that way.

### iOS autolinking is switched off

Where: `apps/web/app/layout.tsx` — `metadata.formatDetection`

Telephone, date, address and email autolinking are switched off because iOS Safari turns lap times and car numbers into phone-number links.

### Search reports failure instead of an empty list

Where: `apps/web/lib/use-search.ts` — `useSearch`

Search is one of the few places the browser calls the API directly, so it breaks when the API's `CORS_ORIGINS` does not list the site's origin; a blocked fetch rejects with nothing useful. The hook exposes `failed` so callers can say the search broke instead of rendering an empty list that looks like no results.

### A page listed in two nav groups highlights the first

Where: `apps/web/lib/nav.ts` — `activeGroup`

Best seasons appears under both Season and Stats, and a page in two groups belongs to the first, so the header never shows two active sections at once.

### Palette group order

Where: `apps/web/lib/palette.ts` — `paletteGroupOrder`

Groups are ordered so Enter on the first option opens what was most likely meant: a typed year puts seasons and races first, and a page leads only when its title starts with the query ("rec" gives Records). A keyword match ("ver" matching Compare via "versus") must not sit above Verstappen.

### Palette results are shown only for the current query

Where: `apps/web/lib/palette.ts` — `isCurrentFor`

While the debounce and request are in flight the previous query's results are still held, and offering them would let Enter open a result for text that is no longer typed, so results count only when they answer the exact current query.

### `entityRef`, not `ref`

Where: `apps/web/components/favourites/favourite-button.tsx` — `FavouriteButtonProps.entityRef`

The f1db ref prop is named `entityRef` because React reserves `ref`.

### Search is one combobox over one listbox

Where: `apps/web/components/layout/command-search.tsx` — `CommandSearch`

The search is a single combobox over a single listbox, so the arrow keys move through every group and a screen reader announces the highlighted option.

### Short queries are derived, and stale responses dropped

Where: `apps/web/lib/use-search.ts` — `searchable`

A query too short to send is an empty result by definition, so it is derived rather than stored; clearing state from inside the effect would only add a render. Each request carries a `current` flag so an earlier, slower response cannot overwrite a later one.
