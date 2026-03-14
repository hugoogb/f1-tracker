import { Skeleton } from '@/components/ui/skeleton'

export default function DriversLoading() {
  return (
    <div className="space-y-6">
      <div>
        <Skeleton className="h-9 w-28" />
        <Skeleton className="mt-2 h-5 w-52" />
      </div>

      <div className="space-y-3">
        <Skeleton className="h-8 w-full" />
        {Array.from({ length: 15 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    </div>
  )
}
