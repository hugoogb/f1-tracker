/** Whether a key press lands somewhere it types text, so "/" must type a slash. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!target || typeof (target as Element).tagName !== 'string') return false
  const el = target as HTMLElement
  if (el.isContentEditable || el.closest?.('[contenteditable=""], [contenteditable="true"]'))
    return true
  const tag = el.tagName.toLowerCase()
  return tag === 'input' || tag === 'textarea' || tag === 'select'
}

/** The search shortcut as this platform writes it. */
export function shortcutLabel(platform: string): string {
  return /mac|iphone|ipad/i.test(platform) ? '⌘K' : 'Ctrl K'
}
