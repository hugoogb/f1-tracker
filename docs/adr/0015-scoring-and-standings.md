# 0015 — Scoring and standings

Points systems, standings storage, permutations and the best-seasons score.

### Best-season score weights sum to 100

Where: `pipeline/src/api/routers/best_seasons.py` — `COMPONENTS`

Component weights sum to 100, so a component's points are weight times a 0-1 value and the total is already on a 0-100 scale.

### Dropped-score tolerance is a rounding allowance

Where: `pipeline/src/api/routers/seasons.py` — dropped points check (also `pipeline/src/chat/tools/seasons.py`)

Points totals can be fractional (half points, shared drives) and never land exactly, so a difference below a small tolerance is rounding, not a dropped score. The chat tool mirrors the season router's tolerance: a tiny difference is rounding, not a dropped score.

### Normalised standings only score sprints the system has

Where: `pipeline/src/api/routers/standings.py` — normalised standings

Sprints exist from 2021 and score only if the chosen system has a sprint scale; scoring a 2023 sprint under 1961's rules would invent a race that system never had.

### Re-scored ties use countback on wins then podiums

Where: `pipeline/src/api/routers/standings.py` — normalised standings

Ties are broken by wins then podiums, the sport's own tie-break and the only one that can be applied to a re-scored table without inventing a rule.

### Banked points re-rank only where totals differ

Where: `pipeline/src/api/routers/standings.py` — permutations

The table is re-ranked only on banked points; the official order, which already applies the countback, stands wherever totals are level.

### Clinch scenario for the leader

Where: `pipeline/src/api/routers/standings.py` — permutations

The leader's clinch scenario is the maximum at the next round with every rival scoring nothing there (always possible, points stop at tenth), and still being out of reach of everything left afterwards. This is the scenario broadcasts mean by 'he can win it next time out': leader takes the maximum next round, no rival scores, and even all remaining points cannot catch him.

### Sprint scoring has its own history

Where: `pipeline/src/scoring.py` — sprint scales

The sprint scale is independent of the race-points era: 2021 paid only the top three and 2022 widened it to eight.

### Remaining sprints come from the f1db schedule

Where: `pipeline/src/api/routers/standings.py` — `_permutations` (`sprint_pending`, `sprint_schedule_known`)

A remaining round counts as a sprint weekend only when f1db schedules a sprint race for it (`sprint_race_at`), and only until that sprint has results. A 2021+ season with no schedule at all reports `sprintScheduleKnown: false` rather than guessing a sprint count, because a guessed number would move the maximum-points arithmetic.

### The clinch check removes the double-points bonus unless the next race is the finale

Where: `pipeline/src/api/routers/standings.py` — `_permutations` (`max_next`); `pipeline/src/scoring.py` — `max_points_remaining`

`max_points_remaining` adds the double-points round whenever any race remains in a season in `DOUBLE_POINTS_FINALES`, assuming the finale is among the races left. The next-round maximum asks for one race, so it would always include that bonus. When more than one race remains the next race is not the finale, so one `max_per_round` is taken back off; when only one race remains, that race is the finale and keeps the bonus.

### A season's standings are deleted before they are rebuilt

Where: `pipeline/src/ingestion/standings.py` — `StandingsIngestor.ingest`

Every standings row in the season is deleted before the final table and the per-round tables are written again. Merging alone would leave stale rows. Mid-season, last week's final round becomes an earlier round, and the locally summed rows it held (including drivers on zero points, whom f1db does not list) would survive next to the official table. That breaks the rule that per-round rows are official or absent.
