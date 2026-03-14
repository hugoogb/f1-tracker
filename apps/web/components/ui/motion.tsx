'use client'

import {
  motion,
  useMotionValue,
  useTransform,
  animate,
  useInView,
  useReducedMotion,
} from 'motion/react'
import { useEffect, useRef, type ReactNode } from 'react'
import React from 'react'

import { cn } from '@/lib/utils'

// ── FadeIn ──────────────────────────────────────────────────────────────────
// Scroll-triggered fade + slide entrance. Fires once.

interface FadeInProps {
  children: ReactNode
  delay?: number
  className?: string
  y?: number
}

export function FadeIn({ children, delay = 0, className, y = 20 }: FadeInProps) {
  const shouldReduce = useReducedMotion()

  return (
    <motion.div
      initial={shouldReduce ? false : { opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={shouldReduce ? { duration: 0 } : { duration: 0.5, delay, ease: 'easeOut' }}
      className={className}
    >
      {children}
    </motion.div>
  )
}

// ── StaggerList + StaggerItem ───────────────────────────────────────────────
// Orchestrated stagger for grids and lists.

interface StaggerListProps {
  children: ReactNode
  className?: string
  staggerDelay?: number
}

export function StaggerList({ children, className, staggerDelay = 0.06 }: StaggerListProps) {
  const shouldReduce = useReducedMotion()

  return (
    <motion.div
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: '-60px' }}
      variants={{
        hidden: {},
        visible: {
          transition: { staggerChildren: shouldReduce ? 0 : staggerDelay },
        },
      }}
      className={className}
    >
      {children}
    </motion.div>
  )
}

interface StaggerItemProps {
  children: ReactNode
  className?: string
}

export function StaggerItem({ children, className }: StaggerItemProps) {
  const shouldReduce = useReducedMotion()

  return (
    <motion.div
      variants={{
        hidden: shouldReduce ? { opacity: 1, y: 0 } : { opacity: 0, y: 14 },
        visible: {
          opacity: 1,
          y: 0,
          transition: shouldReduce ? { duration: 0 } : { duration: 0.4, ease: 'easeOut' },
        },
      }}
      className={className}
    >
      {children}
    </motion.div>
  )
}

// ── AnimatedNumber ──────────────────────────────────────────────────────────
// Count-up animation for stat card values.

interface AnimatedNumberProps {
  value: number
  className?: string
}

export function AnimatedNumber({ value, className }: AnimatedNumberProps) {
  const ref = useRef<HTMLSpanElement>(null)
  const shouldReduce = useReducedMotion()
  const inView = useInView(ref, { once: true })
  const count = useMotionValue(0)
  const display = useTransform(count, (v) => Math.round(v).toLocaleString())

  useEffect(() => {
    if (!inView) return
    if (shouldReduce) {
      count.set(value)
      return
    }
    const controls = animate(count, value, {
      duration: 1.2,
      ease: 'easeOut',
    })
    return controls.stop
  }, [inView, count, value, shouldReduce])

  return (
    <motion.span ref={ref} className={className}>
      {display}
    </motion.span>
  )
}

// ── MotionCard ──────────────────────────────────────────────────────────────
// Spring-physics hover lift for interactive cards.

interface MotionCardProps {
  children: ReactNode
  className?: string
}

export function MotionCard({ children, className }: MotionCardProps) {
  const shouldReduce = useReducedMotion()

  return (
    <motion.div
      whileHover={
        shouldReduce
          ? undefined
          : { y: -4, transition: { type: 'spring', stiffness: 400, damping: 25 } }
      }
      className={className}
    >
      {children}
    </motion.div>
  )
}

// ── PodiumReveal ────────────────────────────────────────────────────────────
// Staggered entrance for race podium: P3 → P2 → P1 (dramatic last reveal).

interface PodiumRevealProps {
  children: ReactNode[]
  className?: string
}

export function PodiumReveal({ children, className }: PodiumRevealProps) {
  const shouldReduce = useReducedMotion()
  // Reveal order: P3 first (index 2), then P2 (index 1), then P1 (index 0)
  const delayOrder = [2, 1, 0]

  return (
    <div className={cn('grid grid-cols-3 gap-3', className)}>
      {React.Children.map(children, (child, i) => (
        <motion.div
          key={i}
          initial={shouldReduce ? false : { opacity: 0, y: 24, scale: 0.95 }}
          whileInView={{ opacity: 1, y: 0, scale: 1 }}
          viewport={{ once: true }}
          transition={
            shouldReduce
              ? { duration: 0 }
              : {
                  duration: 0.5,
                  delay: delayOrder.indexOf(i) * 0.15,
                  ease: [0.34, 1.56, 0.64, 1],
                }
          }
        >
          {child}
        </motion.div>
      ))}
    </div>
  )
}

// ── HeroGlow ────────────────────────────────────────────────────────────────
// Breathing radial glow for the hero section background.

interface HeroGlowProps {
  className?: string
}

export function HeroGlow({ className }: HeroGlowProps) {
  const shouldReduce = useReducedMotion()

  return (
    <motion.div
      className={className}
      animate={shouldReduce ? undefined : { opacity: [0.4, 1, 0.4] }}
      transition={shouldReduce ? undefined : { duration: 6, repeat: Infinity, ease: 'easeInOut' }}
    />
  )
}
