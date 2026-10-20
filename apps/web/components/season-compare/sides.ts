import { teamColorOf } from '@/lib/utils'
import type { SeasonCompareEntity, SeasonCompareResponse } from '@/lib/types'

export interface SideInfo {
  ref: string
  name: string
  short: string
  color: string
  href: string
}

/** Blend a hex colour towards white; anything that is not `#rrggbb` comes back as is. */
function lighten(hex: string, amount: number): string {
  const match = /^#([0-9a-f]{6})$/i.exec(hex)
  if (!match) return hex
  const value = parseInt(match[1], 16)
  const channel = (shift: number) => {
    const c = (value >> shift) & 0xff
    return Math.round(c + (255 - c) * amount)
      .toString(16)
      .padStart(2, '0')
  }
  return `#${channel(16)}${channel(8)}${channel(0)}`
}

function entityColor(type: SeasonCompareResponse['type'], entity: SeasonCompareEntity): string {
  // Drivers take their team's colour — never one keyed off the driver.
  const color = type === 'drivers' ? entity.constructor?.color : entity.color
  return teamColorOf(color)!
}

/**
 * Both sides' display names and colours.
 *
 * Teammates share a livery, which would make every chart unreadable, so side B
 * gets a lighter tint of the same team colour when the two collide. It is still
 * the team's colour — just the second car's shade of it.
 */
export function describeSides(data: SeasonCompareResponse): [SideInfo, SideInfo] {
  const make = (entity: SeasonCompareEntity): SideInfo =>
    data.type === 'drivers'
      ? {
          ref: entity.ref,
          name: `${entity.firstName} ${entity.lastName}`,
          short: entity.code ?? entity.lastName ?? entity.ref,
          color: entityColor(data.type, entity),
          href: `/drivers/${entity.ref}`,
        }
      : {
          ref: entity.ref,
          name: entity.name ?? entity.ref,
          short: entity.name ?? entity.ref,
          color: entityColor(data.type, entity),
          href: `/constructors/${entity.ref}`,
        }
  const a = make(data.a)
  const b = make(data.b)
  if (a.color.toLowerCase() === b.color.toLowerCase()) b.color = lighten(b.color, 0.45)
  return [a, b]
}

/** Points can be fractional (half points, shared drives); show decimals only then. */
export function formatPoints(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}

export function signed(value: number, digits = 0): string {
  const text = digits ? Math.abs(value).toFixed(digits) : formatPoints(Math.abs(value))
  if (value > 0) return `+${text}`
  if (value < 0) return `−${text}`
  return text
}
