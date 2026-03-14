'use client'

import { ErrorBoundary } from '@/components/error-boundary'

export default function RootError({
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return <ErrorBoundary reset={reset} />
}
