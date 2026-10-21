/** Every page someone might search for by name, for the command palette. */
export const SITE_PAGES = [
  { title: 'Home', href: '/', keywords: ['dashboard', 'next race', 'countdown'] },
  { title: 'Seasons', href: '/seasons', keywords: ['years', 'calendar', 'archive'] },
  { title: 'Drivers', href: '/drivers', keywords: ['racers', 'pilots'] },
  { title: 'Constructors', href: '/constructors', keywords: ['teams'] },
  { title: 'Circuits', href: '/circuits', keywords: ['tracks', 'venues', 'map'] },
  { title: 'Champions', href: '/champions', keywords: ['titles', 'world champions'] },
  {
    title: 'Records',
    href: '/records',
    keywords: ['most wins', 'poles', 'podiums', 'all-time', 'stats'],
  },
  {
    title: 'Best seasons',
    href: '/best-seasons',
    keywords: ['closest title fight', 'competitive', 'ranking'],
  },
  { title: 'Compare', href: '/compare', keywords: ['head to head', 'versus', 'vs'] },
  { title: 'Compare drivers', href: '/compare/drivers', keywords: ['head to head', 'versus'] },
  {
    title: 'Compare constructors',
    href: '/compare/constructors',
    keywords: ['teams', 'head to head', 'versus'],
  },
  { title: 'Favourites', href: '/favourites', keywords: ['starred', 'saved'] },
  { title: 'Data status', href: '/status', keywords: ['freshness', 'ingest', 'coverage'] },
  { title: 'Attributions', href: '/attributions', keywords: ['credits', 'licences', 'sources'] },
] as const

export type SitePage = (typeof SITE_PAGES)[number]

/** Pages whose title or a keyword contains the query; title-prefix matches first. */
export function searchPages(query: string, limit = 5): SitePage[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const score = (page: SitePage): number => {
    const title = page.title.toLowerCase()
    if (title.startsWith(q)) return 0
    if (title.includes(q)) return 1
    if (page.keywords.some((k) => k.includes(q))) return 2
    return -1
  }
  return SITE_PAGES.map((page) => ({ page, s: score(page) }))
    .filter(({ s }) => s >= 0)
    .sort((a, b) => a.s - b.s)
    .slice(0, limit)
    .map(({ page }) => page)
}
