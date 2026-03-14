'use client'

import { ErrorBoundary } from '@/components/error-boundary'

export default function SeasonDetailError({
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return <ErrorBoundary message="Failed to load season details. Please try again." reset={reset} />
}
