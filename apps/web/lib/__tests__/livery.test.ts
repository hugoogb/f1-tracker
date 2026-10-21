import { describe, expect, it } from 'vitest'
import { liveryStyle } from '@/lib/livery'

describe('liveryStyle', () => {
  it('sets nothing without a colour, so the page keeps the red accent', () => {
    expect(liveryStyle(null)).toEqual({})
    expect(liveryStyle(undefined)).toEqual({})
    expect(liveryStyle('')).toEqual({})
  })

  it('points the accent at the team colour', () => {
    expect(liveryStyle('#00D7B6')).toEqual({
      '--livery': '#00D7B6',
      '--accent-livery': '#00D7B6',
    })
  })
})
