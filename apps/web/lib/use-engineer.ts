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

/** The server's bounds: each entry stripped, 1..2000 chars, the last one a user turn. */
export function outgoingMessages(
  messages: Pick<EngineerMessage, 'role' | 'content'>[],
): { role: 'user' | 'assistant'; content: string }[] {
  return messages
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
}

export type EngineerAction =
  | { type: 'user'; content: string }
  | { type: 'event'; event: EngineerEvent }
  | { type: 'http'; status: number }
  | { type: 'reset' }
  | { type: 'idle' }
  | { type: 'restore'; messages: EngineerMessage[] }
  | { type: 'thumbs'; messageId: string; thumbs: 1 | -1 }

function turnsLeftFor(messages: EngineerMessage[]): number {
  return MAX_USER_TURNS - messages.filter((m) => m.role === 'user').length
}

export const initialState: EngineerState = {
  messages: [],
  status: { kind: 'idle' },
  turnsLeft: MAX_USER_TURNS,
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
      return { ...withMessages(state, [...state.messages, message]), status: { kind: 'streaming' } }
    }
    case 'event': {
      const { event } = action
      switch (event.event) {
        case 'text': {
          const last = state.messages.at(-1)
          const messages =
            last?.role === 'assistant'
              ? [
                  ...state.messages.slice(0, -1),
                  { ...last, content: last.content + event.data.delta },
                ]
              : [
                  ...state.messages,
                  {
                    id: `m${state.messages.length}`,
                    role: 'assistant' as const,
                    content: event.data.delta,
                  },
                ]
          return { ...withMessages(state, messages), status: { kind: 'streaming' } }
        }
        case 'tool':
          return { ...state, status: { kind: 'tool', label: event.data.label } }
        case 'error':
          return { ...state, status: { kind: 'error', message: event.data.message } }
        case 'done': {
          const last = state.messages.at(-1)
          const messages =
            last?.role === 'assistant'
              ? [...state.messages.slice(0, -1), { ...last, ledgerId: event.data.id }]
              : state.messages
          const failed = state.status.kind === 'error'
          return {
            ...withMessages(state, messages),
            status: failed ? state.status : { kind: 'idle' },
          }
        }
        default:
          return state
      }
    }
    case 'http':
      if (action.status === 503) return { ...state, status: { kind: 'budget' } }
      if (action.status === 429) return { ...state, status: { kind: 'cooldown' } }
      return { ...state, status: { kind: 'error', message: `Request failed (${action.status})` } }
    case 'idle':
      return state.status.kind === 'streaming' || state.status.kind === 'tool'
        ? { ...state, status: { kind: 'idle' } }
        : state
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
          path: window.location.pathname,
          pageTitle:
            document.querySelector('h1')?.textContent?.trim().slice(0, MAX_TITLE_CHARS) || null,
        }),
        signal: controller.signal,
      })
      if (!response.ok || !response.body) {
        dispatch({ type: 'http', status: response.status })
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
