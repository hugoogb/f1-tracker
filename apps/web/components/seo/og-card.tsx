import { SITE_NAME, THEME_COLOR } from '@/lib/seo'

/**
 * Shared chrome for every social card — the root one in `app/opengraph-image.tsx`
 * and the per-entity ones under the detail routes.
 *
 * Satori (what `next/og` renders with) only implements a subset of CSS: no
 * grid, no floats, flexbox only, and every element with more than one child
 * needs an explicit `display: 'flex'`. Keep setting it everywhere below, even
 * on single-`<span>` wrappers — a missing one silently collapses the layout.
 *
 * Every card is 1200x630 PNG, but each route repeats that as its own literal
 * `size`/`contentType` export rather than importing one from here: Next reads a
 * metadata route's exports by static analysis at build time, and an imported
 * identifier fails the build with "Invalid segment configuration export".
 */

/**
 * The F1 Tracker mark, inlined rather than fetched from `/icon.svg`.
 *
 * The root card is rendered during the build, when the site is not yet serving
 * requests; the per-entity cards render per request but still cannot reliably
 * reach their own origin (the deployment alias, preview protection and the
 * absence of a public origin during a build all get in the way). An inlined
 * data URI sidesteps the whole question.
 */
export const MARK = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="112" fill="#E10600"/><g transform="translate(167.5,150) skewX(-12)" fill="#fff"><path d="M0 0h118v46H46v38h96v42H46v86H0z"/><path d="M222 212h-46V52l-36 18V26L186 0h36z"/></g></svg>`

export const MARK_SRC = `data:image/svg+xml;base64,${Buffer.from(MARK).toString('base64')}`

const INK = '#F2F2F2'
const MUTED = '#9C9C9C'
const DIM = '#7E7E7E'
const BACKDROP = '#0A0A0A'

/**
 * Words that are keys on `Object.prototype`.
 *
 * Satori keys its word-measurement cache on a plain object, so a word that is
 * already a key of `Object.prototype` resolves to the inherited value instead
 * of a miss, and the word renders as blank space while still reserving its
 * width. "constructor" is the one this site trips over constantly — it is half
 * the vocabulary of the sport. Measured, not theorised: rendering the literal
 * lowercase word drops it from the image entirely.
 *
 * Fixed copy dodges it by being uppercase ("CONSTRUCTOR" is a different cache
 * key) or plural ("constructors"), but a team name or an API string can carry
 * the bare word, so anything dynamic goes through `satoriText()`.
 */
const UNSAFE_WORDS = Object.getOwnPropertyNames(Object.prototype)

/** Matches any of the above as a whole lowercase word. */
const UNSAFE_RE = new RegExp(`\\b(${UNSAFE_WORDS.join('|')})\\b`, 'g')

/**
 * A zero-width no-break space: invisible, and — measured — given no advance
 * width by Satori's layout, unlike U+2060 (leaves a gap) or U+00AD (draws a
 * hyphen).
 */
const INVISIBLE_SEPARATOR = '\uFEFF'

/**
 * Makes text safe to put in front of Satori's word cache.
 *
 * Slipping an invisible separator in before the word's last character changes
 * the cache key ("constructo\uFEFFr") without changing what a reader sees. It
 * has to go *inside* the word: appending it after the word leaves "constructor"
 * as its own token and the word still vanishes.
 */
export function satoriText(text: string): string {
  return text.replace(
    UNSAFE_RE,
    (word) => `${word.slice(0, -1)}${INVISIBLE_SEPARATOR}${word.slice(-1)}`,
  )
}

/** A stat tile: a big number over a small caption. */
export interface OgStat {
  label: string
  value: string | number
}

export interface OgCardProps {
  /** Small caption above the title — "DRIVER", "SEASON", "GRAND PRIX". */
  eyebrow: string
  title: string
  /** One line under the title: nationality, location, the champion's name. */
  subtitle?: string | null
  /** A second, dimmer line — dates, round numbers, a podium. */
  meta?: string | null
  /** Up to six tiles along the bottom. */
  stats?: OgStat[]
  /** Accent for the rule and the eyebrow; defaults to the brand red. */
  accent?: string | null
}

/** Long names have to shrink or they wrap into the subtitle. */
function titleSize(title: string): number {
  if (title.length > 34) return 54
  if (title.length > 24) return 64
  return 74
}

/**
 * Tiles usually hold a count, which wants to be big. A race card puts a
 * podium in them instead, and three surnames at 44px run off the canvas — so
 * the row shrinks as soon as any value stops being a short number.
 */
function statValueSize(stats: OgStat[]): number {
  const longest = Math.max(...stats.map((stat) => String(stat.value).length))
  if (longest > 9) return 28
  if (longest > 5) return 34
  return 44
}

export function OgCard({ eyebrow, title, subtitle, meta, stats = [], accent }: OgCardProps) {
  const color = readableAccent(accent ?? THEME_COLOR)
  const tileSize = statValueSize(stats)

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        background: BACKDROP,
        backgroundImage: `radial-gradient(900px 520px at 84% 10%, ${hexToRgba(color, 0.34)}, transparent 70%)`,
        padding: '56px 72px',
        color: INK,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          width: '100%',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          {/* Satori renders to a PNG, so next/image has nothing to optimise here. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img width={68} height={68} alt="" src={MARK_SRC} />
          <div style={{ display: 'flex', fontSize: 36, fontWeight: 700, letterSpacing: 4 }}>
            <span style={{ color: THEME_COLOR }}>F1</span>
            {/* Non-breaking: Satori collapses ordinary whitespace at a span
                boundary, and an ordinary space here renders as "F1TRACKER". */}
            <span>{'\u00A0TRACKER'}</span>
          </div>
        </div>
        <div
          style={{
            display: 'flex',
            fontSize: 24,
            fontWeight: 700,
            letterSpacing: 5,
            color,
          }}
        >
          <span>{eyebrow.toUpperCase()}</span>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <div
          style={{
            display: 'flex',
            fontSize: titleSize(title),
            fontWeight: 700,
            letterSpacing: -1,
            lineHeight: 1.1,
          }}
        >
          {satoriText(title)}
        </div>
        {subtitle ? (
          <div style={{ display: 'flex', marginTop: 18, fontSize: 32, color: MUTED }}>
            {satoriText(subtitle)}
          </div>
        ) : null}
        {meta ? (
          <div style={{ display: 'flex', marginTop: 8, fontSize: 27, color: DIM }}>
            {satoriText(meta)}
          </div>
        ) : null}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', height: 4, width: '100%', background: color }} />
        {stats.length > 0 ? (
          <div style={{ display: 'flex', gap: 54, marginTop: 26 }}>
            {stats.map((stat) => (
              <div key={stat.label} style={{ display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', fontSize: tileSize, fontWeight: 700 }}>
                  {satoriText(String(stat.value))}
                </div>
                <div style={{ display: 'flex', fontSize: 21, letterSpacing: 3, color: DIM }}>
                  <span>{stat.label.toUpperCase()}</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div
            style={{ display: 'flex', marginTop: 26, fontSize: 24, letterSpacing: 3, color: DIM }}
          >
            <span>{SITE_NAME.toUpperCase()}</span>
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * The card shown when the API is unreachable or the entity has gone.
 *
 * A metadata route that throws hands a social scraper a broken image, and the
 * page itself already distinguishes 404 from an outage via `isNotFound()` — the
 * image must never be the thing that decides. So it degrades to branded chrome
 * rather than failing.
 */
export function OgFallbackCard({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <OgCard
      eyebrow={eyebrow}
      title={title}
      subtitle="Every Grand Prix since 1950"
      meta="Standings, race results, records and head-to-head comparisons."
    />
  )
}

/**
 * Lightens a colour just far enough to read against the card's near-black
 * background, keeping its hue and saturation.
 *
 * This is not a second palette and never changes what colour a team *is* — the
 * backend palette stays the only source of that. It is a rendering adjustment
 * for one surface: the card is drawn on #0A0A0A, and the palette holds liveries
 * like Lotus's #1A1A1A and Brabham's #003300, which land within a hair of the
 * background and would put the eyebrow and the rule on an invisible colour.
 *
 * The test is contrast, not lightness, and the loop stops at the first step
 * that passes, so a colour is nudged rather than blown out. Brand red already
 * clears 3:1 on this background and comes back untouched.
 */
function readableAccent(color: string): string {
  const rgb = parseHex(color)
  if (!rgb) return color

  const [h, s, l] = rgbToHsl(rgb)
  for (let lightness = l; lightness <= 0.78; lightness += 0.02) {
    const candidate = lightness === l ? color : hslToHex(h, s, lightness)
    if (contrast(candidate, BACKDROP) >= MIN_ACCENT_CONTRAST) return candidate
  }
  return hslToHex(h, s, 0.78)
}

/** WCAG's floor for large text and non-text UI, which is what an accent is. */
const MIN_ACCENT_CONTRAST = 3

/** WCAG relative-luminance contrast ratio between two hex colours. */
function contrast(a: string, b: string): number {
  const [la, lb] = [luminance(a), luminance(b)]
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

function luminance(hex: string): number {
  const rgb = parseHex(hex) ?? [0, 0, 0]
  const [r, g, b] = rgb.map((channel) => {
    const v = channel / 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** `#RRGGBB` to `[r, g, b]` (0-255), or null if it is not a plain hex colour. */
function parseHex(hex: string): [number, number, number] | null {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!match) return null
  const value = parseInt(match[1], 16)
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255]
}

function rgbToHsl([r, g, b]: [number, number, number]): [number, number, number] {
  const [rf, gf, bf] = [r / 255, g / 255, b / 255]
  const max = Math.max(rf, gf, bf)
  const min = Math.min(rf, gf, bf)
  const l = (max + min) / 2
  const span = max - min
  if (span === 0) return [0, 0, l]
  const s = l > 0.5 ? span / (2 - max - min) : span / (max + min)
  const h =
    max === rf
      ? ((gf - bf) / span + (gf < bf ? 6 : 0)) / 6
      : max === gf
        ? ((bf - rf) / span + 2) / 6
        : ((rf - gf) / span + 4) / 6
  return [h, s, l]
}

function hslToHex(h: number, s: number, l: number): string {
  const channel = (n: number) => {
    const k = (n + h * 12) % 12
    const a = s * Math.min(l, 1 - l)
    const v = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))
    return Math.round(v * 255)
  }
  return `#${[channel(0), channel(8), channel(4)].map((v) => v.toString(16).padStart(2, '0')).join('')}`
}

/** `#RRGGBB` to `rgba(...)`, so the backdrop glow can take the team colour. */
function hexToRgba(hex: string, alpha: number): string {
  const rgb = parseHex(hex)
  if (!rgb) return `rgba(225,6,0,${alpha})`
  return `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha})`
}
