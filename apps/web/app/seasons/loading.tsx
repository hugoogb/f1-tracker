import { Skeleton } from '@/components/ui/skeleton'
import { Panel, PanelHeader } from '@/components/ui/panel'

export default function SeasonsLoading() {
  return (
    <div className="space-y-10">
      <div>
        <Skeleton className="h-9 w-32" />
        <Skeleton className="mt-2 h-5 w-72" />
      </div>

      {Array.from({ length: 3 }).map((_, i) => (
        <section key={i}>
          <Skeleton className="mb-4 h-7 w-16" />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {Array.from({ length: 10 }).map((_, j) => (
              <Panel key={j}>
                <PanelHeader>
                  <Skeleton className="mx-auto h-6 w-12" />
                </PanelHeader>
              </Panel>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
