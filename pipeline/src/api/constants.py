DEFAULT_PAGE_SIZE = 50
# Mirrored by MAX_API_PAGE_SIZE in apps/web/lib/paged-fetch.ts; change both or neither.
MAX_PAGE_SIZE = 200
DEFAULT_RECORD_LIMIT = 10
MAX_RECORD_LIMIT = 50
DEFAULT_PROGRESSION_TOP = 10
MAX_PROGRESSION_TOP = 30
SEARCH_MIN_LENGTH = 2
SEARCH_RESULT_LIMIT = 5

# The records explorer is a paginated table rather than a top-N card, so it
# shows a fuller page by default while keeping MAX_RECORD_LIMIT as the ceiling.
DEFAULT_EXPLORE_LIMIT = 25
# A driver with one start and one win is not the best win rate in history. The
# rate categories therefore carry a denominator floor unless the caller sets
# their own; it is never allowed to reach zero.
DEFAULT_EXPLORE_MIN_STARTS = 20

# A lap slower than this much of the race's median is not a representative
# green-flag lap: it is a pit stop, a safety car, or traffic. Tyre degradation
# and the season comparison's race pace both drop them. Mirrored in
# apps/web/lib/lap-distribution.ts; change both or neither.
CLEAN_LAP_THRESHOLD = 1.07
# The season comparison's race-pace delta compares each side's median clean lap.
# Below this many clean laps a side's median is one or two laps, not a pace.
# Mirrored in apps/web/lib/lap-distribution.ts; change both or neither.
SEASON_COMPARE_MIN_CLEAN_LAPS = 5
# The constructors' championship was first awarded in 1958. Constructor standings
# for earlier seasons are sums the ingest computed, not an official table.
FIRST_CONSTRUCTORS_CHAMPIONSHIP = 1958
