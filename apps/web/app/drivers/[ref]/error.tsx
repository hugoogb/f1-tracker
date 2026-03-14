'use client'

import { ErrorBoundary } from '@/components/error-boundary'

export default function DriverDetailError({
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return <ErrorBoundary message="Failed to load driver details. Please try again." reset={reset} />
}
