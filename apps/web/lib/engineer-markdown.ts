export type AnswerToken =
  | { type: 'text'; value: string }
  | { type: 'bold'; value: string }
  | { type: 'link'; label: string; href: string; bold?: true }
  | { type: 'break' }

// Sticky: matched at `lastIndex` in the full text, so no per-position copy of the rest.
const LINK = /\[([^\]\n]+)\]\(([^)\s]+)\)/y
const BOLD = /\*\*([^*\n]+)\*\*/y
const SPECIAL = /[[*\n]/g
const LINKS = /\[([^\]\n]+)\]\(([^)\s]+)\)/g

/** A bold run, with any links inside it kept as (bold) links. */
function boldTokens(content: string): AnswerToken[] {
  const out: AnswerToken[] = []
  let at = 0
  for (const m of content.matchAll(LINKS)) {
    if (m.index > at) out.push({ type: 'bold', value: content.slice(at, m.index) })
    out.push({ type: 'link', label: m[1], href: m[2], bold: true })
    at = m.index + m[0].length
  }
  if (at < content.length) out.push({ type: 'bold', value: content.slice(at) })
  return out
}

/**
 * Tokenises the assistant's tiny markdown subset: `[label](href)`, `**bold**`
 * (which may wrap links: those come out as `link` tokens with `bold: true`)
 * and newlines. Anything not yet complete (a link or bold still being streamed)
 * stays plain text, so partial markup never flashes as a broken element.
 */
export function tokenizeAnswer(text: string): AnswerToken[] {
  const tokens: AnswerToken[] = []
  let plain = ''

  const flush = () => {
    if (plain !== '') tokens.push({ type: 'text', value: plain })
    plain = ''
  }

  // Re-run on every streamed delta, so it jumps between the only characters
  // that can start markup instead of walking (and re-slicing) one at a time.
  let i = 0
  while (i < text.length) {
    SPECIAL.lastIndex = i
    const next = SPECIAL.exec(text)
    if (next === null) {
      plain += text.slice(i)
      break
    }
    const at = next.index
    plain += text.slice(i, at)
    const ch = text[at]
    if (ch === '\n') {
      flush()
      tokens.push({ type: 'break' })
      i = at + 1
      continue
    }
    const pattern = ch === '[' ? LINK : BOLD
    pattern.lastIndex = at
    const m = pattern.exec(text)
    if (m) {
      flush()
      if (ch === '[') tokens.push({ type: 'link', label: m[1], href: m[2] })
      else tokens.push(...boldTokens(m[1]))
      i = at + m[0].length
      continue
    }
    plain += ch
    i = at + 1
  }
  flush()
  return tokens
}

const SAFE_PATH = /^\/[A-Za-z0-9_\-./]*(\?[A-Za-z0-9_=&-]*)?$/

/**
 * True only for a plain in-site path; rejects protocol-relative, absolute and
 * scripted URLs, and any `..` segment (the browser would resolve it elsewhere).
 * Mirrors the server's `navigate` allowlist.
 */
export function isSameOriginPath(href: string): boolean {
  if (!SAFE_PATH.test(href) || href.includes('//')) return false
  return !href.split('?', 1)[0].split('/').includes('..')
}
