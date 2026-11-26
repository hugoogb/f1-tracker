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
  entityRef: string
  name: string
  detail?: string | null
  countryCode?: string | null
  color?: string | null
  size?: 'icon-xs' | 'icon-sm' | 'icon'
  className?: string
}

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
      className={cn('text-muted-foreground hover:text-gold', favourited && 'text-gold', className)}
    >
      <Star className={cn('transition-colors', favourited && 'fill-current')} aria-hidden="true" />
    </Button>
  )
}
