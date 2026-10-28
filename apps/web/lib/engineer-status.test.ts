import { describe, expect, it } from 'vitest'
import { formatEngineerStatus } from './engineer-status'
import type { OpsChat } from './types'

const ON: OpsChat = {
  enabled: true,
  requestsToday: 1234,
  costTodayUsd: 0.0012,
  budgetUsd: 0.5,
  toolShare: 0.5,
  errorsToday: 0,
}

describe('formatEngineerStatus', () => {
  it('reads a missing section or a disabled chat as off', () => {
    expect(formatEngineerStatus(undefined)).toEqual({ off: true, label: 'Off' })
    expect(formatEngineerStatus({ ...ON, enabled: false })).toEqual({ off: true, label: 'Off' })
  })
  it('formats counts, dollars against the budget and the tool share', () => {
    expect(formatEngineerStatus(ON)).toEqual({
      off: false,
      requests: '1,234',
      cost: '$0.0012 of $0.50',
      toolShare: '50%',
      errors: '0',
    })
  })
  it('shows a dash for the tool share before any answer', () => {
    const fields = formatEngineerStatus({ ...ON, toolShare: null })
    expect(!fields.off && fields.toolShare).toBe('—')
  })
})
