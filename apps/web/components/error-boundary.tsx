'use client'

import { AlertTriangle } from 'lucide-react'
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
    <div className="flex min-h-[50vh] flex-col items-center justify-center">
      <div className="glass relative max-w-md rounded-xl px-8 py-10 text-center">
        <div className="bg-primary/20 absolute top-0 left-0 h-full w-1 rounded-l-xl" />
        <div className="text-destructive/60 mb-4">
          <AlertTriangle className="mx-auto h-12 w-12" strokeWidth={1.5} />
        </div>
        <h2 className="mb-2">Something went wrong</h2>
        <p className="text-muted-foreground mb-6 text-sm">{message}</p>
        <Button onClick={reset} variant="outline">
          Try again
        </Button>
      </div>
    </div>
  )
}
