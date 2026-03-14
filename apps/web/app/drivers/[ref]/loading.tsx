import { Skeleton } from '@/components/ui/skeleton'
import { Card } from '@/components/ui/card'

export default function DriverDetailLoading() {
  return (
    <div className="space-y-8">
      <Skeleton className="h-4 w-48" />

      <div className="flex items-center gap-6">
        <Skeleton className="h-16 w-16 shrink-0 rounded-2xl" />
        <div className="space-y-2">
          <Skeleton className="h-9 w-56" />
          <div className="flex items-center gap-2">
            <Skeleton className="h-5 w-20" />
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-5 w-12" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="gap-4 py-5">
            <div className="flex items-start justify-between px-5">
              <div className="space-y-2">
                <Skeleton className="h-4 w-14" />
                <Skeleton className="h-8 w-16" />
              </div>
              <Skeleton className="h-9 w-9 rounded-lg" />
            </div>
          </Card>
        ))}
      </div>

      <div className="space-y-4">
        <Skeleton className="h-7 w-36" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    </div>
  )
}
