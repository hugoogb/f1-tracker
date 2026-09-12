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
      <ol className="text-muted-foreground flex items-center gap-1.5 text-xs tracking-wider uppercase">
        {items.map((item, i) => (
          <li key={i} className="flex items-center gap-1.5">
            {i > 0 && <ChevronRight className="text-primary h-3 w-3" />}
            {item.href ? (
              <Link href={item.href} className="hover:text-primary transition-colors">
                {item.label}
              </Link>
            ) : (
              <span className="text-foreground font-medium">{item.label}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  )
}
