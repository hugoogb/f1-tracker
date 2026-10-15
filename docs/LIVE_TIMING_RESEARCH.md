# Live timing research

Research notes on adding live session data to F1 Tracker. Written 2026-10-15;
every measurement below was taken that day. Nothing here is implemented yet.

## Summary

Live timing is feasible, but not from the VPS. Formula 1's live hub and its
post-session archive sit on the same host, `livetiming.formula1.com`, and that
host answers datacentre IPs with 403. A laptop on a residential connection can
negotiate a live connection today; the VPS cannot.

The workable designs are therefore:

1. A small recorder on a residential connection (home machine on the tailnet)
   that relays the stream to the VPS, which fans it out to browsers.
2. OpenF1's paid tier (€9.90/month), which runs that recorder for you and is
   reachable from the VPS, at the cost of a non-commercial licence, ~3 s
   latency and a third-party dependency.

Recording the raw stream is worth doing regardless of the live page: it removes
the laptop backfill and the 45 s/session throttle, and it feeds every Phase 3
item in `CLAUDE.md` (weather, race control, telemetry) from the same files.

## Sources

### Formula 1's live hub

Measured on 2026-10-15:

| Check                                          | Laptop | VPS |
| ---------------------------------------------- | ------ | --- |
| `POST /signalrcore/negotiate?negotiateVersion=1` | 200    | 403 |
| `GET /static/2025/Index.json` (archive)        | 200    | 403 |
| Old `GET /signalr/negotiate` (classic SignalR) | 401    | 403 |
| `api.openf1.org`                               | 200    | 200 |

Protocol facts that shape a client:

- **The hub moved to SignalR Core in May 2025** (Monaco weekend, Fast-F1
  issue #753). The current endpoint is `wss://livetiming.formula1.com/signalrcore`;
  negotiate is a POST and returns `connectionToken` and the available
  transports (WebSockets, ServerSentEvents, LongPolling). The classic
  `/signalr` endpoint returns 401 everywhere now. Fast-F1 v3.7.0 (December
  2025) shipped the new client; it sends an OPTIONS to the negotiate URL first
  and copies the `AWSALBCORS` cookie into the connection.
- **Some topics are gated behind an F1 TV subscription token since the 2025
  Dutch GP.** Gated live: `CarData.z`, `Position.z`, `ChampionshipPrediction`,
  `PitStopSeries`, `DriverRaceInfo`. Free live: `TimingData`, `TimingAppData`,
  `TimingStats`, `TrackStatus`, `RaceControlMessages`, `WeatherData`,
  `DriverList`, `SessionInfo`, `SessionStatus`, `LapCount`, `TeamRadio`,
  `ExtrapolatedClock`, `TopThree`, `Heartbeat`, `SessionData`. The
  post-session archive still serves the gated topics without a token
  (confirmed on the 2025 Dutch GP race files).
- **The token is a personal F1 TV JWT** (`subscriptionToken` inside the
  `loginSession` cookie on formula1.com). Fast-F1 obtains it through a browser
  add-on plus a human login; its maintainer: "There is no possibility for a
  headless sign-in." It is stored on disk, re-verified against
  `api.formula1.com/static/jwks.json`, and another project reports it expires
  after a few days. Sent as `Authorization: Bearer`. Fast-F1's docs: the live
  client "requires an active F1TV Access/Pro/Premium subscription" and does
  not work in hosted environments.
- **Connections drop after roughly two hours** (Fast-F1 docs) and Fast-F1's
  client has no auto-reconnect (`# TODO: enable auto reconnect?`). The
  `Subscribe` reply returns a full snapshot of every topic, so a reconnect that
  resubscribes is self-healing.
- **`GET /static/StreamingStatus.json`** returns `{"Status":"Offline"}` or
  `Available` and is what projects poll to detect a live session. It is on the
  blocked host.
- **Message model.** One snapshot per topic on subscribe, then partial updates
  to deep-merge into a local copy; arrays arrive as objects keyed by index.
  `Position.z` / `CarData.z` are deflate-compressed, base64-encoded batches at
  ~3.7 Hz per car.
- The Fast-F1 docs page for the live client still says Python 3.8/3.9 only;
  the code uses PEP 604 unions, so that page is stale.

Reference implementations: Fast-F1 `fastf1/livetiming/client.py` (Python,
`signalrcore` library), slowlydev/f1-dash (Rust `signalr` crate + Next.js
dashboard, AGPL-3.0, with a `simulator` that replays recordings),
mricero/F1-Telemetry-Dashboard (documents the token gating and the 401/403
states), harsh779/f1-live-api.

### OpenF1

- Independent third party running its own recorder against the same hub.
- Free tier: historical data since 2023, no auth, 3 req/s and 30 req/min.
- Live tier: €9.90/month. REST plus MQTT (`mqtt.openf1.org:8883`, TLS) plus
  MQTT over WebSocket (`wss://mqtt.openf1.org:8084/mqtt`). 6 req/s, 60
  req/min, up to 10 concurrent MQTT/WebSocket connections. OAuth tokens from
  `POST https://api.openf1.org/token`, one hour lifetime. Topics mirror REST
  paths (`v1/laps`, `v1/location`, ...). "Live" means 30 min before a session
  to 30 min after.
- Latency "about 3 seconds"; intervals every 4 s; weather every minute;
  `car_data` and `location` at 3.7 Hz.
- Endpoints: car_data, location, drivers, intervals, laps, meetings,
  overtakes, pit, position, race_control, sessions, session_result,
  starting_grid, stints, team_radio, weather, championship_drivers,
  championship_teams.
- **Licence**: FAQ says the API is for "educational, personal learning,
  research, and non-commercial fan engagement"; other uses need a licence;
  site content is CC BY-NC-SA 4.0. Attribution appreciated, not required.
  `ATTRIBUTIONS.md` currently states nothing restricts commercial use, and
  Ergast was dropped for NC-SA; OpenF1 reintroduces that constraint.
- Not verified: whether OpenF1 still delivers `car_data`/`location` live after
  F1's token gating.

### Residential proxies

Not recommended. Terms-of-service grey zone, recurring cost, and fragility,
for a hobby project.

## Volume

Measured from the 2025 archive (`.jsonStream` files, the same line format a
recorder writes: timestamp + JSON per line):

| Session                 | CarData.z + Position.z | Timing topics | Total   |
| ----------------------- | ---------------------- | ------------- | ------- |
| Australia FP1 (1 h)     | 7.3 MB                 | 1.7 MB        | 9.0 MB  |
| Australia Race (2 h)    | 17.3 MB                | 7.1 MB        | 24.4 MB |
| Dutch GP FP1 (1 h)      | 8.0 MB                 | 2.3 MB        | 10.3 MB |
| Dutch GP Race (2 h)     | 16.9 MB                | 10.4 MB       | 27.3 MB |

A weekend is roughly 60-80 MB raw; a 24-round season about 1.5-2 GB. Without
the two gated telemetry topics it is about a third of that. The timing JSON
compresses well with gzip; the `.z` payloads barely compress further.

## What the data enables

Live, free topics only:

- Leaderboard with gaps, intervals, last/best lap, sector colours, mini-sectors.
- Tyre compound and stint age per driver, pit stop count, pit-lane status.
- Track status and race control feed: flags, safety car, VSC, investigations,
  penalties.
- Weather: air/track temperature, humidity, wind, rainfall flag.
- Session clock, lap count, qualifying knockout state, team radio clips.
- Live championship "if it ended now" via the existing `src/scoring.py`.

With a token: live track map (positions) and per-car telemetry. Publishing
those publicly from a personal F1 TV token is the legally sensitive part.

Recorded, after the session:

- Fast-F1 loads a recording through `fastf1.livetiming.data.LiveTimingData`
  and `session.load(livedata=...)` instead of fetching. The extractors in
  `src/ingestion/fastf1_sessions.py` take a loaded session, so the existing
  payload importer path works unchanged. Lap times and qualifying sectors
  land minutes after a session ends, with no backlog and no throttle. The
  laptop fetch stays as the fallback for anything the recorder missed.
- Weather, race control events and telemetry, which are the first three
  Phase 3 items, from the same files.
- Reprocessability: keep the raw NDJSON and anything can be re-derived later
  without touching F1's servers.
- Caveats from Fast-F1's docs: start recording 2-3 minutes before the session;
  do not mix a recording with API-fetched data for the same session; give
  recordings their own cache directory.

The constraint does not disappear: the recorder still needs a residential IP,
exactly like today's fetch. What changes is that one two-hour connection per
session replaces a backfill measured in hours.

## Recommended architecture

Recorder at home, relay on the VPS, OpenF1 as plan B.

- **Recorder**: Python, roughly 200 lines. Own client rather than Fast-F1's,
  for reconnects and the optional Bearer header. Runs on any always-on home
  machine on the tailnet. Wakes on the session times already stored on
  `races` (`fp1_at` ... `race`, present for 2024-2026), polls
  `StreamingStatus.json`, connects, writes each message to a local gzip NDJSON
  file, and streams the same lines to the VPS over Tailscale. On session end it
  hands the file to the payload importer.
- **Relay on the VPS**: a second single-process service in
  `docker/compose.prod.yml` from the same image, owning the merged live state
  in memory and exposing one Server-Sent Events endpoint. Separate process
  because the API runs two uvicorn workers and live state cannot be split
  across them. Caddy proxies SSE; SSE is a GET so the GET-only CORS policy
  covers it.
- **Frontend**: a `/live` route, client component, `EventSource` straight to
  the API host, not through Vercel (serverless is the wrong place for a
  long-lived stream). When nothing is live, show the existing next-session
  countdown. Add a user-settable delay: the feed runs 30-60 s ahead of TV
  streams and spoils the race otherwise; f1-dash ships exactly this control.
- **Storage**: raw session files on a VPS volume or cheap object storage, not
  in the shared PostgreSQL. Parsed data in tables: `lap_times` exists; add
  `race_weather` and `race_control_messages`. Telemetry stays in raw files and
  is served on demand, as Phase 3 already planned.
- **Ops**: `/status` gains a recorder heartbeat and "last session recorded";
  the Monday ingest summary's backlog warning becomes a fallback signal.

### Testing without a live session

Archive files are the same line format as a recording, so a replay script can
feed any 2025 session into the relay at real speed or faster, and the whole
pipeline can be built and tested before the next session. Remaining 2026
sessions: Austin Oct 23-25, Mexico City Oct 30-Nov 1, São Paulo Nov 6-8, Las
Vegas Nov 19-21, Qatar Nov 27-29, Abu Dhabi Dec 4-6.

## Legal position

- The feed is undocumented. F1 has already blocked hosted consumers and gated
  topics once; expect it to change again.
- formula1.com terms (read 2026-10-15): material is for "personal,
  non-commercial use only"; users may not "distribute, copy, extract or
  commercially exploit" it. No explicit scraping or automated-access clause.
- The community line, followed by f1-dash and the Home Assistant integration,
  is to display the free timing topics publicly and keep token-gated telemetry
  private. Follow it: no public live track map or telemetry from a personal
  F1 TV token.
- Either route needs a row in `ATTRIBUTIONS.md` and an entry on the
  attributions page before shipping. The OpenF1 route must state its
  non-commercial licence.

## Open questions

- Hardware: is there an always-on home machine, or should a pilot run on
  OpenF1's paid tier?
- Whether OpenF1 still delivers `car_data`/`location` live.
- Exact F1 TV token lifetime.
- Whether F1 blocks a residential IP holding one connection per session for a
  whole season (no project found reports it).

## Suggested order

1. Recorder plus replay tool: pays off immediately in the lap-time path.
2. Relay service and the `/live` page.
3. Phase 3 tables (weather, race control) from the files already being saved.

## References

- Fast-F1 live timing client: https://github.com/theOehrly/Fast-F1/blob/main/fastf1/livetiming/client.py
- Fast-F1 issue #753, move to SignalR Core: https://github.com/theOehrly/Fast-F1/issues/753
- Fast-F1 live timing docs: https://docs.fastf1.dev/api_reference/livetiming.html
- Fast-F1 F1TV auth docs: https://docs.fastf1.dev/api_reference/accounts_auth.html
- Fast-F1 f1auth.py: https://github.com/theOehrly/Fast-F1/blob/main/fastf1/internals/f1auth.py
- OpenF1: https://openf1.org/ , docs https://openf1.org/docs/ , streaming https://openf1.org/auth.html
- f1-dash: https://github.com/slowlydev/f1-dash
- F1-Telemetry-Dashboard: https://github.com/mricero/F1-Telemetry-Dashboard
- harsh779/f1-live-api: https://github.com/harsh779/f1-live-api
- SignalR endpoint write-up: https://dweik.xyz/post/f1-signalr-endpoint/
- Home Assistant F1 sensor thread (gated topics): https://community.home-assistant.io/t/formula-1-racing-sensor/880842/452
- f1fantasyapp issue #437 (cloud block, 2026): https://github.com/emsqrd/f1fantasyapp/issues/437
- formula1.com terms: https://www.formula1.com/en/information/terms-of-use-f1-tv-us-2024.2EBhenzOm9aXMLhp2nw2rF
- 2026 calendar: https://www.silverstone.co.uk/news/f1-2026-calendar-full-list-venues-key-dates
