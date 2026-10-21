/** How many of a segmented meter's segments a value lights up. */
export function filledSegments(value: number, max: number, segments: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(max) || max <= 0) return 0
  const filled = Math.round((value / max) * segments)
  return Math.min(segments, Math.max(0, filled))
}
