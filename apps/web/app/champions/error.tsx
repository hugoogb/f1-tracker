'use client'

import { ErrorBoundary } from '@/components/error-boundary'

export default function ChampionsError({
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return <ErrorBoundary message="Failed to load champions data. Please try again." reset={reset} />
}
