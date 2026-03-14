'use client'

import { ErrorBoundary } from '@/components/error-boundary'

export default function CompareError({ reset }: { reset: () => void }) {
  return <ErrorBoundary message="Failed to load comparison." reset={reset} />
}
