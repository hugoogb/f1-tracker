'use client'

import { useEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'

import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { isTypingTarget } from '@/lib/keyboard'
import { EngineerAvatar } from './engineer-avatar'

function LoadingSheet() {
  return (
    <Sheet open>
      <SheetContent
        side="right"
        showCloseButton={false}
        className="gap-0 p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-md"
      >
        <div className="border-hairline flex items-center gap-3 border-b py-3 pr-12 pl-4">
          <SheetTitle className="display text-2xl tracking-wide uppercase">Engineer</SheetTitle>
        </div>
        <div className="flex-1 space-y-3 p-4" aria-busy="true">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      </SheetContent>
    </Sheet>
  )
}

const EngineerSheet = dynamic(() => import('./engineer-sheet').then((m) => m.EngineerSheet), {
  ssr: false,
  loading: LoadingSheet,
})

export function EngineerButton() {
  const [open, setOpen] = useState(false)
  const [opened, setOpened] = useState(false)
  const openRef = useRef(open)

  useEffect(() => {
    openRef.current = open
  }, [open])

  const toggle = (next: boolean) => {
    setOpen(next)
    if (next) setOpened(true)
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'j') return
      if (!openRef.current && isTypingTarget(e.target)) return
      e.preventDefault()
      setOpened(true)
      setOpen((prev) => !prev)
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
        <EngineerAvatar size="sm" />
      </Button>
      {opened && <EngineerSheet open={open} onOpenChange={toggle} />}
    </>
  )
}
