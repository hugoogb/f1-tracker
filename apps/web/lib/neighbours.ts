/** The first season of the world championship. */
export const FIRST_SEASON = 1950

export interface Neighbours {
  prev: number | null
  next: number | null
}

/**
 * The seasons either side of `year` that have a page. Bounded by the current
 * calendar year rather than the season list: a per-season page may not read
 * the `f1-global` list (cache tags), and next year's calendar can be published
 * before it starts. The output only changes on 1 January.
 */
export function seasonNeighbours(year: number, currentYear: number): Neighbours {
  return {
    prev: year > FIRST_SEASON ? year - 1 : null,
    next: year < currentYear ? year + 1 : null,
  }
}

/** The rounds either side of `round` in a season of `totalRounds`. */
export function roundNeighbours(round: number, totalRounds: number): Neighbours {
  if (totalRounds <= 0) return { prev: null, next: null }
  return {
    prev: round > 1 ? round - 1 : null,
    next: round < totalRounds ? round + 1 : null,
  }
}
