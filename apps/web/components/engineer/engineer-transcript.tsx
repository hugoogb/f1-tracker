'use client'

import { useEffect, useRef } from 'react'
import { ThumbsDown, ThumbsUp } from 'lucide-react'

import { buttonVariants } from '@/components/ui/button-variants'
import type { EngineerMessage, EngineerStatus } from '@/lib/engineer-types'
import { cn } from '@/lib/utils'
import { EngineerAnswer } from './engineer-answer'

const NOTICES: Partial<Record<EngineerStatus['kind'], string>> = {
  budget: 'The engineer is off the radio for today. Try again tomorrow.',
  cooldown: 'Too many questions in a row. Give it a few minutes and ask again.',
}

/** The conversation, newest at the bottom, kept scrolled to the end as it streams. */
export function EngineerTranscript({
  messages,
  status,
  onFeedback,
}: {
  messages: EngineerMessage[]
  status: EngineerStatus
  onFeedback(messageId: string, thumbs: 1 | -1): void
}) {
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [messages, status])

  const notice = status.kind === 'error' ? status.message : NOTICES[status.kind]

  return (
    <div className="space-y-4">
      {messages.map((message) =>
        message.role === 'user' ? (
          <div key={message.id} className="flex justify-end">
            <p className="slab font-data max-w-[85%] py-1.5 pr-4 pl-3 text-sm font-semibold break-words">
              {message.content}
            </p>
          </div>
        ) : (
          <div key={message.id} className="space-y-1.5">
            {message.notice ? (
              <p className="text-muted-foreground font-data text-xs">{message.content}</p>
            ) : (
              <EngineerAnswer content={message.content} />
            )}
            {message.ledgerId && (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  aria-label="Good answer"
                  aria-pressed={message.thumbs === 1}
                  onClick={() => onFeedback(message.id, 1)}
                  className={cn(
                    buttonVariants({ variant: 'ghost', size: 'icon-xs' }),
                    message.thumbs === 1 && 'text-positive',
                  )}
                >
                  <ThumbsUp aria-hidden />
                </button>
                <button
                  type="button"
                  aria-label="Bad answer"
                  aria-pressed={message.thumbs === -1}
                  onClick={() => onFeedback(message.id, -1)}
                  className={cn(
                    buttonVariants({ variant: 'ghost', size: 'icon-xs' }),
                    message.thumbs === -1 && 'text-negative',
                  )}
                >
                  <ThumbsDown aria-hidden />
                </button>
              </div>
            )}
          </div>
        ),
      )}
      {notice && (
        <p role="status" className="text-muted-foreground font-data text-xs">
          {notice}
        </p>
      )}
      <div ref={endRef} />
    </div>
  )
}
