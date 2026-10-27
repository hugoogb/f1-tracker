'use client'

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { Radio } from 'lucide-react'

import { Button } from '@/components/ui/button'

// Loaded on first open only, so a cached page carries nothing but this button.
const EngineerSheet = dynamic(() => import('./engineer-sheet').then((m) => m.EngineerSheet), {
  ssr: false,
})

/** The header's Race Engineer toggle (also ⌘J / Ctrl+J from anywhere). */
export function EngineerButton() {
  const [open, setOpen] = useState(false)
  const [opened, setOpened] = useState(false)

  const toggle = (next: boolean) => {
    setOpen(next)
    if (next) setOpened(true)
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'j') {
        e.preventDefault()
        setOpened(true)
        setOpen((prev) => !prev)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Ask the Engineer"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => toggle(!open)}
      >
        <Radio className="size-4" aria-hidden />
      </Button>
      {opened && <EngineerSheet open={open} onOpenChange={toggle} />}
    </>
  )
}
