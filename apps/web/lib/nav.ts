/**
 * The site's navigation, shared by the header, the mobile sheet and the
 * footer so the three can never list different places.
 */

export interface NavItem {
  label: string
  href: string
  description: string
}

export interface NavGroup {
  label: string
  href?: string
  items?: readonly NavItem[]
}

export const NAV_GROUPS: readonly NavGroup[] = [
  {
    label: 'Season',
    items: [
      {
        label: 'Current season',
        href: '/seasons/current',
        description: 'Standings, calendar and title fight',
      },
      { label: 'All seasons', href: '/seasons', description: 'Every year since 1950' },
      { label: 'Champions', href: '/champions', description: 'Every title winner' },
      {
        label: 'Best seasons',
        href: '/best-seasons',
        description: 'Title fights ranked by how close they were',
      },
    ],
  },
  { label: 'Drivers', href: '/drivers' },
  { label: 'Teams', href: '/constructors' },
  { label: 'Circuits', href: '/circuits' },
  {
    label: 'Stats',
    items: [
      { label: 'Records', href: '/records', description: 'All-time leaders, by era' },
      { label: 'Compare', href: '/compare', description: 'Any two drivers or teams' },
      {
        label: 'Best seasons',
        href: '/best-seasons',
        description: 'Title fights ranked by how close they were',
      },
    ],
  },
]

/** Whether `href` is the page being viewed, or a section containing it. */
export function isActiveHref(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/'
  if (href === '/seasons/current') return false
  return pathname === href || pathname.startsWith(`${href}/`)
}
