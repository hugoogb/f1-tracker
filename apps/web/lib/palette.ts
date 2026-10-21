/** Ordering and freshness rules for the command palette's results. */

export type PaletteGroupKey =
  | 'pages'
  | 'seasons'
  | 'races'
  | 'drivers'
  | 'constructors'
  | 'circuits'

const YEAR = /(?<!\d)(19|20)\d\d(?!\d)/

/**
 * The order the result groups appear in, so Enter on the first option opens
 * what was most likely meant. A typed year means a season or race. A page
 * only leads when its title starts with the query ("rec" → Records); a
 * keyword match ("ver" → Compare, via "versus") must not sit above Verstappen.
 */
export function paletteGroupOrder(query: string, pageTitlePrefix: boolean): PaletteGroupKey[] {
  const people: PaletteGroupKey[] = ['drivers', 'constructors', 'circuits']
  const order: PaletteGroupKey[] = YEAR.test(query)
    ? ['seasons', 'races', ...people]
    : [...people, 'seasons', 'races']
  return pageTitlePrefix ? ['pages', ...order] : [...order, 'pages']
}

/**
 * Whether search results answer the query now in the box. While the debounce
 * and the request are in flight the previous query's results are still held;
 * offering them would let Enter open a result for text no longer typed.
 */
export function isCurrentFor(query: string, state: { forQuery: string | null }): boolean {
  return state.forQuery === query
}
