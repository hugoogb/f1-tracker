# Attributions, Licences & Terms Compliance

F1 Tracker is an **unofficial** Formula 1 fan project. This document is the
authoritative record of every third-party source it uses and the obligation each
one imposes.

The list is deliberately short. Sources are only added when nothing already in
the project can supply the data, because every additional source is a standing
obligation someone has to keep honouring.

**Every remaining obligation is attribution.** Nothing here restricts commercial
use or imposes share-alike.

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

### f1db — the dataset

| | |
|---|---|
| **Used for** | Seasons, races, circuits and their layouts, drivers, constructors, results, qualifying, sprint, pit stops, official standings — 1950 to present |
| **Also supplies** | The circuit layout SVGs in `apps/web/public/tracks/` |
| **Source** | <https://github.com/f1db/f1db> |
| **Licence** | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| **Obligations** | Credit f1db, link the licence, indicate changes |

**How we comply:** credited in the site footer, on `/attributions`, in the README
and in [LICENSE-DATA.md](LICENSE-DATA.md). Modifications are disclosed (we reshape
into a relational schema and derive additional statistics). The redistributed
dump in `docker/backups/` carries the same notice.

Ingestion downloads one versioned release artifact per run
(`src/ingestion/f1db.py`) rather than crawling an API, so there are no rate
limits to observe. Pin `F1DB_VERSION` for reproducible seeds.

> The circuit SVGs are credited by f1db to [Jules Roy](https://github.com/julesr0y),
> who published them separately as `f1-circuits-svg`. They ship with the dataset
> under the same CC BY 4.0 licence, so f1db's single credit covers both.

### Fast-F1 — session timing

| | |
|---|---|
| **Used for** | Lap-by-lap lap times, tyre stints and qualifying sector times (2018+) — the only data f1db does not carry |
| **Source** | <https://github.com/theOehrly/Fast-F1> |
| **Licence** | MIT |

**How we comply:** credited by name in the footer, README and `/attributions`.
Session loads are throttled (`THROTTLE_DELAY = 45` seconds between uncached
loads, ~500 calls/hr) and cached on disk via `fastf1.Cache`.

> Fast-F1 carries the same Formula One Licensing B.V. trademark disclaimer we
> reproduce above. Timing data originates from Formula 1's own systems and is
> used here for editorial and analytical purposes.

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

Removed to shrink the compliance surface. Do not reintroduce any of these
without re-reading their terms and adding a row above.

| Source | Was used for | Why it was dropped |
|--------|--------------|--------------------|
| **jolpica-f1 (Ergast)** | The entire dataset | CC BY-NC-SA 4.0 — forbade commercial use and imposed share-alike on any derived dataset. Replaced by f1db (CC BY 4.0), which is also more complete |
| **OpenF1** | Current-era driver headshots | Non-commercial terms, and the images are Formula 1 press media |
| **TheSportsDB** | Current constructor logos | Shared free-tier key, linkback obligation, and team badges are registered trademarks |
| **Wikimedia Commons / Wikidata** | Historic driver photos, defunct team logos | Every file individually licensed, requiring per-image author and licence credit in perpetuity |
| **CARTO basemap tiles** | World map background | Mandatory visible CARTO **and** OpenStreetMap attribution; free tier non-commercial and capped at 75,000 mapviews/month |

Driver and constructor identity is rendered as initials on the team colour
(`components/ui/driver-avatar.tsx`, `components/ui/constructor-logo.tsx`). The
palette in `pipeline/src/ingestion/colors.py` is curated in-repo; colour values
are facts about liveries, not creative expression.

**On team logos specifically:** there is no free source. Wikimedia Commons
rejects fair-use uploads, so copyrighted team badges are simply not there;
English Wikipedia hosts them under article-specific non-free rationales that do
not transfer to other uses. Nominative fair use is a trademark doctrine with no
equivalent in copyright law, so it does not cure the copyright in the artwork.

---

## Commercial use

Nothing in the project restricts it. f1db is CC BY 4.0, Fast-F1 is MIT, and
Natural Earth is public domain — all three permit commercial use, and none
imposes share-alike. Keeping the attributions above intact is the whole
requirement.

Formula One Licensing B.V. tolerates unofficial non-commercial fan use more
readily than commercial use, so a commercial version would want its own
trademark review. That is a trademark question, not a licensing one.

---

## Reporting a problem

If you are a rights holder and believe something here is used improperly, open an
issue at <https://github.com/hugoogb/f1-tracker/issues> and it will be removed
promptly.
