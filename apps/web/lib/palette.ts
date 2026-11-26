export type PaletteGroupKey =
  | 'pages'
  | 'seasons'
  | 'races'
  | 'drivers'
  | 'constructors'
  | 'circuits'

const YEAR = /(?<!\d)(19|20)\d\d(?!\d)/

export function paletteGroupOrder(query: string, pageTitlePrefix: boolean): PaletteGroupKey[] {
  const people: PaletteGroupKey[] = ['drivers', 'constructors', 'circuits']
  const order: PaletteGroupKey[] = YEAR.test(query)
    ? ['seasons', 'races', ...people]
    : [...people, 'seasons', 'races']
  return pageTitlePrefix ? ['pages', ...order] : [...order, 'pages']
}

export function isCurrentFor(query: string, state: { forQuery: string | null }): boolean {
  return state.forQuery === query
}
