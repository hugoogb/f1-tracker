import Link from 'next/link'

import { isSameOriginPath, tokenizeAnswer } from '@/lib/engineer-markdown'

/** How an answer's link renders: a site path is a link, anything else stays text. */
export function linkTarget(href: string): 'internal' | 'text' {
  return isSameOriginPath(href) ? 'internal' : 'text'
}

/**
 * The assistant's answer in its tiny markdown subset. Only same-origin paths
 * become links (client-side, so the sheet stays open); an external or scripted
 * URL is shown as its label and never as an `<a>`.
 */
export function EngineerAnswer({ content }: { content: string }) {
  return (
    <p className="text-sm leading-relaxed break-words">
      {tokenizeAnswer(content).map((token, i) => {
        switch (token.type) {
          case 'text':
            return <span key={i}>{token.value}</span>
          case 'bold':
            return (
              <strong key={i} className="text-foreground font-semibold">
                {token.value}
              </strong>
            )
          case 'break':
            return <br key={i} />
          case 'link':
            return linkTarget(token.href) === 'internal' ? (
              <Link
                key={i}
                href={token.href}
                prefetch={false}
                className="text-primary focus-ring underline underline-offset-2 hover:no-underline"
              >
                {token.label}
              </Link>
            ) : (
              <span key={i}>{token.label}</span>
            )
        }
      })}
    </p>
  )
}
