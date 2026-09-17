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
