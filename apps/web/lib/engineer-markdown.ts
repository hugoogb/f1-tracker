export type AnswerToken =
  | { type: 'text'; value: string }
  | { type: 'bold'; value: string }
  | { type: 'link'; label: string; href: string }
  | { type: 'break' }

const LINK = /^\[([^\]\n]+)\]\(([^)\s]+)\)/
const BOLD = /^\*\*([^*\n]+)\*\*/

/**
 * Tokenises the assistant's tiny markdown subset: `[label](href)`, `**bold**`
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

  let i = 0
  while (i < text.length) {
    const ch = text[i]
    if (ch === '\n') {
      flush()
      tokens.push({ type: 'break' })
      i += 1
      continue
    }
    if (ch === '[') {
      const m = LINK.exec(text.slice(i))
      if (m) {
        flush()
        tokens.push({ type: 'link', label: m[1], href: m[2] })
        i += m[0].length
        continue
      }
    } else if (ch === '*') {
      const m = BOLD.exec(text.slice(i))
      if (m) {
        flush()
        tokens.push({ type: 'bold', value: m[1] })
        i += m[0].length
        continue
      }
    }
    plain += ch
    i += 1
  }
  flush()
  return tokens
}

const SAFE_PATH = /^\/[A-Za-z0-9_\-./]*(\?[A-Za-z0-9_=&-]*)?$/

/** True only for a plain in-site path; rejects protocol-relative, absolute and scripted URLs. */
export function isSameOriginPath(href: string): boolean {
  return SAFE_PATH.test(href) && !href.includes('//')
}
