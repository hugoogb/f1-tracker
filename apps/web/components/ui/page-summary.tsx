export function PageSummary({ text }: { text: string | null }) {
  if (!text) return null
  return <p className="text-muted-foreground max-w-3xl leading-relaxed">{text}</p>
}
