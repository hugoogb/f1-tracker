'use client'

import { ErrorBoundary } from '@/components/error-boundary'

export default function CircuitDetailError({ reset }: { reset: () => void }) {
  return <ErrorBoundary message="Failed to load circuit details." reset={reset} />
}
