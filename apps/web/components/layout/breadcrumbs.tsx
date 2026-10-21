import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { JsonLd } from '@/components/seo/json-ld'
import { breadcrumbSchema } from '@/lib/structured-data'

interface BreadcrumbItem {
  label: string
  href?: string
}

export function Breadcrumbs({ items }: { items: BreadcrumbItem[] }) {
  return (
    <nav aria-label="Breadcrumb" className="mb-4">
      {/* Mirrors the visible trail, which is what Google requires of a
          BreadcrumbList — emitting it here covers every page that uses it. */}
      <JsonLd data={breadcrumbSchema(items)} />
      <ol className="label flex flex-wrap items-center gap-1.5">
        {items.map((item, i) => (
          <li key={i} className="flex items-center gap-1.5">
            {i > 0 && <ChevronRight className="text-primary size-3" aria-hidden />}
            {item.href ? (
              <Link href={item.href} className="hover:text-foreground focus-ring transition-colors">
                {item.label}
              </Link>
            ) : (
              <span aria-current="page" className="text-foreground">
                {item.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  )
}
