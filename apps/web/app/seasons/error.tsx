'use client'

import { ErrorBoundary } from '@/components/error-boundary'

export default function SeasonsError({
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <ErrorBoundary message="Failed to load the seasons list. Please try again." reset={reset} />
  )
}
