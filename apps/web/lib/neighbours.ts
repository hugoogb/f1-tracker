export const FIRST_SEASON = 1950

export interface Neighbours {
  prev: number | null
  next: number | null
}

export function seasonNeighbours(year: number, currentYear: number): Neighbours {
  return {
    prev: year > FIRST_SEASON ? year - 1 : null,
    next: year < currentYear ? year + 1 : null,
  }
}

export function roundNeighbours(round: number, totalRounds: number): Neighbours {
  if (totalRounds <= 0) return { prev: null, next: null }
  return {
    prev: round > 1 ? round - 1 : null,
    next: round < totalRounds ? round + 1 : null,
  }
}
