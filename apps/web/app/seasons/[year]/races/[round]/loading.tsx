import { Skeleton } from '@/components/ui/skeleton'

export default function RaceDetailLoading() {
  return (
    <main className="container mx-auto space-y-6 px-4 py-8">
      <div>
        <Skeleton className="h-9 w-64" />
        <Skeleton className="mt-2 h-5 w-80" />
        <Skeleton className="mt-1 h-4 w-48" />
      </div>

      <div className="space-y-4">
        <div className="flex gap-2">
          <Skeleton className="h-9 w-28" />
          <Skeleton className="h-9 w-24" />
        </div>

        <div className="space-y-3">
          <Skeleton className="h-8 w-full" />
          {Array.from({ length: 10 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      </div>
    </main>
  )
}
