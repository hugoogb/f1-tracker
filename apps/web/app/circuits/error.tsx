'use client'

import { ErrorBoundary } from '@/components/error-boundary'

export default function CircuitsError({ reset }: { reset: () => void }) {
  return <ErrorBoundary message="Failed to load circuits." reset={reset} />
}
