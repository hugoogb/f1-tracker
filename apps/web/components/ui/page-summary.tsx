/**
 * A page's plain-language summary (`lib/page-summary.ts`), directly under its
 * hero: what the tables below say, in the sentence a reader or a search engine
 * can quote. A server component, so it is in the HTML with nothing to hydrate.
 */
export function PageSummary({ text }: { text: string | null }) {
  if (!text) return null
  return <p className="text-muted-foreground max-w-3xl leading-relaxed">{text}</p>
}
