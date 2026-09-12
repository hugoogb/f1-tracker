'use client'

import { ErrorBoundary } from '@/components/error-boundary'

export default function CompareConstructorsError({
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <ErrorBoundary
      message="Failed to load the constructor comparison. Please try again."
      reset={reset}
    />
  )
}
