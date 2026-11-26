# 0005 — Social cards (Satori)

The `Object.prototype` word bug and `satoriText()` are covered in `CLAUDE.md`, and so is the rule
that segment and metadata-route exports must be literals (each route repeats its own
`size`/`contentType`). This ADR keeps the rest.

### Every element sets `display: 'flex'`

Where: `apps/web/components/seo/og-card.tsx` — `OgCard`

Satori, which `next/og` renders with, has flexbox only: no grid and no floats, and every element with more than one child needs an explicit `display: 'flex'`. The cards set it everywhere, single-`<span>` wrappers included, because a missing one silently collapses the layout.

### Satori text quirks, measured

Where: `apps/web/components/seo/og-card.tsx` — `INVISIBLE_SEPARATOR`, `satoriText`, the `TRACKER` wordmark span

`satoriText` uses U+FEFF (zero-width no-break space) because Satori gives it no advance width, unlike U+2060, which leaves a gap, and U+00AD, which draws a hyphen. The separator goes before the word's last character, because one appended after the word leaves the bare word as its own token and it still vanishes. Satori collapses ordinary whitespace at a span boundary, so the wordmark's second span starts with a non-breaking space; with an ordinary space it renders as "F1TRACKER".

### The mark is inlined

Where: `apps/web/components/seo/og-card.tsx` — `MARK`, `MARK_SRC`

The logo is an inline data URI rather than a fetch of `/icon.svg`. The root card renders during the build, before the site serves anything, and the per-entity cards cannot reliably reach their own origin because of the deployment alias and preview protection. Satori renders to a PNG, so `next/image` has nothing to optimise, and the `<img>` lint rule is disabled on that one element.

### Values shrink to fit

Where: `apps/web/components/seo/og-card.tsx` — `titleSize`, `statValueSize`

Long titles step down in size, or they wrap into the subtitle. Stat tiles usually hold a short count, but a race card puts a podium of surnames in them, so the whole row shrinks as soon as any value stops being a short number.

### A failing card falls back to branded chrome

Where: `apps/web/components/seo/og-card.tsx` — `OgFallbackCard`

A metadata route that throws hands social scrapers a broken image, and the page already tells a 404 from an outage through `isNotFound()`, so the image must never be what decides. When the API is unreachable or the entity is gone, the card renders the generic branded version.

### The accent is lightened for contrast only

Where: `apps/web/components/seo/og-card.tsx` — `readableAccent`, `MIN_ACCENT_CONTRAST`

The card draws on #0A0A0A, and the palette holds liveries such as Lotus's #1A1A1A and Brabham's #003300 that would put the eyebrow and the rule in an invisible colour. `readableAccent` raises lightness in 0.02 steps, keeping hue and saturation, and stops at the first step that reaches WCAG's 3:1 floor for large text and non-text UI, so a colour is nudged rather than blown out; brand red already passes and comes back unchanged. This is a rendering adjustment for one surface, not a second palette: the backend palette still decides what colour a team is.
