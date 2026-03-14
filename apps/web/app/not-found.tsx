import { MapPin } from 'lucide-react'
import { EmptyState } from '@/components/ui/empty-state'

export default function NotFound() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <EmptyState
        icon={MapPin}
        title="Page not found"
        description="The page you're looking for doesn't exist or has been moved."
        action={{ label: 'Go home', href: '/' }}
      />
    </div>
  )
}
