DEFAULT_PAGE_SIZE = 50
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

# The season comparison's race-pace delta compares each side's median clean lap.
# Below this many clean laps a side's median is one or two laps, not a pace.
SEASON_COMPARE_MIN_CLEAN_LAPS = 5
# The constructors' championship was first awarded in 1958. Constructor standings
# for earlier seasons are sums the ingest computed, not an official table.
FIRST_CONSTRUCTORS_CHAMPIONSHIP = 1958
