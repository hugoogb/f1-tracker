/**
 * Renders a schema.org graph as JSON-LD. Google prefers JSON-LD over
 * microdata, and a script tag keeps the structured data out of the visible
 * markup entirely.
 */
export function JsonLd({ data }: { data: Record<string, unknown> | Record<string, unknown>[] }) {
  return (
    <script
      type="application/ld+json"
      // The payload is built from our own API data, never user input, and
      // JSON.stringify escapes the quoting that would break out of the tag.
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(data).replace(/</g, '\\u003c'),
      }}
    />
  )
}
