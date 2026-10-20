import type { BestSeason } from '@/lib/types'

/** Official points can be fractional (half-points races, shared drives). */
export function formatPoints(points: number | null | undefined): string {
  if (points === null || points === undefined) return '—'
  return Number.isInteger(points)
    ? String(points)
    : points.toFixed(points * 10 === Math.round(points * 10) ? 1 : 2)
}

export function formatShare(share: number | null | undefined): string {
  if (share === null || share === undefined) return '—'
  return `${(share * 100).toFixed(1)}%`
}

/** "Final round", or "R17 of 22" for a title settled with rounds to spare. */
export function deciderLabel(season: BestSeason): string {
  if (season.decidedAtRound === null) return '—'
  if (season.wentToFinalRound) return 'Final round'
  return `R${season.decidedAtRound} of ${season.totalRounds}`
}

export function deciderSentence(season: BestSeason): string {
  if (season.decidedAtRound === null) return 'Still being decided'
  if (season.wentToFinalRound) return 'Went to the final round'
  const left = season.decidedRoundsFromEnd ?? 0
  return `Settled with ${left} round${left === 1 ? '' : 's'} to spare`
}
