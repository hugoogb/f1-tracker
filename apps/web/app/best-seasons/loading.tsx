import { Skeleton } from '@/components/ui/skeleton'

export default function BestSeasonsLoading() {
  return (
    <div className="space-y-8">
      <div>
        <Skeleton className="h-9 w-48" />
        <Skeleton className="mt-2 h-5 w-96 max-w-full" />
      </div>
      <div className="grid items-end gap-4 md:grid-cols-3">
        <Skeleton className="h-72 w-full" />
        <Skeleton className="h-80 w-full" />
        <Skeleton className="h-72 w-full" />
      </div>
      <Skeleton className="h-80 w-full" />
      <Skeleton className="h-96 w-full" />
    </div>
  )
}
