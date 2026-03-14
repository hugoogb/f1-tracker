'use client'

import { ErrorBoundary } from '@/components/error-boundary'

export default function ConstructorDetailError({
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <ErrorBoundary message="Failed to load constructor details. Please try again." reset={reset} />
  )
}
