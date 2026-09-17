'use client'

import Link from 'next/link'
import { MapPin, Star } from 'lucide-react'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ConstructorLogo } from '@/components/ui/constructor-logo'
import { DriverAvatar } from '@/components/ui/driver-avatar'
import { nameParts, useFavourites, type Favourite } from '@/lib/favourites'

/** Enough to be a shortcut, not so many that the dashboard becomes a list page. */
const PREVIEW_LIMIT = 8

const hrefOf = (favourite: Favourite) => {
  if (favourite.type === 'driver') return `/drivers/${favourite.ref}`
  if (favourite.type === 'constructor') return `/constructors/${favourite.ref}`
  return `/circuits/${favourite.ref}`
}

/**
 * The dashboard's shortcut into the favourites list.
 *
 * It renders from the display data cached with each favourite rather than
 * fetching per entry: the home page is the busiest on the site and a handful of
 * extra round trips per visit — each one a chance to arrive late and reflow the
 * page — buys nothing a name and a colour do not already give. `/favourites`
 * is where that cache gets refreshed.
 *
 * Nothing at all until the store has been read, so the section cannot flash in
 * empty and then fill, and a viewer with no favourites never sees it.
 */
export function FavouritesSummary() {
  const { items, loaded } = useFavourites()

  if (!loaded || items.length === 0) return null

  const preview = [...items].sort((a, b) => b.addedAt - a.addedAt).slice(0, PREVIEW_LIMIT)
  const remaining = items.length - preview.length

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <Star className="h-4 w-4 fill-current text-amber-400" />
          Your Favourites
        </CardTitle>
        <Link
          href="/favourites"
          className="text-primary hover:text-primary/80 text-sm font-medium transition-colors"
        >
          View all &rarr;
        </Link>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-2">
          {preview.map((entry) => (
            <Link
              key={`${entry.type}:${entry.ref}`}
              href={hrefOf(entry)}
              className="glass hover:border-primary/40 inline-flex items-center gap-2 rounded-full border border-[var(--glass-border)] py-1 pr-3 pl-1 text-sm font-medium transition-colors"
            >
              <EntityMark entry={entry} />
              {entry.name}
            </Link>
          ))}
          {remaining > 0 && (
            <Link
              href="/favourites"
              className="text-muted-foreground hover:text-foreground inline-flex items-center rounded-full px-3 py-1 text-sm transition-colors"
            >
              +{remaining} more
            </Link>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function EntityMark({ entry }: { entry: Favourite }) {
  if (entry.type === 'driver') {
    const { firstName, lastName } = nameParts(entry.name)
    return <DriverAvatar firstName={firstName} lastName={lastName} size="sm" />
  }
  if (entry.type === 'constructor') {
    return <ConstructorLogo name={entry.name} color={entry.color} size="sm" />
  }
  return (
    <span className="bg-muted flex size-7 shrink-0 items-center justify-center rounded-full">
      <MapPin className="text-muted-foreground h-3.5 w-3.5" />
    </span>
  )
}
