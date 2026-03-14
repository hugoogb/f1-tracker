'use client'

import { ErrorBoundary } from '@/components/error-boundary'

export default function RaceDetailError({
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return <ErrorBoundary message="Failed to load race details. Please try again." reset={reset} />
}
