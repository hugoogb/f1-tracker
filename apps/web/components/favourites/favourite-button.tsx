'use client'

import { useEffect } from 'react'
import { Star } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  MAX_FAVOURITES,
  refreshFavourite,
  toggleFavourite,
  useIsFavourite,
  type FavouriteType,
} from '@/lib/favourites'

interface FavouriteButtonProps {
  type: FavouriteType
  /**
   * The f1db ref. Named `entityRef` rather than `ref`, which React reserves.
   */
  entityRef: string
  /** Full display name — also the accessible name of the toggle. */
  name: string
  detail?: string | null
  countryCode?: string | null
  /** Constructor livery from the API payload. Ignored for other types. */
  color?: string | null
  size?: 'icon-xs' | 'icon-sm' | 'icon'
  className?: string
}

/**
 * Star toggle for a driver, constructor or circuit.
 *
 * Icon-only, so the accessible name has to carry both the action and which
 * entity it applies to, and `aria-pressed` carries the state. The star glyph is
 * rendered in both states — only its fill and colour change — so the swap from
 * the server's "not favourited" to the stored answer cannot shift the layout.
 */
export function FavouriteButton({
  type,
  entityRef,
  name,
  detail = null,
  countryCode = null,
  color = null,
  size = 'icon-sm',
  className,
}: FavouriteButtonProps) {
  const favourited = useIsFavourite(type, entityRef)

  // Whatever rendered this button has fresh data for the entity, so it is the
  // cheapest place to keep the cached display data honest — no extra request.
  // A no-op unless the entity is already favourited, and it writes nothing when
  // the fields match, so it cannot feed itself.
  useEffect(() => {
    refreshFavourite({ type, ref: entityRef, name, detail, countryCode, color })
  }, [type, entityRef, name, detail, countryCode, color])

  const action = favourited ? 'Remove' : 'Add'
  const label = `${action} ${name} ${favourited ? 'from' : 'to'} favourites`

  function onToggle() {
    const result = toggleFavourite({ type, ref: entityRef, name, detail, countryCode, color })
    if (result === 'full') {
      toast.error(`Favourites are full (${MAX_FAVOURITES}).`, {
        description: 'Remove one before adding another.',
      })
    }
  }

  return (
    <Button
      variant="ghost"
      size={size}
      aria-pressed={favourited}
      aria-label={label}
      title={label}
      onClick={onToggle}
      className={cn(
        'text-muted-foreground hover:text-amber-400',
        favourited && 'text-amber-400',
        className,
      )}
    >
      <Star className={cn('transition-colors', favourited && 'fill-current')} aria-hidden="true" />
    </Button>
  )
}
