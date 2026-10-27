import { useCallback, useEffect, useReducer, useRef } from 'react'
import { API_BASE_URL } from '@/lib/constants'
import { createSseParser } from '@/lib/engineer-sse'
import { isSameOriginPath } from '@/lib/engineer-markdown'
import type { EngineerEvent, EngineerMessage, EngineerStatus } from '@/lib/engineer-types'

export const STORAGE_KEY = 'f1-engineer:v1'
export const MAX_USER_TURNS = 20
export const HISTORY_TURNS = 16
export const MAX_CONTENT_CHARS = 2000
export const MAX_TITLE_CHARS = 200
export const MAX_PATH_CHARS = 200
export const EMPTY_ANSWER = 'The Engineer had nothing to add.'
export const DISABLED_MESSAGE = 'The Engineer is not on the radio right now.'
/**
 * How long a 429 holds the composer: the server's per-IP window (`RATE_WINDOW`
 * in `pipeline/src/chat/gates.py`). Every refused request is a ledger row that
 * counts against that window, so letting the reader retry sooner would only
 * extend their own lockout.
 */
export const COOLDOWN_MS = 10 * 60 * 1000

/**
 * The page path sent as context. The server accepts only a plain site path
 * (no percent-encoding, `~`, `+`, ...), so anything else is sent as `/` rather
 * than turning every question on that page into a 422.
 */
export function pagePath(pathname: string): string {
  return pathname.length <= MAX_PATH_CHARS && isSameOriginPath(pathname) ? pathname : '/'
}

/** A refused request's status, from the HTTP code and the body's `detail.code`. */
export function refusalStatus(status: number, code: string | null): EngineerStatus {
  if (code === 'disabled') return { kind: 'error', message: DISABLED_MESSAGE }
  if (code === 'budget') return { kind: 'budget' }
  if (code === 'rate_limited' || status === 429) return { kind: 'cooldown' }
  return { kind: 'error', message: `Request failed (${status})` }
}

/** The server's bounds: each entry stripped, 1..2000 chars, the last one a user turn. */
export function outgoingMessages(
  messages: Pick<EngineerMessage, 'role' | 'content' | 'notice'>[],
): { role: 'user' | 'assistant'; content: string }[] {
  return messages
    .filter((m) => !m.notice)
    .map(({ role, content }) => ({
      role,
      content: content.trim().slice(0, MAX_CONTENT_CHARS).trim(),
    }))
    .filter((m) => m.content !== '')
    .slice(-HISTORY_TURNS)
}

export interface EngineerState {
  messages: EngineerMessage[]
  status: EngineerStatus
  turnsLeft: number
  /** The assistant message the current stream is writing; null until its first text. */
  answerId: string | null
}

export type EngineerAction =
  | { type: 'user'; content: string }
  | { type: 'event'; event: EngineerEvent }
  | { type: 'http'; status: number; code: string | null }
  | { type: 'reset' }
  | { type: 'idle' }
  | { type: 'release' }
  | { type: 'restore'; messages: EngineerMessage[] }
  | { type: 'thumbs'; messageId: string; thumbs: 1 | -1 }

function turnsLeftFor(messages: EngineerMessage[]): number {
  return MAX_USER_TURNS - messages.filter((m) => m.role === 'user').length
}

export const initialState: EngineerState = {
  messages: [],
  status: { kind: 'idle' },
  turnsLeft: MAX_USER_TURNS,
  answerId: null,
}

function withMessages(state: EngineerState, messages: EngineerMessage[]): EngineerState {
  return { ...state, messages, turnsLeft: turnsLeftFor(messages) }
}

export function reduce(state: EngineerState, action: EngineerAction): EngineerState {
  switch (action.type) {
    case 'user': {
      const message: EngineerMessage = {
        id: `m${state.messages.length}`,
        role: 'user',
        content: action.content,
      }
      return {
        ...withMessages(state, [...state.messages, message]),
        status: { kind: 'streaming' },
        answerId: null,
      }
    }
    case 'event': {
      const { event } = action
      switch (event.event) {
        case 'text': {
          if (state.answerId !== null) {
            const messages = state.messages.map((m) =>
              m.id === state.answerId ? { ...m, content: m.content + event.data.delta } : m,
            )
            return { ...withMessages(state, messages), status: { kind: 'streaming' } }
          }
          const answer: EngineerMessage = {
            id: `m${state.messages.length}`,
            role: 'assistant',
            content: event.data.delta,
          }
          return {
            ...withMessages(state, [...state.messages, answer]),
            status: { kind: 'streaming' },
            answerId: answer.id,
          }
        }
        case 'tool':
          return { ...state, status: { kind: 'tool', label: event.data.label } }
        case 'error':
          return { ...state, status: { kind: 'error', message: event.data.message } }
        case 'done': {
          const failed = state.status.kind === 'error'
          // The ledger id belongs to this stream's answer only. A turn that
          // wrote no text gets a notice in its place, so it is not silent and
          // its feedback still lands on the right row.
          const messages =
            state.answerId !== null
              ? state.messages.map((m) =>
                  m.id === state.answerId ? { ...m, ledgerId: event.data.id } : m,
                )
              : failed
                ? state.messages
                : [
                    ...state.messages,
                    {
                      id: `m${state.messages.length}`,
                      role: 'assistant' as const,
                      content: EMPTY_ANSWER,
                      notice: true,
                      ledgerId: event.data.id,
                    },
                  ]
          return {
            ...withMessages(state, messages),
            status: failed ? state.status : { kind: 'idle' },
            answerId: null,
          }
        }
        default:
          return state
      }
    }
    case 'http':
      return { ...state, status: refusalStatus(action.status, action.code) }
    case 'idle':
      return state.status.kind === 'streaming' || state.status.kind === 'tool'
        ? { ...state, status: { kind: 'idle' } }
        : state
    case 'release':
      return state.status.kind === 'cooldown' ? { ...state, status: { kind: 'idle' } } : state
    case 'reset':
      return initialState
    case 'restore':
      return withMessages(initialState, action.messages)
    case 'thumbs':
      return withMessages(
        state,
        state.messages.map((m) =>
          m.id === action.messageId ? { ...m, thumbs: action.thumbs } : m,
        ),
      )
  }
}

/** `detail.code` from a refusal's JSON body, or null when there is none. */
async function refusalCode(response: Response): Promise<string | null> {
  try {
    const body: unknown = await response.json()
    const detail = (body as { detail?: unknown } | null)?.detail
    const code = (detail as { code?: unknown } | null)?.code
    return typeof code === 'string' ? code : null
  } catch {
    return null
  }
}

function readStored(): EngineerMessage[] {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (m): m is EngineerMessage =>
        typeof m === 'object' &&
        m !== null &&
        typeof m.id === 'string' &&
        (m.role === 'user' || m.role === 'assistant') &&
        typeof m.content === 'string',
    )
  } catch {
    return []
  }
}

function writeStored(messages: EngineerMessage[]) {
  try {
    if (messages.length === 0) window.sessionStorage.removeItem(STORAGE_KEY)
    else window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages))
  } catch {
    // storage full or blocked: the transcript just does not survive a reload
  }
}

export function useEngineer(options: { onNavigate: (href: string) => void }): {
  messages: EngineerMessage[]
  status: EngineerStatus
  send(question: string): Promise<void>
  stop(): void
  reset(): void
  feedback(messageId: string, thumbs: 1 | -1): Promise<void>
  turnsLeft: number
} {
  const [state, dispatch] = useReducer(reduce, initialState)
  const controllerRef = useRef<AbortController | null>(null)
  const stateRef = useRef(state)
  const restoredRef = useRef(false)
  const onNavigateRef = useRef(options.onNavigate)

  useEffect(() => {
    stateRef.current = state
    onNavigateRef.current = options.onNavigate
  })

  // Restore only after mount so the server pass and the first client render agree.
  useEffect(() => {
    const stored = readStored()
    if (stored.length > 0) dispatch({ type: 'restore', messages: stored })
    restoredRef.current = true
    return () => controllerRef.current?.abort()
  }, [])

  useEffect(() => {
    if (restoredRef.current) writeStored(state.messages)
  }, [state.messages])

  useEffect(() => {
    if (state.status.kind !== 'cooldown') return
    const timer = window.setTimeout(() => dispatch({ type: 'release' }), COOLDOWN_MS)
    return () => window.clearTimeout(timer)
  }, [state.status.kind])

  const stop = useCallback(() => {
    controllerRef.current?.abort()
    controllerRef.current = null
    dispatch({ type: 'idle' })
  }, [])

  const reset = useCallback(() => {
    controllerRef.current?.abort()
    controllerRef.current = null
    dispatch({ type: 'reset' })
  }, [])

  const send = useCallback(async (question: string) => {
    const content = question.trim().slice(0, MAX_CONTENT_CHARS).trim()
    const current = stateRef.current
    if (!content || current.turnsLeft <= 0) return
    if (controllerRef.current) return
    if (current.status.kind === 'streaming' || current.status.kind === 'tool') return
    if (current.status.kind === 'cooldown' || current.status.kind === 'budget') return

    const history = outgoingMessages([...current.messages, { role: 'user', content }])

    const controller = new AbortController()
    controllerRef.current = controller
    dispatch({ type: 'user', content })

    try {
      const response = await fetch(`${API_BASE_URL}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
        body: JSON.stringify({
          messages: history,
          path: pagePath(window.location.pathname),
          pageTitle:
            document.querySelector('h1')?.textContent?.trim().slice(0, MAX_TITLE_CHARS) || null,
        }),
        signal: controller.signal,
      })
      if (!response.ok || !response.body) {
        dispatch({ type: 'http', status: response.status, code: await refusalCode(response) })
        return
      }

      const parser = createSseParser((name, data) => {
        if (controller.signal.aborted) return
        const event = { event: name, data } as EngineerEvent
        if (event.event === 'navigate') {
          if (isSameOriginPath(event.data.href)) onNavigateRef.current(event.data.href)
          return
        }
        dispatch({ type: 'event', event })
      })
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        parser.push(decoder.decode(value, { stream: true }))
      }
      parser.push(decoder.decode())
      parser.end()
      if (!controller.signal.aborted) dispatch({ type: 'idle' })
    } catch (error) {
      if (
        controller.signal.aborted ||
        (error instanceof DOMException && error.name === 'AbortError')
      ) {
        return
      }
      dispatch({
        type: 'event',
        event: {
          event: 'error',
          data: { code: 'network', message: 'Could not reach the engineer.' },
        },
      })
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null
    }
  }, [])

  const feedback = useCallback(async (messageId: string, thumbs: 1 | -1) => {
    const message = stateRef.current.messages.find((m) => m.id === messageId)
    if (!message?.ledgerId) return
    try {
      const response = await fetch(`${API_BASE_URL}/chat/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: message.ledgerId, thumbs }),
      })
      if (response.ok) dispatch({ type: 'thumbs', messageId, thumbs })
    } catch {
      // feedback is best-effort; the thumb simply stays unmarked
    }
  }, [])

  return {
    messages: state.messages,
    status: state.status,
    send,
    stop,
    reset,
    feedback,
    turnsLeft: state.turnsLeft,
  }
}
