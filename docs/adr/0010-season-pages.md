# 0010 — Season pages

Season pages, standings, permutations, scoring context, best seasons and the in-season comparison.

### Era re-scoring switches client-side and is framed as a what-if

Where: `apps/web/components/seasons/normalised-standings.tsx` — `NormalisedStandings`

Every era's table is rendered with the season page and switched in the browser, because a query parameter would make the whole season route dynamic for one control. The table answers "who scored most under these rules", not "who would have won", and the note under it says what is not modelled, chiefly the dropped-scores rules behind the pre-1991 official tables.

### Best-seasons columns open in their exciting direction

Where: `apps/web/components/best-seasons/best-seasons-table.tsx` — `COLUMNS`, `first`

Each column carries the direction a first click sorts in. Title margin and deciding round open ascending because a small margin and a late decider are the exciting ends, so the first click shows the best seasons.

### Last race means last round with a result

Where: `apps/web/app/page.tsx` — `lastRaced`

The home page takes the last race as the last calendar round with a winner, not the last round whose date has passed. Between a race and the Monday ingest the clock is ahead of the data, and the podium would be empty.

### Constructor permutations are fetched only for a running season

Where: `apps/web/app/seasons/[year]/page.tsx` — `constructorPermutations`

Only a season still running shows the title-permutations panel, so a finished season does not fetch the constructors' permutations. The fetch would write a cache entry nothing reads.

### Every era is rendered up front on the season page

Where: `apps/web/app/seasons/[year]/page.tsx` — `pointsSystems`, the normalised standings fetch

The season page renders every era's re-scored table up front so switching between eras is instant and the route stays cacheable. A query parameter for the era control would make the whole season page dynamic.

### Season tiles keep a single height

Where: `apps/web/app/seasons/page.tsx` — `SeasonCard`

Every season tile has the same two rows, year then champion, so the grid keeps one row height. The season in progress says so in the row the champion would occupy, and its accent is a border and a dot, which take no space; a badge appended to one card made its row taller than the rest.

### "Still in it" is the strict mathematical test

Where: `apps/web/components/seasons/title-permutations.tsx` — `TitlePermutations`

A contender is out only once every remaining point could not carry them past the leader's current total, which assumes the leader never scores again, so the list is longer than any realistic shortlist. The copy says so rather than implying every name is a live contender.

### A session under way is not the next one

Where: `apps/web/lib/schedule.ts` — `nextSession`

Once a session's start time passes it is running or done, so the countdown moves to the session after it.

### Weekend sessions are ordered by start time

Where: `apps/web/lib/schedule.ts` — `SESSION_ORDER`, `sessionsOf`

`SESSION_ORDER` lists every session f1db can carry, and a sprint weekend's missing sessions are null and skipped. The result is then sorted by start time rather than trusting that order, because the two differ on sprint weekends and a schedule change would otherwise render out of sequence. Sessions are sorted by start time rather than trusted to the canonical order, because the two differ on sprint weekends and a schedule change would otherwise render out of sequence.
