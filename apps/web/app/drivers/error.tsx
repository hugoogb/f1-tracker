'use client'

import { ErrorBoundary } from '@/components/error-boundary'

export default function DriversError({
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return <ErrorBoundary message="Failed to load drivers. Please try again." reset={reset} />
}
