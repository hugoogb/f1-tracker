import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent, CardHeader } from '@/components/ui/card'

export default function HomeLoading() {
  return (
    <div className="space-y-10">
      {/* Hero skeleton */}
      <div className="space-y-3">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-12 w-80" />
        <Skeleton className="h-6 w-96" />
      </div>

      {/* Stat cards skeleton */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Card key={i} className="gap-4 py-5">
            <div className="flex items-start justify-between px-5">
              <div className="space-y-2">
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-8 w-20" />
              </div>
              <Skeleton className="h-9 w-9 rounded-lg" />
            </div>
          </Card>
        ))}
      </div>

      {/* Standings skeleton */}
      <div className="grid gap-6 md:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <Card key={i}>
            <CardHeader className="flex-row items-center justify-between">
              <Skeleton className="h-6 w-40" />
              <Skeleton className="h-4 w-20" />
            </CardHeader>
            <CardContent className="space-y-3">
              {Array.from({ length: 5 }).map((_, j) => (
                <Skeleton key={j} className="h-8 w-full" />
              ))}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Calendar skeleton */}
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-32" />
        </CardHeader>
        <CardContent className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
