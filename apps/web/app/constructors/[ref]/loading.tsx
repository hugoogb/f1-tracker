import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent } from '@/components/ui/card'

export default function ConstructorDetailLoading() {
  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <Skeleton className="size-5 rounded-full" />
          <Skeleton className="h-9 w-48" />
        </div>
        <Skeleton className="h-5 w-20" />
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
