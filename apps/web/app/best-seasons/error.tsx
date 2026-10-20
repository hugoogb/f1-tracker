'use client'

import { ErrorBoundary } from '@/components/error-boundary'

export default function BestSeasonsError({
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <ErrorBoundary message="Failed to load the season rankings. Please try again." reset={reset} />
  )
}
