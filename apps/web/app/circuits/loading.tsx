import { Skeleton } from '@/components/ui/skeleton'

export default function CircuitsLoading() {
  return (
    <div className="space-y-6">
      <div>
        <Skeleton className="h-9 w-32" />
        <Skeleton className="mt-2 h-5 w-48" />
      </div>
      <Skeleton className="h-[400px] w-full rounded-xl md:h-[500px]" />
      <div className="space-y-3">
        <Skeleton className="h-10 w-full" />
        {Array.from({ length: 15 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    </div>
  )
}
