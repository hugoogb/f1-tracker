# Attributions, Licences & Terms Compliance

F1 Tracker is an **unofficial, non-commercial fan project**. This document is the
authoritative record of every third-party source it uses, the licence or terms
each one imposes, and how this project satisfies them.

The source list is deliberately short. Sources are only added when nothing
already in the project can supply the data, because every additional source is a
standing obligation someone has to keep honouring.

---

## Trademark disclaimer

> F1 Tracker is unofficial and is not associated in any way with the Formula 1
> companies. F1, FORMULA ONE, FORMULA 1, FIA FORMULA ONE WORLD CHAMPIONSHIP,
> GRAND PRIX and related marks are trade marks of Formula One Licensing B.V.
>
> Constructor and driver names are used for identification and editorial
> purposes only.

This notice is shown to end users in the site footer and on the `/attributions`
page, and must not be removed.

---

## Sources

### jolpica-f1 (Ergast successor) — primary dataset

| | |
|---|---|
| **Used for** | Seasons, races, circuits, drivers, constructors, results, qualifying, sprint, pit stops, standings |
| **Accessed via** | [Fast-F1](https://github.com/theOehrly/Fast-F1)'s `fastf1.ergast.Ergast` client |
| **Licence** | [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/) |
| **Terms** | <https://github.com/jolpica/jolpica-f1/blob/main/TERMS.md> |
| **Obligations** | Attribution, NonCommercial, ShareAlike, respect rate limits |

**How we comply:**
- Credited in the site footer, on `/attributions`, in the README, and in
  [LICENSE-DATA.md](LICENSE-DATA.md).
- The redistributed dataset (`docker/backups/latest.sql.gz`) is released under the
  same CC BY-NC-SA 4.0 licence, satisfying ShareAlike.
- Modifications are disclosed (we reshape into a relational schema and derive
  additional statistics).
- The project is non-commercial.
- Rate limits: `pipeline/src/ingestion/base.py` enforces `API_DELAY = 18.0`
  seconds between uncached calls (~200 req/hr) plus exponential backoff on HTTP
  429, and caches aggressively so repeat ingests do not re-hit the API.

> **This is the project's one remaining encumbered source**, and the reason the
> whole project must stay non-commercial. Replacing it with
> [f1db](https://github.com/f1db/f1db) (CC BY 4.0) would remove both the
> NonCommercial and ShareAlike terms outright — see
> [docs/F1DB-MIGRATION.md](docs/F1DB-MIGRATION.md).

### Fast-F1 — client library and timing data

| | |
|---|---|
| **Used for** | Ergast/jolpica client; lap times, tyre stints and qualifying sector times (2018+) from the F1 live timing archive |
| **Licence** | MIT (the library) |
| **Upstream** | <https://github.com/theOehrly/Fast-F1> |

**How we comply:** credited by name in the footer, README and `/attributions`.
Session loads are throttled (`THROTTLE_DELAY = 45` seconds between uncached
session loads, ~500 calls/hr) and cached on disk via `fastf1.Cache`.

> Fast-F1 carries the same Formula One Licensing B.V. trademark disclaimer that
> we reproduce above. Timing data originates from Formula 1's own systems; it is
> used here for non-commercial, editorial/analytical purposes only.

### f1-circuits-svg — circuit layout drawings

| | |
|---|---|
| **Used for** | The circuit layout SVGs in `apps/web/public/tracks/` |
| **Source** | <https://github.com/julesr0y/f1-circuits-svg> |
| **Licence** | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| **Obligations** | Credit the author, link the licence, indicate changes |

**How we comply:** credited by name with a link to the repository and to the
CC BY 4.0 deed on `/attributions`, and in
`apps/web/public/tracks/ATTRIBUTION.txt` alongside the files themselves. The
"white" style variant is used unmodified.

### Natural Earth — world map geometry

| | |
|---|---|
| **Used for** | Country outlines behind the circuit world map (`apps/web/public/geo/world.geo.json`) |
| **Source** | <https://www.naturalearthdata.com/> |
| **Licence** | **Public domain** — no attribution required, no commercial restriction |

Properties are stripped to `name` and coordinates rounded to 2 decimal places to
reduce transfer size. Documented in `apps/web/public/geo/README.txt` as a
courtesy, not an obligation.

---

## Deliberately not used

These were removed to shrink the compliance surface. Do not reintroduce them
without re-reading their terms and adding a row above.

| Source | Was used for | Why it was dropped |
|--------|--------------|--------------------|
| **OpenF1** | Current-era driver headshots | Non-commercial terms, and the images are Formula 1 press media — the highest-risk asset in the project |
| **TheSportsDB** | Current constructor logos | Shared free-tier key, linkback obligation, and team badges are registered trademarks |
| **Wikimedia Commons / Wikidata** | Historic driver photos, defunct team logos | Every file is individually licensed (mostly CC BY-SA), requiring per-image author and licence credit forever |
| **CARTO basemap tiles** | World map background | Mandatory visible CARTO **and** OpenStreetMap attribution; free tier is non-commercial and capped at 75,000 mapviews/month |

Driver and constructor identity is now rendered as initials on the team colour
(`components/ui/driver-avatar.tsx`, `components/ui/constructor-logo.tsx`). The
colour palette in `pipeline/src/ingestion/colors.py` is curated in-repo; colour
values are facts, not creative expression, and carry no licence of their own.

**If you want driver photos or team badges back**, the honest options are to
licence them, or to reinstate Wikimedia Commons and rebuild the per-image credit
pipeline that `/attributions` used to render. There is no permissively licensed
source for current F1 driver portraits.

---

## Commercial use

The project is **non-commercial**, and must stay that way while jolpica-f1
supplies the dataset: CC BY-NC-SA 4.0 forbids commercial use, and it is the
source of essentially every record in the database. Ads, a paid tier,
donations-with-perks or sponsorship would all breach it.

Everything else in the project is already commercially clean — Fast-F1 (MIT),
f1-circuits-svg (CC BY 4.0) and Natural Earth (public domain) impose no such
restriction. So the single blocker is the dataset, and
[docs/F1DB-MIGRATION.md](docs/F1DB-MIGRATION.md) sets out how to remove it.

Separately, Formula One Licensing B.V. tolerates unofficial non-commercial fan
use far more readily than commercial use; a commercial version would want its
own trademark review.

---

## Reporting a problem

If you are a rights holder and believe something here is used improperly, open an
issue at <https://github.com/hugoogb/f1-tracker/issues> and it will be removed
promptly.
