'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Building2, MapPin, Star, Trash2, Users } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ConstructorLogo } from '@/components/ui/constructor-logo'
import { CountryFlag } from '@/components/ui/country-flag'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { DriverAvatar } from '@/components/ui/driver-avatar'
import { EmptyState } from '@/components/ui/empty-state'
import { FadeIn } from '@/components/ui/motion'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { FavouriteButton } from '@/components/favourites/favourite-button'
import { useStaleRefresh } from '@/components/favourites/use-stale-refresh'
import {
  MAX_FAVOURITES,
  clearFavourites,
  nameParts,
  useFavourites,
  type Favourite,
  type FavouriteType,
} from '@/lib/favourites'

const SECTIONS: {
  type: FavouriteType
  title: string
  icon: typeof Users
  href: string
  browse: string
  column: string
}[] = [
  {
    type: 'driver',
    title: 'Drivers',
    icon: Users,
    href: '/drivers',
    browse: 'Browse drivers',
    column: 'Nationality',
  },
  {
    type: 'constructor',
    title: 'Constructors',
    icon: Building2,
    href: '/constructors',
    browse: 'Browse constructors',
    column: 'Nationality',
  },
  {
    type: 'circuit',
    title: 'Circuits',
    icon: MapPin,
    href: '/circuits',
    browse: 'Browse circuits',
    column: 'Location',
  },
]

const hrefOf = (favourite: Favourite) => {
  if (favourite.type === 'driver') return `/drivers/${favourite.ref}`
  if (favourite.type === 'constructor') return `/constructors/${favourite.ref}`
  return `/circuits/${favourite.ref}`
}

/**
 * The whole page body, which is entirely client state.
 *
 * The server renders the skeleton below — `loaded` is false in the server
 * snapshot and stays false for the first client render, so the markup matches
 * and nobody with ten favourites is shown "nothing here yet" for a frame.
 */
export function FavouritesView() {
  const { items, loaded } = useFavourites()
  const [confirmOpen, setConfirmOpen] = useState(false)

  useStaleRefresh(items, loaded)

  if (!loaded) return <FavouritesSkeleton />

  if (items.length === 0) {
    return (
      <div className="space-y-6">
        <EmptyState
          icon={Star}
          title="No favourites yet"
          description="Star a driver, constructor or circuit anywhere on the site and it will be collected here, on this device."
        />
        <div className="flex flex-wrap justify-center gap-2">
          {SECTIONS.map((section) => (
            <Link
              key={section.type}
              href={section.href}
              className="glass hover:border-primary/40 hover:text-foreground text-muted-foreground inline-flex h-9 items-center gap-2 rounded-lg border border-[var(--glass-border)] px-4 text-sm font-medium transition-colors"
            >
              <section.icon className="h-3.5 w-3.5" />
              {section.browse}
            </Link>
          ))}
        </div>
      </div>
    )
  }

  const sections = SECTIONS.map((section) => ({
    ...section,
    entries: items
      .filter((item) => item.type === section.type)
      .sort((a, b) => b.addedAt - a.addedAt),
  })).filter((section) => section.entries.length > 0)

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-muted-foreground text-sm">
          {items.length} of {MAX_FAVOURITES} saved in this browser. Nothing leaves this device.
        </p>
        <Button variant="destructive" size="sm" onClick={() => setConfirmOpen(true)}>
          <Trash2 className="h-3.5 w-3.5" />
          Clear all
        </Button>
      </div>

      {sections.map((section) => (
        <FadeIn key={section.type}>
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <section.icon className="text-primary h-4 w-4" />
                {section.title}
                <Badge variant="secondary">{section.entries.length}</Badge>
              </CardTitle>
              <Link
                href={section.href}
                className="text-primary hover:text-primary/80 text-sm font-medium transition-colors"
              >
                {section.browse} &rarr;
              </Link>
            </CardHeader>
            <CardContent>
              <Table aria-label={`Favourite ${section.title.toLowerCase()}`}>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead className="hidden sm:table-cell">{section.column}</TableHead>
                    <TableHead className="w-12 text-right">
                      <span className="sr-only">Favourite</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {section.entries.map((entry) => (
                    <TableRow key={`${entry.type}:${entry.ref}`}>
                      <TableCell>
                        <Link
                          href={hrefOf(entry)}
                          className="hover:text-primary inline-flex items-center gap-2.5 font-medium transition-colors"
                        >
                          <EntityMark entry={entry} />
                          {entry.name}
                        </Link>
                      </TableCell>
                      <TableCell className="text-muted-foreground hidden sm:table-cell">
                        <span className="inline-flex items-center gap-1.5">
                          <CountryFlag code={entry.countryCode} />
                          {entry.detail ?? '—'}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <FavouriteButton
                          type={entry.type}
                          entityRef={entry.ref}
                          name={entry.name}
                          detail={entry.detail}
                          countryCode={entry.countryCode}
                          color={entry.color}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </FadeIn>
      ))}

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Clear all favourites?</DialogTitle>
            <DialogDescription>
              This removes all {items.length} saved entries from this browser. It cannot be undone,
              and favourites are not stored anywhere else.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
            <Button
              variant="destructive"
              onClick={() => {
                clearFavourites()
                setConfirmOpen(false)
              }}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Clear all
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

/** The identity mark for a row: initials on the team colour, or none at all. */
function EntityMark({ entry }: { entry: Favourite }) {
  if (entry.type === 'driver') {
    const { firstName, lastName } = nameParts(entry.name)
    return <DriverAvatar firstName={firstName} lastName={lastName} />
  }
  if (entry.type === 'constructor') {
    return <ConstructorLogo name={entry.name} color={entry.color} />
  }
  return <MapPin className="text-muted-foreground h-4 w-4 shrink-0" />
}

function FavouritesSkeleton() {
  return (
    <div className="space-y-8" aria-hidden="true">
      {[0, 1].map((section) => (
        <Card key={section}>
          <CardHeader>
            <Skeleton className="h-5 w-32" />
          </CardHeader>
          <CardContent className="space-y-3">
            {[0, 1, 2].map((row) => (
              <Skeleton key={row} className="h-10 w-full" />
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
