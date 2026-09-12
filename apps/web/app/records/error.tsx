'use client'

import { ErrorBoundary } from '@/components/error-boundary'

export default function RecordsError({
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <ErrorBoundary message="Failed to load all-time records. Please try again." reset={reset} />
  )
}
