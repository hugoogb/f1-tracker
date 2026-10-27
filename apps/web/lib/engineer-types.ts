export interface EngineerMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  ledgerId?: string
  thumbs?: 1 | -1
}

export type EngineerStatus =
  | { kind: 'idle' }
  | { kind: 'streaming' }
  | { kind: 'tool'; label: string }
  | { kind: 'budget' }
  | { kind: 'cooldown' }
  | { kind: 'error'; message: string }

export type EngineerEvent =
  | { event: 'text'; data: { delta: string } }
  | { event: 'tool'; data: { name: string; label: string } }
  | { event: 'navigate'; data: { href: string } }
  | { event: 'usage'; data: { toolCalls: number; costUsd: number } }
  | { event: 'error'; data: { code: string; message: string } }
  | { event: 'done'; data: { id: string; outcome: string } }

export const STATUS_LABELS: Record<EngineerStatus['kind'], string> = {
  idle: 'RADIO CHECK',
  streaming: 'ON IT',
  tool: 'CHECKING',
  budget: 'OFF THE RADIO',
  cooldown: 'ON COOLDOWN',
  error: 'RADIO FAULT',
}
