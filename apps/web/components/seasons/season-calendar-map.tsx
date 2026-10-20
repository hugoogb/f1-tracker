'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react'
import Link from 'next/link'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import {
  ArrowRight,
  Globe2,
  MapPin,
  Pause,
  Play,
  Plane,
  RotateCcw,
  SkipBack,
  SkipForward,
  X,
} from 'lucide-react'
import { CountryFlag } from '@/components/ui/country-flag'
import { LocalDate, LocalDateTime } from '@/components/ui/local-date'
import { useNow } from '@/lib/client-only'
import { EARTH_CIRCUMFERENCE_KM } from '@/lib/geo'
import { cn } from '@/lib/utils'
import type { CalendarRound } from '@/lib/types'
import { SeasonCalendarCanvas } from './season-calendar-canvas'
import {
  Playhead,
  buildRoute,
  easeInOut,
  seasonProgress,
  travelMs,
  type CalendarCamera,
  type CalendarLeg,
  type CalendarStop,
  type StopStatus,
} from './season-calendar-model'
import styles from './season-calendar-map.module.css'

export type SeasonCalendarVariant = 'season' | 'home'

interface SeasonCalendarMapProps {
  year: number
  rounds: CalendarRound[]
  /**
   * `season` opens on the whole calendar; `home` opens on the next race with
   * the previous one marked, and flies the leg between them once a session.
   */
  variant: SeasonCalendarVariant
}

interface PlayState {
  /** The stop whose card is open; null while travelling or on the overview. */
  focus: number | null
  playing: boolean
  /** Stop playback on arrival here (the home intro flight); null plays to the end. */
  stopAt: number | null
  /** Bumped by every manual jump so the playback loop restarts from the new place. */
  seek: number
}

const SPEEDS = [0.5, 1, 2, 4] as const
const DWELL_MS = 2200
const INTRO_DWELL_MS = 700
const INTRO_KEY = 'f1-tracker:calendar-intro:v1'

function introSeen(): boolean {
  try {
    return window.sessionStorage.getItem(INTRO_KEY) === '1'
  } catch {
    // Storage blocked (private mode, sandboxed iframe): skip the intro rather
    // than replay it on every visit.
    return true
  }
}

function markIntroSeen() {
  try {
    window.sessionStorage.setItem(INTRO_KEY, '1')
  } catch {
    // Nothing to do — see introSeen().
  }
}

function prefersReducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
}

/**
 * The cinematic season map: every round in calendar order, great-circle legs
 * between them, and a "play" mode that flies the camera round to round.
 *
 * Only ever rendered on the client (the wrapper imports it with `ssr: false`),
 * which is what lets it read the clock, `sessionStorage` and the motion
 * preference straight away: there is no server render for it to disagree with,
 * so "next race" is computed after hydration by construction.
 */
export function SeasonCalendarMap({ year, rounds, variant }: SeasonCalendarMapProps) {
  const now = useNow()
  const reduced = useReducedMotion() ?? false

  const route = useMemo(() => buildRoute(rounds), [rounds])
  const { legs, cumulativeKm } = route
  const lastIndex = route.points.length - 1

  // Statuses follow the clock to the minute; the map itself only re-renders
  // when one actually changes.
  const minute = now === null ? null : Math.floor(now / 60_000)
  const progress = useMemo(
    () =>
      seasonProgress(
        route.points.map((p) => p.round),
        minute === null ? null : minute * 60_000,
      ),
    [route.points, minute],
  )
  const statusKey = progress.statuses.join(',')
  const stops: CalendarStop[] = useMemo(
    () =>
      route.points.map((p, index) => ({
        index,
        round: p.round,
        latLng: p.latLng,
        status: progress.statuses[index] ?? 'unknown',
      })),
    // statusKey stands in for progress.statuses: same content, stable identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [route.points, statusKey],
  )

  // Everything below is decided once, on mount — which is always on the client.
  const [boot] = useState(() => {
    const intro =
      variant === 'home' &&
      progress.previous >= 0 &&
      progress.next >= 0 &&
      !prefersReducedMotion() &&
      !introSeen()

    if (variant === 'home' && progress.next >= 0) {
      return intro
        ? {
            pos: progress.previous,
            state: { focus: null, playing: true, stopAt: progress.next, seek: 0 },
            camera: { kind: 'stop', index: progress.previous, zoom: 3.5 } as const,
            intro,
          }
        : {
            // Parked at the next race, as the intro would have left it.
            pos: progress.next,
            state: { focus: progress.next, playing: false, stopAt: null, seek: 0 },
            camera: { kind: 'stop', index: progress.next, zoom: 3 } as const,
            intro,
          }
    }
    // A finished season shows every leg flown; one in progress shows the
    // distance covered so far.
    const pos = progress.next >= 0 ? Math.max(progress.previous, 0) : Math.max(lastIndex, 0)
    return {
      pos,
      state: { focus: null, playing: false, stopAt: null, seek: 0 },
      camera: { kind: 'overview' } as const,
      intro,
    }
  })

  const [playhead] = useState(() => new Playhead(boot.pos))
  const [state, setState] = useState<PlayState>(boot.state)
  const [speed, setSpeed] = useState<number>(1)
  const [camera, setCamera] = useState<CalendarCamera>({
    ...boot.camera,
    nonce: 0,
    animate: false,
  })
  // Linear progress through the current leg, so a pause mid-flight resumes
  // exactly where it stopped (the playhead itself holds the eased value).
  const legProgress = useRef(0)

  const fly = useCallback(
    (
      command:
        | { kind: 'overview' }
        | { kind: 'stop'; index: number; zoom?: number; ms?: number }
        | { kind: 'leg'; to: number; ms: number },
    ) => {
      setCamera((previous) => ({ ...command, nonce: previous.nonce + 1, animate: !reduced }))
    },
    [reduced],
  )

  useEffect(() => {
    if (boot.intro) markIntroSeen()
  }, [boot.intro])

  // ── Playback loop ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!state.playing || lastIndex < 1) return

    const stopAt = state.stopAt
    const legDuration = (to: number) => (reduced ? 0 : travelMs(legs[to]?.km ?? 0) / speed)
    const dwellFor = () => (stopAt !== null ? INTRO_DWELL_MS : DWELL_MS) / speed

    let from = Math.floor(playhead.get())
    let u = playhead.get() > from ? legProgress.current : 0
    let phase: 'dwell' | 'travel' = u > 0 ? 'travel' : 'dwell'
    let elapsed = 0

    const finish = () => setState((s) => ({ ...s, playing: false, stopAt: null }))

    if (phase === 'travel') {
      fly({ kind: 'leg', to: from + 1, ms: legDuration(from + 1) * (1 - u) })
    }

    let last = performance.now()
    let frame = requestAnimationFrame(function tick(time) {
      const dt = time - last
      last = time

      if (phase === 'dwell') {
        elapsed += dt
        if (elapsed >= dwellFor()) {
          if (from >= lastIndex || (stopAt !== null && from >= stopAt)) {
            finish()
            return
          }
          phase = 'travel'
          u = 0
          elapsed = 0
          setState((s) => ({ ...s, focus: null }))
          const ms = legDuration(from + 1)
          if (ms > 0) fly({ kind: 'leg', to: from + 1, ms })
        }
      } else {
        const ms = legDuration(from + 1)
        u = ms <= 0 ? 1 : Math.min(1, u + dt / ms)
        legProgress.current = u
        if (u >= 1) {
          from += 1
          u = 0
          legProgress.current = 0
          playhead.set(from)
          setState((s) => ({ ...s, focus: from }))
          fly({ kind: 'stop', index: from, ms: 1100 })
          phase = 'dwell'
          elapsed = 0
          if (stopAt !== null && from >= stopAt) {
            finish()
            return
          }
        } else {
          playhead.set(from + easeInOut(u))
        }
      }
      frame = requestAnimationFrame(tick)
    })

    return () => cancelAnimationFrame(frame)
  }, [state.playing, state.seek, state.stopAt, speed, reduced, legs, lastIndex, playhead, fly])

  // ── Controls ──────────────────────────────────────────────────────────────
  const seek = useCallback(
    (index: number) => {
      const target = Math.max(0, Math.min(lastIndex, index))
      legProgress.current = 0
      playhead.set(target)
      setState((s) => ({ ...s, focus: target, stopAt: null, seek: s.seek + 1 }))
      fly({ kind: 'stop', index: target, ms: 1300 })
    },
    [lastIndex, playhead, fly],
  )

  // The position, as an integer, for controls that step: the open card if
  // there is one, otherwise wherever the playhead is parked.
  const parked = useSyncExternalStore(
    playhead.subscribe,
    () => Math.floor(playhead.get()),
    () => Math.floor(playhead.get()),
  )
  const current = state.focus ?? parked
  const atEnd = parked >= lastIndex && state.focus === null

  const togglePlay = () => {
    if (state.playing) {
      setState((s) => ({ ...s, playing: false, stopAt: null }))
      return
    }
    if (parked >= lastIndex) {
      // Replay from the top: wipe the flown legs and start at round one.
      legProgress.current = 0
      playhead.set(0)
      setState((s) => ({ focus: 0, playing: true, stopAt: null, seek: s.seek + 1 }))
      fly({ kind: 'stop', index: 0, ms: 1500 })
      return
    }
    if (state.focus === null) fly({ kind: 'stop', index: parked, ms: 1200 })
    setState((s) => ({ ...s, focus: s.focus ?? parked, playing: true, stopAt: null }))
  }

  const step = (delta: 1 | -1) => {
    if (atEnd) seek(delta === 1 ? 0 : lastIndex)
    else seek(current + delta)
  }

  const showOverview = () => {
    setState((s) => ({ ...s, focus: null, playing: false, stopAt: null }))
    fly({ kind: 'overview' })
  }

  const select = useCallback((index: number) => seek(index), [seek])

  if (stops.length === 0) {
    return (
      <p className="text-muted-foreground rounded-xl border border-[var(--glass-border)] p-6 text-sm">
        No circuit coordinates are available for this season.
      </p>
    )
  }

  const focusStop = state.focus !== null ? stops[state.focus] : null
  const inProgress = progress.next >= 0
  const totalKm = cumulativeKm[lastIndex] ?? 0

  return (
    <div className="space-y-3">
      <StatsStrip
        stops={stops}
        legs={legs}
        cumulativeKm={cumulativeKm}
        playhead={playhead}
        totalKm={totalKm}
        progress={progress}
        variant={variant}
      />

      <div className="relative">
        <div
          className="relative h-[340px] w-full overflow-hidden rounded-xl border border-[var(--glass-border)] sm:h-[440px] lg:h-[520px]"
          role="region"
          aria-label={`${year} season calendar map`}
        >
          <SeasonCalendarCanvas
            year={year}
            stops={stops}
            legs={legs}
            focus={state.focus}
            playhead={playhead}
            camera={camera}
            onSelect={select}
          />
          {/* Vignette: pulls the eye to the middle, hides the hard map edge. */}
          <div className="pointer-events-none absolute inset-0 z-[400] rounded-xl shadow-[inset_0_0_80px_30px_rgba(0,0,0,0.55)]" />
          <EnRoute stops={stops} legs={legs} playhead={playhead} />
          <div className="absolute top-3 right-3 z-[1000] hidden md:block">
            <Legend inProgress={inProgress} />
          </div>
        </div>

        <AnimatePresence mode="wait">
          {focusStop && (
            <motion.div
              key={focusStop.index}
              initial={reduced ? false : { opacity: 0, y: 12, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={
                reduced
                  ? { opacity: 0, transition: { duration: 0 } }
                  : { opacity: 0, y: 8, scale: 0.98 }
              }
              transition={{ type: 'spring', stiffness: 380, damping: 30 }}
              className="mt-3 md:absolute md:top-3 md:left-3 md:z-[1000] md:mt-0 md:w-80"
            >
              <RoundCard
                year={year}
                stop={focusStop}
                legKm={legs[focusStop.index]?.km ?? null}
                onClose={() => setState((s) => ({ ...s, focus: null }))}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <Controls
        stops={stops}
        playhead={playhead}
        playing={state.playing}
        current={current}
        atEnd={atEnd}
        parked={parked}
        lastIndex={lastIndex}
        speed={speed}
        onSpeed={setSpeed}
        onToggle={togglePlay}
        onStep={step}
        onSeek={seek}
        onOverview={showOverview}
        reduced={reduced}
      />

      <p className="sr-only" aria-live="polite">
        {focusStop ? `Round ${focusStop.round.round}: ${focusStop.round.name}` : ''}
      </p>
      <div className="md:hidden">
        <Legend inProgress={inProgress} />
      </div>
    </div>
  )
}

// ── Pieces ──────────────────────────────────────────────────────────────────

function usePlayhead(playhead: Playhead): number {
  return useSyncExternalStore(playhead.subscribe, playhead.get, playhead.get)
}

// The viewer's own locale: this module only ever runs in the browser (see the
// wrapper), so there is no server-rendered number for it to disagree with.
const kmFormat = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 })

function StatsStrip({
  stops,
  legs,
  cumulativeKm,
  playhead,
  totalKm,
  progress,
  variant,
}: {
  stops: CalendarStop[]
  legs: (CalendarLeg | null)[]
  cumulativeKm: number[]
  playhead: Playhead
  totalKm: number
  progress: ReturnType<typeof seasonProgress>
  variant: SeasonCalendarVariant
}) {
  const pos = usePlayhead(playhead)
  const from = Math.floor(pos)
  const km = (cumulativeKm[from] ?? 0) + (legs[from + 1]?.km ?? 0) * (pos - from)
  const format = kmFormat

  const longest = useMemo(() => {
    let best: { km: number; to: number } | null = null
    legs.forEach((leg, i) => {
      if (leg && (!best || leg.km > best.km)) best = { km: leg.km, to: i }
    })
    return best as { km: number; to: number } | null
  }, [legs])

  const laps = km / EARTH_CIRCUMFERENCE_KM
  const label = variant === 'home' && progress.next >= 0 ? 'Travelled so far' : 'Distance travelled'

  return (
    <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <Stat label="Rounds" value={String(stops.length)} />
      <Stat
        label={label}
        value={
          <>
            {format.format(km)}
            <span className="text-muted-foreground ml-1 text-xs font-normal">km</span>
          </>
        }
        hint={`of ${format.format(totalKm)} km`}
        live
      />
      <Stat
        label="Around the Earth"
        value={
          <>
            {laps.toFixed(1)}
            <span className="text-muted-foreground ml-0.5 text-xs font-normal">×</span>
          </>
        }
        hint="great-circle legs"
      />
      {longest && (
        <Stat
          label="Longest leg"
          value={
            <>
              {format.format(longest.km)}
              <span className="text-muted-foreground ml-1 text-xs font-normal">km</span>
            </>
          }
          hint={`${placeName(stops[longest.to - 1])} → ${placeName(stops[longest.to])}`}
        />
      )}
    </dl>
  )
}

function placeName(stop: CalendarStop | undefined): string {
  if (!stop) return ''
  return stop.round.circuit.location ?? stop.round.circuit.country ?? stop.round.circuit.name
}

function Stat({
  label,
  value,
  hint,
  live,
}: {
  label: string
  value: ReactNode
  hint?: string
  live?: boolean
}) {
  return (
    <div className="glass min-w-0 rounded-xl px-3 py-2.5">
      <dt className="text-muted-foreground truncate text-[10px] font-medium tracking-widest uppercase">
        {label}
      </dt>
      <dd
        className={cn(
          'font-heading truncate text-lg font-bold tabular-nums sm:text-xl',
          live && 'text-foreground',
        )}
      >
        {value}
      </dd>
      {hint && <dd className="text-muted-foreground truncate text-[11px]">{hint}</dd>}
    </div>
  )
}

/** "Melbourne → Shanghai · 8,040 km", shown only while a leg is being flown. */
function EnRoute({
  stops,
  legs,
  playhead,
}: {
  stops: CalendarStop[]
  legs: (CalendarLeg | null)[]
  playhead: Playhead
}) {
  const pos = usePlayhead(playhead)
  const from = Math.floor(pos)
  const travelling = pos - from > 1e-4 && stops[from + 1]
  const format = kmFormat
  if (!travelling) return null
  const leg = legs[from + 1]
  return (
    <div className="pointer-events-none absolute bottom-3 left-1/2 z-[1000] max-w-[calc(100%-1.5rem)] -translate-x-1/2">
      <div className="flex items-center gap-2 rounded-full border border-white/10 bg-black/70 px-3 py-1.5 text-xs whitespace-nowrap shadow-lg backdrop-blur">
        <Plane className="text-primary h-3.5 w-3.5 shrink-0" />
        <span className="truncate">
          {placeName(stops[from])} <span className="text-muted-foreground">→</span>{' '}
          <span className="font-semibold">{placeName(stops[from + 1])}</span>
        </span>
        {leg && (
          <span className="text-muted-foreground tabular-nums">
            {format.format(leg.km * (pos - from))} / {format.format(leg.km)} km
          </span>
        )}
      </div>
    </div>
  )
}

const LEGEND: { status: StopStatus; label: string }[] = [
  { status: 'completed', label: 'Raced' },
  { status: 'previous', label: 'Last race' },
  { status: 'next', label: 'Next race' },
  { status: 'future', label: 'Upcoming' },
]

function Legend({ inProgress }: { inProgress: boolean }) {
  // Before the clock is known, or once the season is over, every marker means
  // the same thing and a legend would only be noise.
  if (!inProgress) return null
  return (
    <ul className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-black/55 px-2.5 py-1.5 text-[11px] backdrop-blur md:border md:border-white/10">
      {LEGEND.map(({ status, label }) => (
        <li key={status} className="flex items-center gap-1.5">
          <span
            className={cn(
              styles.marker,
              styles[status],
              'pointer-events-none !h-3 !w-3 !text-[0px]',
            )}
            aria-hidden
          />
          <span className="text-muted-foreground">{label}</span>
        </li>
      ))}
    </ul>
  )
}

function RoundCard({
  year,
  stop,
  legKm,
  onClose,
}: {
  year: number
  stop: CalendarStop
  legKm: number | null
  onClose: () => void
}) {
  const { round, status } = stop
  const format = kmFormat
  const href = `/seasons/${year}/races/${round.round}`
  const raced = round.winner !== null
  const color = round.winner?.constructor?.color ?? null

  return (
    <div
      className="overflow-hidden rounded-xl border border-white/10 bg-[oklch(0.11_0.003_250/0.88)] shadow-2xl backdrop-blur-md"
      style={color ? { boxShadow: `0 20px 50px -20px ${color}66` } : undefined}
    >
      <div
        className="h-1 w-full"
        style={{
          background: color
            ? `linear-gradient(90deg, ${color}, transparent)`
            : 'linear-gradient(90deg, var(--primary), transparent)',
        }}
      />
      <div className="flex gap-3 p-4">
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="bg-primary/15 text-primary rounded-md px-1.5 py-0.5 font-mono text-[10px] font-bold tracking-wider">
              R{round.round}
            </span>
            {status === 'next' && (
              <span className="rounded-md bg-white/10 px-1.5 py-0.5 text-[10px] font-semibold tracking-wider whitespace-nowrap uppercase">
                Next race
              </span>
            )}
            {status === 'previous' && (
              <span className="text-muted-foreground rounded-md bg-white/5 px-1.5 py-0.5 text-[10px] font-semibold tracking-wider whitespace-nowrap uppercase">
                Last race
              </span>
            )}
            <span className="text-muted-foreground ml-auto text-xs tabular-nums">
              {round.schedule.race ? (
                <LocalDateTime value={round.schedule.race} style="medium" />
              ) : round.date ? (
                <LocalDate value={round.date} style="medium" />
              ) : null}
            </span>
          </div>
          <h3 className="text-base leading-tight font-bold tracking-wide">{round.name}</h3>
          <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
            <MapPin className="h-3 w-3 shrink-0" />
            <span className="truncate">{round.circuit.name}</span>
          </p>
          <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
            <CountryFlag code={round.circuit.countryCode} />
            <span className="truncate">
              {[round.circuit.location, round.circuit.country].filter(Boolean).join(', ')}
            </span>
          </p>
        </div>
        {round.circuit.layoutSvgId && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/tracks/${round.circuit.layoutSvgId}.svg`}
            alt={`Track layout of ${round.circuit.name}`}
            width={72}
            height={72}
            className="h-[72px] w-[72px] shrink-0 object-contain opacity-80"
            loading="lazy"
          />
        )}
      </div>

      <div className="border-t border-white/5 px-4 py-3">
        {raced && round.winner ? (
          <div className="flex items-center gap-2.5">
            <span
              className="h-8 w-1 shrink-0 rounded-full"
              style={{ backgroundColor: color ?? 'var(--muted-foreground)' }}
            />
            <div className="min-w-0">
              <p className="text-muted-foreground text-[10px] tracking-widest uppercase">Winner</p>
              <p className="truncate text-sm font-semibold">
                {round.winner.driver.firstName} {round.winner.driver.lastName}
                {round.winner.constructor && (
                  <span className="text-muted-foreground font-normal">
                    {' '}
                    · {round.winner.constructor.name}
                  </span>
                )}
              </p>
            </div>
          </div>
        ) : (
          <p className="text-muted-foreground text-xs">
            {status === 'next' ? 'Lights out soon.' : 'Not raced yet.'}
            {legKm !== null && <span> {format.format(legKm)} km from the round before.</span>}
          </p>
        )}
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-white/5 px-4 py-2.5">
        <Link
          href={href}
          className="text-primary hover:text-primary/80 inline-flex items-center gap-1 text-xs font-semibold transition-colors"
        >
          {raced ? 'Race results' : 'Race weekend'}
          <ArrowRight className="h-3 w-3" />
        </Link>
        <button
          type="button"
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground focus-visible:ring-ring rounded-md p-1 transition-colors focus-visible:ring-2 focus-visible:outline-none"
          aria-label="Close round card"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}

const DOT_COLOR: Record<StopStatus, string> = {
  completed: 'bg-zinc-500',
  previous: 'bg-white',
  next: 'bg-primary',
  future: 'border border-primary/70 bg-transparent',
  unknown: 'border border-white/40 bg-transparent',
}

function Controls({
  stops,
  playhead,
  playing,
  current,
  atEnd,
  parked,
  lastIndex,
  speed,
  onSpeed,
  onToggle,
  onStep,
  onSeek,
  onOverview,
  reduced,
}: {
  stops: CalendarStop[]
  playhead: Playhead
  playing: boolean
  current: number
  atEnd: boolean
  parked: number
  lastIndex: number
  speed: number
  onSpeed: (speed: number) => void
  onToggle: () => void
  onStep: (delta: 1 | -1) => void
  onSeek: (index: number) => void
  onOverview: () => void
  reduced: boolean
}) {
  const replay = !playing && parked >= lastIndex
  const currentStop = stops[current]
  const buttonClass =
    'focus-visible:ring-ring inline-flex size-9 shrink-0 items-center justify-center rounded-lg border border-[var(--glass-border)] bg-[var(--surface-1)] text-foreground transition-colors hover:bg-[var(--surface-2)] focus-visible:ring-2 focus-visible:outline-none disabled:opacity-40'

  return (
    <div className="glass flex flex-col gap-3 rounded-xl p-3 md:flex-row md:items-center">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className={buttonClass}
          onClick={() => onStep(-1)}
          aria-label="Previous round"
        >
          <SkipBack className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={onToggle}
          className="bg-primary text-primary-foreground hover:bg-primary/90 focus-visible:ring-ring inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg px-3.5 text-sm font-semibold shadow-[0_0_20px_oklch(0.55_0.25_27/35%)] transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-black focus-visible:outline-none"
          aria-label={playing ? 'Pause' : replay ? 'Replay the season' : 'Play the season'}
        >
          {playing ? (
            <Pause className="h-4 w-4" />
          ) : replay ? (
            <RotateCcw className="h-4 w-4" />
          ) : (
            <Play className="h-4 w-4" />
          )}
          <span>{playing ? 'Pause' : replay ? 'Replay' : 'Play season'}</span>
        </button>
        <button
          type="button"
          className={buttonClass}
          onClick={() => onStep(1)}
          aria-label="Next round"
        >
          <SkipForward className="h-4 w-4" />
        </button>
        <button
          type="button"
          className={cn(buttonClass, 'md:hidden')}
          onClick={onOverview}
          aria-label="Show the whole season"
        >
          <Globe2 className="h-4 w-4" />
        </button>
        <div className="ml-auto md:hidden">
          <SpeedPicker speed={speed} onSpeed={onSpeed} disabled={reduced} />
        </div>
      </div>

      <div className="min-w-0 flex-1">
        <Timeline
          stops={stops}
          playhead={playhead}
          current={current}
          atEnd={atEnd}
          onSeek={onSeek}
        />
        <div className="text-muted-foreground mt-0.5 flex items-center justify-between gap-2 text-[11px]">
          <span className="tabular-nums">R{stops[0]?.round.round}</span>
          <span className="text-foreground/80 min-w-0 truncate text-center">
            {atEnd ? (
              `${stops.length} rounds`
            ) : currentStop ? (
              <>
                <span className="font-semibold">R{currentStop.round.round}</span> ·{' '}
                {currentStop.round.name}
              </>
            ) : null}
          </span>
          <span className="tabular-nums">R{stops[lastIndex]?.round.round}</span>
        </div>
      </div>

      <div className="hidden items-center gap-2 md:flex">
        <SpeedPicker speed={speed} onSpeed={onSpeed} disabled={reduced} />
        <button
          type="button"
          className={buttonClass}
          onClick={onOverview}
          aria-label="Show the whole season"
          title="Whole season"
        >
          <Globe2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}

function SpeedPicker({
  speed,
  onSpeed,
  disabled,
}: {
  speed: number
  onSpeed: (speed: number) => void
  disabled: boolean
}) {
  return (
    <div
      role="group"
      aria-label="Playback speed"
      className="flex rounded-lg border border-[var(--glass-border)] bg-[var(--surface-1)] p-0.5"
      title={disabled ? 'Reduced motion: transitions are instant' : undefined}
    >
      {SPEEDS.map((value) => (
        <button
          key={value}
          type="button"
          aria-pressed={speed === value}
          onClick={() => onSpeed(value)}
          className={cn(
            'focus-visible:ring-ring rounded-md px-2 py-1 text-xs font-semibold tabular-nums transition-colors focus-visible:ring-2 focus-visible:outline-none',
            speed === value
              ? 'text-foreground bg-white/10'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {value}×
        </button>
      ))}
    </div>
  )
}

/**
 * A native range input over a drawn track: drag, click or arrow-key through
 * the rounds. The dots and the red fill are decoration underneath it.
 */
function Timeline({
  stops,
  playhead,
  current,
  atEnd,
  onSeek,
}: {
  stops: CalendarStop[]
  playhead: Playhead
  current: number
  atEnd: boolean
  onSeek: (index: number) => void
}) {
  const pos = usePlayhead(playhead)
  const last = Math.max(stops.length - 1, 1)
  const value = atEnd ? stops.length - 1 : current
  const stop = stops[value]

  return (
    <div className="relative">
      {/* Inset by the thumb's radius so dot i sits exactly under value i. */}
      <div className="pointer-events-none absolute inset-y-0 right-[9px] left-[9px]">
        <div className="absolute top-1/2 right-0 left-0 h-1 -translate-y-1/2 rounded-full bg-white/10" />
        <div
          className="from-primary/60 to-primary absolute top-1/2 left-0 h-1 -translate-y-1/2 rounded-full bg-gradient-to-r"
          style={{ width: `${(Math.min(pos, last) / last) * 100}%` }}
        />
        {stops.map((s) => (
          <span
            key={s.index}
            className={cn(
              'absolute top-1/2 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full',
              DOT_COLOR[s.status],
              s.status === 'next' && 'size-2 shadow-[0_0_8px_var(--primary)]',
            )}
            style={{ left: `${(s.index / last) * 100}%` }}
          />
        ))}
      </div>
      <input
        type="range"
        min={0}
        max={stops.length - 1}
        step={1}
        value={value}
        onChange={(event) => onSeek(Number(event.target.value))}
        className={styles.scrubber}
        aria-label="Round"
        aria-valuetext={stop ? `Round ${stop.round.round}, ${stop.round.name}` : undefined}
      />
    </div>
  )
}
