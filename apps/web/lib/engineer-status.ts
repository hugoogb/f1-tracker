import type { OpsChat } from '@/lib/types'

export type EngineerStatusFields =
  | { off: true; label: 'Off' }
  | { off: false; requests: string; cost: string; toolShare: string; errors: string }

export function formatEngineerStatus(chat?: OpsChat): EngineerStatusFields {
  if (!chat?.enabled) return { off: true, label: 'Off' }
  return {
    off: false,
    requests: chat.requestsToday.toLocaleString('en-GB'),
    cost: `$${chat.costTodayUsd.toFixed(4)} of $${chat.budgetUsd.toFixed(2)}`,
    toolShare: chat.toolShare === null ? '—' : `${Math.round(chat.toolShare * 100)}%`,
    errors: chat.errorsToday.toLocaleString('en-GB'),
  }
}
