// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { isTypingTarget, shortcutLabel } from '@/lib/keyboard'

describe('isTypingTarget', () => {
  it('is true where a "/" should type a slash', () => {
    expect(isTypingTarget(document.createElement('input'))).toBe(true)
    expect(isTypingTarget(document.createElement('textarea'))).toBe(true)
    expect(isTypingTarget(document.createElement('select'))).toBe(true)
    const editable = document.createElement('div')
    editable.setAttribute('contenteditable', 'true')
    document.body.appendChild(editable)
    expect(isTypingTarget(editable)).toBe(true)
  })

  it('is false elsewhere', () => {
    expect(isTypingTarget(document.createElement('div'))).toBe(false)
    expect(isTypingTarget(document.createElement('button'))).toBe(false)
    expect(isTypingTarget(null)).toBe(false)
    expect(isTypingTarget(window)).toBe(false)
  })
})

describe('shortcutLabel', () => {
  it('uses the command key on Apple platforms', () => {
    expect(shortcutLabel('MacIntel')).toBe('⌘K')
    expect(shortcutLabel('iPhone')).toBe('⌘K')
    expect(shortcutLabel('iPad')).toBe('⌘K')
  })

  it('uses Ctrl elsewhere', () => {
    expect(shortcutLabel('Win32')).toBe('Ctrl K')
    expect(shortcutLabel('Linux x86_64')).toBe('Ctrl K')
    expect(shortcutLabel('')).toBe('Ctrl K')
  })
})
