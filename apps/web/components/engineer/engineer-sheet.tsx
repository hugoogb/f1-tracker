'use client'

import { useEffect, useRef, useState, type FormEvent } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { Send, Square } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { Tag } from '@/components/ui/tag'
import { suggestedPrompts } from '@/lib/engineer-prompts'
import { STATUS_LABELS, type EngineerStatus } from '@/lib/engineer-types'
import { useEngineer } from '@/lib/use-engineer'
import { EngineerTranscript } from './engineer-transcript'

const DISCLOSURE =
  'Your question is sent to Anthropic (Claude) to be answered; nothing you type is stored here.'

function statusLabel(status: EngineerStatus): string {
  return status.kind === 'tool'
    ? `${STATUS_LABELS.tool} ${status.label}`
    : STATUS_LABELS[status.kind]
}

/**
 * The Race Engineer sidebar. Loaded only once the reader first opens it, and
 * kept mounted by the header across navigation, so a link in an answer moves
 * the page underneath without losing the conversation.
 */
export function EngineerSheet({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange(open: boolean): void
}) {
  const router = useRouter()
  const pathname = usePathname()
  const { messages, status, send, stop, reset, feedback, turnsLeft } = useEngineer({
    onNavigate: router.push,
  })
  const [draft, setDraft] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const busy = status.kind === 'streaming' || status.kind === 'tool'
  const exhausted = turnsLeft <= 0
  // Refused for now: a retry would only be refused again (and, for a cooldown,
  // counted against the same window), so the composer waits it out.
  const held = status.kind === 'cooldown' || status.kind === 'budget'

  // Opening is `initialFocus`'s job. The input is disabled while an answer
  // streams, which drops its focus, so hand it back on the busy -> idle edge
  // only, letting the next question follow.
  const wasBusy = useRef(busy)
  useEffect(() => {
    if (wasBusy.current && !busy && open) inputRef.current?.focus()
    wasBusy.current = busy
  }, [open, busy])

  const ask = (question: string) => {
    if (busy || held || exhausted || !question.trim()) return
    setDraft('')
    void send(question)
  }

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    ask(draft)
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        initialFocus={inputRef}
        className="gap-0 p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-md"
      >
        <div className="border-hairline flex items-center gap-3 border-b py-3 pr-12 pl-4">
          <SheetTitle className="display text-2xl tracking-wide uppercase">Engineer</SheetTitle>
          <span role="status" className="ml-auto">
            <Tag variant="outline">{statusLabel(status)}</Tag>
          </span>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {messages.length === 0 ? (
            <div className="space-y-4">
              <p className="text-muted-foreground text-sm leading-relaxed">{DISCLOSURE}</p>
              <div className="flex flex-col gap-2">
                {suggestedPrompts(pathname).map((prompt) => (
                  <Button
                    key={prompt}
                    variant="outline"
                    className="h-auto justify-start py-2 text-left whitespace-normal normal-case"
                    disabled={busy || held}
                    onClick={() => ask(prompt)}
                  >
                    {prompt}
                  </Button>
                ))}
              </div>
            </div>
          ) : (
            <div className="brackets border-hairline bg-surface-0 border p-4">
              <EngineerTranscript messages={messages} status={status} onFeedback={feedback} />
            </div>
          )}
        </div>

        <div className="border-hairline border-t p-4">
          {exhausted ? (
            <div className="flex items-center justify-between gap-3">
              <p className="text-muted-foreground text-xs">This conversation is at its limit.</p>
              <Button variant="outline" size="sm" onClick={reset}>
                New conversation
              </Button>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="flex items-center gap-2">
              <Input
                ref={inputRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Ask the engineer"
                aria-label="Your question"
                disabled={busy}
                autoComplete="off"
              />
              {busy ? (
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label="Stop"
                  onClick={stop}
                >
                  <Square aria-hidden />
                </Button>
              ) : (
                <Button
                  type="submit"
                  size="icon"
                  aria-label="Send"
                  disabled={held || !draft.trim()}
                >
                  <Send aria-hidden />
                </Button>
              )}
            </form>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
