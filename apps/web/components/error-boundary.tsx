'use client'

import { Button } from '@/components/ui/button'

interface ErrorBoundaryProps {
  message?: string
  reset: () => void
}

export function ErrorBoundary({
  message = 'Something went wrong while loading this page.',
  reset,
}: ErrorBoundaryProps) {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4">
      <h2 className="text-2xl font-bold tracking-tight">Error</h2>
      <p className="text-muted-foreground">{message}</p>
      <Button onClick={reset}>Try again</Button>
    </div>
  )
}
