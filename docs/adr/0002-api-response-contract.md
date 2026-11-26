# 0002 — API response contract

The frontend's response types in `apps/web/lib/types.ts` mirror what the FastAPI routers send.
These are the field meanings a reader could not infer from a name and type, and would get wrong.

### Nulls that carry a meaning

Where: `apps/web/lib/types.ts` — `RaceResult.grid`, `SprintResult.grid`, `DriverStanding.constructor`, `CompoundDegradation.degradationMsPerLap`, `LineageEntry.yearTo`, `LineageResponse.lineageRef`, `OpsChat.toolShare`, `CalendarRound.date`, `CalendarRound.circuit.latitude`/`longitude`, `BestSeason.rank`

A null `grid` is a pit-lane start, not missing data. A standings row's `constructor` is null for a driver who did not race the table's round (Rindt, 1970). `degradationMsPerLap` is null when a compound has too few laps or only one tyre age to fit a line. A lineage entry's `yearTo` is null for the name still racing, and `lineageRef` is null for a team that never changed its name, which is most of them. `toolShare` is null until there is at least one successful answer. A calendar round's `date` is null only for a malformed row, and a circuit with null coordinates is left off the map. `BestSeason.rank` is null for the season still running.

### Units and signs

Where: `apps/web/lib/types.ts` — `RecordsExploreRow`, `DriverGap.gapMs`, `NormalisedStanding.positionDelta`, `BestSeasonComponentInfo.weight`, `BestSeasonComponent`

A records-explorer `value` is a count as an integer, points as a decimal, or a rate as a 0-1 fraction (`format` says which). `starts` is starts for a driver and car entries for a constructor, within the year range. `gapMs` is measured to whoever had the lowest elapsed time on that lap. A positive `positionDelta` is a promotion against the official table. Best-seasons component weights sum to 100; a component's `value` is 0-1, and `points` is `value * weight`, its share of the 0-100 total.

### Text and colour the API decides

Where: `apps/web/lib/types.ts` — `RecordsExploreResponse.note`, `StandingsProgressionDriver.constructorRef`, `BestSeasonContender.constructor`

The explorer's column `note` is written by the API so the UI cannot misstate what a ranking counts; render it, never rewrite it. A progression line's colour is the team the driver last actually raced for that season. A best-seasons contender's `constructor` is the team they raced for most that season, and that is where their colour comes from.

### Ops status fields

Where: `apps/web/lib/types.ts` — `OpsCoverage.latestResult`, `OpsStatus.estimatedCounts`, `OpsIngest.available`, `OpsStatus.chat`

`latestResult` is the most recent round actually raced, not the last one on the calendar. `estimatedCounts` lists the `rowCounts` keys that are PostgreSQL's `reltuples` statistic rather than an exact `COUNT(*)` (big tables, where a scan is not worth its cost), and the page marks them, because a number that is sometimes exact and sometimes approximate with nothing saying which is worse than either. The frontend and the API deploy separately, so it must tolerate an older API: `ingest.available` is false on a database that predates the `ingest_runs` migration, and `chat` is absent from an API that predates the Race Engineer.

### Pit-stop benchmark is a string of seconds

Where: `apps/web/app/seasons/[year]/races/[round]/page.tsx` — `PitStopsResponse.benchmark`

The pit-stop `benchmark` is the race's quickest pit lane time in seconds, sent as a string and null when there is none. Every time lost figure is measured against it.

### Points-system era strings

Where: `apps/web/app/best-seasons/page.tsx` — `toChartEra`; `apps/web/lib/types.ts` — `PointsSystem.era`

A points system's `era` is a string in one of three shapes: a range such as "1950-1959", a single year such as "1960", or an open-ended "2025-" that runs to the latest ranked season.

### Timing payloads list drivers in finishing order

Where: `pipeline/src/api/routers/races.py` — `get_laps`, `get_gaps`, `_positions_response`; `apps/web/components/races/driver-toggles.tsx` — `useDriverToggles`

The `/laps`, `/gaps` and `/positions` endpoints order their `drivers` array by classified finishing position, with unclassified drivers last. The lap-time, gap and position charts switch on the first few entries of that array by default (`useDriverToggles(drivers, n)`) and do not sort it themselves, so a different order from the API changes which drivers a reader sees first.
