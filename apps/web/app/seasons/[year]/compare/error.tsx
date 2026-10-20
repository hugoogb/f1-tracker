'use client'

import { ErrorBoundary } from '@/components/error-boundary'

export default function SeasonCompareError({
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <ErrorBoundary
      message="Failed to load the season comparison. Please try again."
      reset={reset}
    />
  )
}
