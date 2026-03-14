import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent } from '@/components/ui/card'

export default function DriverDetailLoading() {
  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <Skeleton className="h-9 w-56" />
        <div className="flex flex-wrap items-center gap-2">
          <Skeleton className="h-5 w-20" />
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-5 w-12" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="pt-2">
              <Skeleton className="h-9 w-16" />
              <Skeleton className="mt-1 h-4 w-14" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
