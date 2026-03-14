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
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 text-center">
      <div className="text-muted-foreground/40">
        <AlertTriangle className="h-16 w-16" strokeWidth={1} />
      </div>
      <h2 className="text-xl font-semibold">Something went wrong</h2>
      <p className="text-muted-foreground max-w-sm text-sm">{message}</p>
      <Button onClick={reset} variant="outline">
        Try again
      </Button>
    </div>
  )
}
