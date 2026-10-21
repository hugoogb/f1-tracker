import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button-variants'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Page not found',
  // A 404 body served under a real URL should never be indexed.
  robots: { index: false, follow: false },
}

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
      <h1 className="text-primary text-8xl lg:text-9xl">404</h1>
      <div aria-hidden className="bg-primary my-6 h-0.5 w-24" />
      <h2 className="text-muted-foreground mb-2">Page not found</h2>
      <p className="text-muted-foreground mb-6 max-w-sm text-sm">
        The page you&apos;re looking for doesn&apos;t exist or has been moved.
      </p>
      <Link href="/" className={buttonVariants({ size: 'lg' })}>
        Go home
      </Link>
    </div>
  )
}
