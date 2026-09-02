# Attributions, Licences & Terms Compliance

F1 Tracker is an **unofficial, non-commercial fan project**. This document is the
authoritative record of every third-party source it uses, the licence or terms
each one imposes, and how this project satisfies them.

> **Rule of thumb:** this project must stay free and non-commercial. Three of the
> sources below (jolpica-f1, OpenF1, CARTO) forbid commercial use outright. See
> [Commercial use](#commercial-use--what-would-break) before monetising anything.

---

## Trademark disclaimer

> F1 Tracker is unofficial and is not associated in any way with the Formula 1
> companies. F1, FORMULA ONE, FORMULA 1, FIA FORMULA ONE WORLD CHAMPIONSHIP,
> GRAND PRIX and related marks are trade marks of Formula One Licensing B.V.
>
> Constructor names and team logos are trade marks of their respective owners.
> They are reproduced here for identification and editorial purposes only.

This notice is shown to end users in the site footer and on the `/attributions`
page, and must not be removed.

---

## Data sources

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

> Commercial licensing enquiries go to `admin@jolpi.ca`.

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

### OpenF1 — driver headshots

| | |
|---|---|
| **Used for** | Current-era (2023+) driver headshot images |
| **Endpoint** | `https://api.openf1.org/v1` |
| **Terms** | <https://openf1.org/> — intended for educational, personal, research and non-commercial fan use; other uses require contacting them for licensing |

**How we comply:** credited on `/attributions` and in the README; the project is
non-commercial; requests are limited to three session lookups per full ingest and
are skipped entirely once headshots exist.

### TheSportsDB — current constructor logos

| | |
|---|---|
| **Used for** | Team badges for the current grid (`apps/web/public/logos/`) |
| **Endpoint** | `https://www.thesportsdb.com/api/v1/json/3` (free tier) |
| **Terms** | <https://www.thesportsdb.com/docs_terms_of_use.php> |
| **Obligations** | Do not pass their artwork off as your own; link back to their site; use trademarked sports logos **"as is"**, unmodified |

**How we comply:**
- Credited with a **link back to thesportsdb.com** on `/attributions`.
- Badges are downloaded byte-for-byte via `_download_file()` and are **not**
  cropped, recoloured or otherwise altered (`ConstructorLogoIngestor` in
  `pipeline/src/ingestion/images.py`). The square-crop path
  (`_download_and_resize`) is used for driver headshots only, never for logos.
- Non-commercial use only.

> **Known limitation:** the free/shared tier key is used. If this project ever
> grows past hobby traffic, register a dedicated key at thesportsdb.com.

### Wikidata / Wikimedia Commons — historic driver photos and team logos

| | |
|---|---|
| **Used for** | Headshots for historic drivers, logos for defunct constructors |
| **Endpoints** | `https://query.wikidata.org/sparql`, `https://commons.wikimedia.org/w/api.php` |
| **Licence** | **Per file.** Wikidata statements are CC0, but each Commons *image* has its own licence — commonly CC BY-SA, CC BY, or public domain |
| **Obligations** | Per-file author + licence attribution; a descriptive User-Agent with contact details ([Wikimedia UA policy](https://foundation.wikimedia.org/wiki/Policy:Wikimedia_Foundation_User-Agent_Policy)) |

**How we comply:**
- The ingestor records each file's author, licence name, licence URL and Commons
  source page, and writes them to
  `apps/web/public/credits/wikimedia-credits.json`, which is rendered
  per-image on the `/attributions` page.
- A compliant User-Agent identifying the project and linking the repository is
  sent on every Wikimedia request.
- Requests are rate-limited (`time.sleep`) and skipped once assets exist.

> Photos are downscaled and centre-cropped to a square for use as avatars. This
> is a modification; CC BY-SA files therefore remain under CC BY-SA and are
> credited as adapted. Files whose licence is unknown or non-free are not used.

### f1-circuits-svg — circuit layout drawings

| | |
|---|---|
| **Used for** | The 160 track layout SVGs in `apps/web/public/tracks/` |
| **Source** | <https://github.com/julesr0y/f1-circuits-svg> |
| **Licence** | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| **Obligations** | Credit the author, link the licence, indicate changes |

**How we comply:** credited by name with a link to the repository and to the
CC BY 4.0 deed on `/attributions`, and in
`apps/web/public/tracks/ATTRIBUTION.txt` alongside the files themselves. The
"white" style variant is used unmodified.

### CARTO + OpenStreetMap — circuit world map basemap

| | |
|---|---|
| **Used for** | Dark basemap tiles behind the circuit world map |
| **Tiles** | `https://{s}.basemaps.cartocdn.com/dark_all/...` |
| **Obligations** | Credit **both** CARTO and OpenStreetMap contributors, visibly, on every map. OSM data is [ODbL](https://www.openstreetmap.org/copyright). CARTO's free basemap tier is non-commercial and capped at 75,000 mapviews/month |

**How we comply:** the Leaflet `TileLayer` renders the required
`© OpenStreetMap contributors © CARTO` attribution control with links to both.

---

## Commercial use — what would break

If F1 Tracker ever takes ads, donations-with-perks, sponsorship or a paid tier,
the following stop being lawful **immediately**:

| Source | Why it breaks | Replacement path |
|--------|---------------|------------------|
| jolpica-f1 dataset | CC BY-NC-SA 4.0 forbids commercial use, and it is the source of essentially every record in the database | Contact `admin@jolpi.ca`, or license data from an official provider |
| OpenF1 headshots | Non-commercial terms | Contact OpenF1 for licensing, or drop headshots |
| CARTO basemap | Free tier is non-commercial | Paid CARTO plan, or self-host OSM tiles |
| TheSportsDB logos | Free tier plus trademark exposure on team badges | Paid tier, and clear the trademarks |
| F1 word marks | Formula One Licensing B.V. tolerates unofficial non-commercial fan use far more readily than commercial use | Licensing agreement |

Nothing in this project may be monetised without resolving all of the above
first.

---

## Reporting a problem

If you are a rights holder and believe something here is used improperly, open an
issue at <https://github.com/hugoogb/f1-tracker/issues> and it will be removed
promptly.
