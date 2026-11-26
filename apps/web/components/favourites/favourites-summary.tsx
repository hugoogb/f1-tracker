'use client'

import Link from 'next/link'
import { MapPin, Star } from 'lucide-react'

import { Panel, PanelAction, PanelContent, PanelHeader, PanelTitle } from '@/components/ui/panel'
import { ConstructorLogo } from '@/components/ui/constructor-logo'
import { DriverAvatar } from '@/components/ui/driver-avatar'
import { favouriteHref, nameParts, useFavourites, type Favourite } from '@/lib/favourites'

const PREVIEW_LIMIT = 8

export function FavouritesSummary() {
  const { items, loaded } = useFavourites()

  if (!loaded || items.length === 0) return null

  const preview = [...items].sort((a, b) => b.addedAt - a.addedAt).slice(0, PREVIEW_LIMIT)
  const remaining = items.length - preview.length

  return (
    <Panel>
      <PanelHeader>
        <PanelTitle className="flex items-center gap-2">
          <Star className="text-gold size-4 fill-current" aria-hidden />
          Your favourites
        </PanelTitle>
        <PanelAction>
          <Link
            href="/favourites"
            className="font-data text-primary hover:text-foreground focus-ring text-xs font-semibold tracking-wider uppercase"
          >
            View all
          </Link>
        </PanelAction>
      </PanelHeader>
      <PanelContent>
        <div className="flex flex-wrap gap-2">
          {preview.map((entry) => (
            <Link
              key={`${entry.type}:${entry.ref}`}
              href={favouriteHref(entry)}
              className="bg-surface-2 border-hairline hover:border-primary focus-ring inline-flex items-center gap-2 border py-1 pr-3 pl-1 text-sm font-medium transition-colors"
            >
              <EntityMark entry={entry} />
              {entry.name}
            </Link>
          ))}
          {remaining > 0 && (
            <Link
              href="/favourites"
              className="text-muted-foreground hover:text-foreground focus-ring inline-flex items-center px-3 py-1 text-sm transition-colors"
            >
              +{remaining} more
            </Link>
          )}
        </div>
      </PanelContent>
    </Panel>
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
    <span className="bg-surface-3 flex size-7 shrink-0 items-center justify-center">
      <MapPin className="text-muted-foreground h-3.5 w-3.5" />
    </span>
  )
}
