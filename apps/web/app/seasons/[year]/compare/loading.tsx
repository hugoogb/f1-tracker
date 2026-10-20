import { Skeleton } from '@/components/ui/skeleton'

export default function SeasonCompareLoading() {
  return (
    <div className="space-y-8">
      <Skeleton className="h-4 w-64" />
      <Skeleton className="h-9 w-72" />
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-48 w-full" />
      <Skeleton className="h-96 w-full" />
      <div className="grid gap-6 lg:grid-cols-2">
        <Skeleton className="h-96 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    </div>
  )
}
