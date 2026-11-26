# 0003 — Favourites store

### Browser-only, with no account

Where: `apps/web/lib/favourites.ts`

Favourite drivers, constructors and circuits live in `localStorage` only, with no account and no backend, so the list never leaves the browser it was made in and there is nothing to identify a viewer with.

### Hydration-safe reads through `useSyncExternalStore`

Where: `apps/web/lib/favourites.ts` — `SERVER_SNAPSHOT`, `EMPTY`, `subscribe`, `ensureLoaded`

Pages are server-rendered and cached, and the server has no `localStorage`, so reading it during render would make the first client pass disagree with the server's markup. The store follows `lib/client-only.ts`: the server and the first client render see `SERVER_SNAPSHOT` (empty, `loaded: false`), and storage is read on `subscribe`, which React runs after the commit, so the swap is an ordinary update rather than a hydration mismatch. `SERVER_SNAPSHOT` and `EMPTY` are shared frozen values because a snapshot that is a new object on every call makes `useSyncExternalStore` re-render forever. `loaded` sits inside the snapshot rather than in a second store, so a view can tell "no favourites" from "not read yet" in one consistent read and never flashes an empty state. `ensureLoaded` fills the snapshot without emitting, because it runs inside snapshot reads during render, where notifying other components is an error; nothing is missed, since React re-reads every snapshot straight after subscribing.

### Stored data is a display cache, and untrusted

Where: `apps/web/lib/favourites.ts` — `FavouriteEntity`, `parse`, `colorOrNull`, `STORAGE_KEY`, `MAX_FAVOURITES`

The stored name, detail, flag and colour are a cache so that `/favourites` and the home page need no API call per entry; pages that already hold fresh data refresh them through `refreshFavourite`. The blob is a string a viewer can edit in devtools, so `parse` validates entry by entry and drops what it cannot read: a corrupt blob costs the list, never the app. `colorOrNull` accepts a hex colour and nothing else because the value reaches a `style` attribute. The key is versioned (`:v1`) so a later schema is discarded rather than half-read, and `MAX_FAVOURITES` stops a runaway loop from filling the origin's storage quota.

### Storage failures are swallowed

Where: `apps/web/lib/favourites.ts` — `readStorage`, `writeStorage`

`localStorage` throws in Safari's private mode, wherever site data is blocked and when the quota is exceeded. Every read and write is wrapped so favourites just stop persisting: the in-memory list still works for the page view and does not survive a reload.

### Cross-tab sync

Where: `apps/web/lib/favourites.ts` — `handleStorageEvent`

The `storage` event fires only in other tabs, which keeps two open tabs in step instead of letting each overwrite the other on its next write. An event with `key === null` is a `localStorage.clear()` from another tab and must also trigger a reload.

### Refreshing never adds, and always stamps

Where: `apps/web/lib/favourites.ts` — `refreshFavourite`

Refreshing does nothing for an entity that is not already a favourite: starring is a deliberate act, and visiting a page must not add to the list. It stamps `refreshedAt` even when nothing changed, or an entry whose name never moves would be re-fetched on every visit.

### One boolean snapshot per star

Where: `apps/web/lib/favourites.ts` — `useIsFavourite`

Each star subscribes with a boolean snapshot rather than the whole list, so on a 50-row page React skips re-rendering the 49 stars whose answer did not change.
