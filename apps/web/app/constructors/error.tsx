'use client'

import { ErrorBoundary } from '@/components/error-boundary'

export default function ConstructorsError({
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return <ErrorBoundary message="Failed to load constructors. Please try again." reset={reset} />
}
