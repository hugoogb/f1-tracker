import { sideColor } from '@/lib/chart-theme'
import { formatPoints, teamColorOf } from '@/lib/utils'
import type { SeasonCompareEntity, SeasonCompareResponse } from '@/lib/types'

export interface SideInfo {
  ref: string
  name: string
  short: string
  color: string
  href: string
}

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

function entityColor(
  type: SeasonCompareResponse['type'],
  entity: SeasonCompareEntity,
  side: 'a' | 'b',
): string {
  const color = type === 'drivers' ? entity.constructor?.color : entity.color
  return teamColorOf(color, null) ?? sideColor(side)
}

export function describeSides(data: SeasonCompareResponse): [SideInfo, SideInfo] {
  const make = (entity: SeasonCompareEntity, side: 'a' | 'b'): SideInfo =>
    data.type === 'drivers'
      ? {
          ref: entity.ref,
          name: `${entity.firstName} ${entity.lastName}`,
          short: entity.code ?? entity.lastName ?? entity.ref,
          color: entityColor(data.type, entity, side),
          href: `/drivers/${entity.ref}`,
        }
      : {
          ref: entity.ref,
          name: entity.name ?? entity.ref,
          short: entity.name ?? entity.ref,
          color: entityColor(data.type, entity, side),
          href: `/constructors/${entity.ref}`,
        }
  const a = make(data.a, 'a')
  const b = make(data.b, 'b')
  if (a.color.toLowerCase() === b.color.toLowerCase()) b.color = lighten(b.color, 0.45)
  return [a, b]
}

export function signed(value: number, digits = 0): string {
  const text = digits ? Math.abs(value).toFixed(digits) : formatPoints(Math.abs(value))
  if (value > 0) return `+${text}`
  if (value < 0) return `−${text}`
  return text
}
