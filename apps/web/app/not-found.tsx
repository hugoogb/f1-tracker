import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
      <h1 className="text-gradient text-8xl lg:text-9xl">404</h1>
      <div className="accent-line my-6 max-w-xs" />
      <h2 className="text-muted-foreground mb-2">Page not found</h2>
      <p className="text-muted-foreground mb-6 max-w-sm text-sm">
        The page you&apos;re looking for doesn&apos;t exist or has been moved.
      </p>
      <Link
        href="/"
        className="bg-primary hover:bg-primary/90 text-primary-foreground inline-flex h-9 items-center rounded-lg px-4 text-sm font-medium transition-colors"
      >
        Go home
      </Link>
    </div>
  )
}
