import Link from 'next/link'

import { isSameOriginPath, tokenizeAnswer } from '@/lib/engineer-markdown'
import { cn } from '@/lib/utils'

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
            return isSameOriginPath(token.href) ? (
              <Link
                key={i}
                href={token.href}
                prefetch={false}
                className={cn(
                  'text-primary focus-ring underline underline-offset-2 hover:no-underline',
                  token.bold && 'font-semibold',
                )}
              >
                {token.label}
              </Link>
            ) : (
              <span key={i} className={cn(token.bold && 'text-foreground font-semibold')}>
                {token.label}
              </span>
            )
        }
      })}
    </p>
  )
}
