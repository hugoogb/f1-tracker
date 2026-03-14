'use client'

import { ErrorBoundary } from '@/components/error-boundary'

export default function CompareDriversError({ reset }: { reset: () => void }) {
  return <ErrorBoundary message="Failed to load driver comparison." reset={reset} />
}
