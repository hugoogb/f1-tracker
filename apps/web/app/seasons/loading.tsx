import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardHeader } from '@/components/ui/card'

export default function SeasonsLoading() {
  return (
    <main className="container mx-auto space-y-10 px-4 py-8">
      <div>
        <Skeleton className="h-9 w-32" />
        <Skeleton className="mt-2 h-5 w-72" />
      </div>

      {Array.from({ length: 3 }).map((_, i) => (
        <section key={i}>
          <Skeleton className="mb-4 h-7 w-16" />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {Array.from({ length: 10 }).map((_, j) => (
              <Card key={j}>
                <CardHeader>
                  <Skeleton className="mx-auto h-6 w-12" />
                </CardHeader>
              </Card>
            ))}
          </div>
        </section>
      ))}
    </main>
  )
}
