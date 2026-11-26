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
export const COOLDOWN_MS = 10 * 60 * 1000

export function pageTitleFrom(text: string | null | undefined): string | null {
  return text?.trim().slice(0, MAX_TITLE_CHARS).trim() || null
}

export function sendBlocked(state: EngineerState, content: string, inFlight: boolean): boolean {
  if (!content || state.turnsLeft <= 0 || inFlight) return true
  const kind = state.status.kind
  return kind === 'streaming' || kind === 'tool' || kind === 'cooldown' || kind === 'budget'
}

export function pagePath(pathname: string): string {
  return pathname.length <= MAX_PATH_CHARS && isSameOriginPath(pathname) ? pathname : '/'
}

export function refusalStatus(status: number, code: string | null): EngineerStatus {
  if (code === 'disabled') return { kind: 'error', message: DISABLED_MESSAGE }
  if (code === 'budget') return { kind: 'budget' }
  if (code === 'rate_limited' || status === 429) return { kind: 'cooldown' }
  return { kind: 'error', message: `Request failed (${status})` }
}

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

function writeStored(messages: EngineerMessage[]): boolean {
  try {
    if (messages.length === 0) window.sessionStorage.removeItem(STORAGE_KEY)
    else window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages))
    return true
  } catch {
    return false
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
    if (sendBlocked(current, content, controllerRef.current !== null)) return

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
          pageTitle: pageTitleFrom(document.querySelector('h1')?.textContent),
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
    const response = await fetch(`${API_BASE_URL}/chat/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: message.ledgerId, thumbs }),
    }).catch(() => null)
    if (response?.ok) dispatch({ type: 'thumbs', messageId, thumbs })
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
