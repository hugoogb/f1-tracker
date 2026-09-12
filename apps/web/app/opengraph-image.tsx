import { ImageResponse } from 'next/og'
import { SITE_NAME } from '@/lib/seo'

export const alt = `${SITE_NAME} — Formula 1 history, stats and analytics`
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

// Inlined rather than fetched from /icon.svg: the image is rendered during the
// build, when the site is not yet serving requests.
const MARK = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="112" fill="#E10600"/><g transform="translate(167.5,150) skewX(-12)" fill="#fff"><path d="M0 0h118v46H46v38h96v42H46v86H0z"/><path d="M222 212h-46V52l-36 18V26L186 0h36z"/></g></svg>`

const SECTIONS = ['Seasons', 'Drivers', 'Constructors', 'Circuits', 'Records', 'Compare']

export default function OpengraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        background: '#0A0A0A',
        backgroundImage:
          'radial-gradient(900px 520px at 84% 10%, rgba(225,6,0,0.32), transparent 70%)',
        padding: '60px 72px',
        color: '#F2F2F2',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 26 }}>
        <img
          width={92}
          height={92}
          alt=""
          src={`data:image/svg+xml;base64,${Buffer.from(MARK).toString('base64')}`}
        />
        <div style={{ display: 'flex', fontSize: 52, fontWeight: 700, letterSpacing: 5 }}>
          <span style={{ color: '#E10600' }}>F1</span>
          <span>{' TRACKER'}</span>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', fontSize: 66, fontWeight: 700, letterSpacing: -1 }}>
          {'Every Grand Prix since 1950'}
        </div>
        {/* Satori keys its word-measurement cache on a plain object, so the
              literal word "constructor" resolves to Object.prototype and renders
              as blank space — keep it plural here. */}
        <div style={{ display: 'flex', marginTop: 20, fontSize: 31, color: '#9C9C9C' }}>
          {'Standings, race results, records and head-to-head comparisons'}
        </div>
        <div style={{ display: 'flex', marginTop: 6, fontSize: 31, color: '#9C9C9C' }}>
          {'for all drivers, constructors and circuits in Formula 1 history.'}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', height: 4, width: '100%', background: '#E10600' }} />
        <div
          style={{
            display: 'flex',
            gap: 34,
            marginTop: 24,
            fontSize: 25,
            color: '#7E7E7E',
            letterSpacing: 3,
          }}
        >
          {SECTIONS.map((section) => (
            <span key={section}>{section.toUpperCase()}</span>
          ))}
        </div>
      </div>
    </div>,
    size,
  )
}
