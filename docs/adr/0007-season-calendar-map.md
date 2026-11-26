# 0007 — Season calendar map

The cinematic calendar map (`components/seasons/season-calendar-*`). The canvas-not-vector-layers rule, `zoomSnap: 0`, the `Playhead` store and the reduced-motion behaviour are in `CLAUDE.md`.

### One-finger drags scroll the page on touch screens

Where: `apps/web/components/seasons/season-calendar-canvas.tsx` — `SeasonCalendarCanvas` (`dragging={!touch}`)

Map dragging is turned off on touch devices so a one-finger drag scrolls the page instead of panning the map; two fingers still pan and pinch-zoom it.

### The canvas is re-pinned to the viewport on every draw

Where: `apps/web/components/seasons/season-calendar-canvas.tsx` — `CalendarLayer` (`draw`)

The canvas lives in a Leaflet pane, and the pane moves while the map is dragged. Each draw therefore repositions the canvas to the viewport origin so it always covers what is visible.

### Chase camera hand-over and landing

Where: `apps/web/components/seasons/season-calendar-canvas.tsx` — `CameraController`, `Follow`; `apps/web/components/seasons/season-calendar-canvas.tsx` — `CameraController`; `apps/web/components/seasons/season-calendar-canvas.tsx` — `CameraController` (chase)

The chase is computed on one world copy (`shift`, the copy nearest the camera when the leg starts) so the camera never jumps a world width on a leg that crosses the antimeridian. A stop command is skipped when the camera is already within 2 px and 0.05 zoom of the target, because a chased leg lands exactly on its stop and flying to the same view would only restart the clock and stutter. On landing the chase sets the view exactly on the stop and clears itself, so the arrival command finds the camera already there and has nothing to fly. The chase abandons a leg as soon as the playhead is no longer on it (a seek), leaving the stop command to move the camera. The chase blends from the camera's view at the start of the leg (a dwell zoom, a user's pan) to the glyph over the first quarter of the leg, so the hand-over never jumps. Each chase frame calls `setView` with `reset: true`, because Leaflet's normal pan path truncates to whole pixels and makes a slow chase shimmer.

### Camera commands depend on stop positions, not statuses

Where: `apps/web/components/seasons/season-calendar-canvas.tsx` — `CameraController` (`positions`)

The camera effect depends on the stops' coordinates only, because round statuses change by the minute and would otherwise re-fire a flight every time one flips.

### Marker elements are reused across status changes

Where: `apps/web/components/seasons/season-calendar-canvas.tsx` — `StopMarker` (`icon`)

A marker's `divIcon` is rebuilt when its status or focus changes, and Leaflet reuses the existing element for the new icon, so keyboard focus and the `aria-label` set on it survive the change.

### Round statuses are computed from the clock floored to the minute

Where: `apps/web/components/seasons/season-calendar-map.tsx` — `SeasonCalendarMap` (`minute`, `progress`)

Round statuses are derived from `useNow()` floored to the minute, so the map re-renders only when a status actually changes rather than on every clock tick.

### Leg progress is kept apart from the playhead

Where: `apps/web/components/seasons/season-calendar-map.tsx` — `legProgress`

The playhead holds the eased position, so a ref holds linear progress through the current leg; a pause mid-flight resumes from exactly where it stopped.

### Timeline decoration is inset by the thumb radius

Where: `apps/web/components/seasons/season-calendar-map.tsx` — `Timeline`

The drawn dots and leg segments sit inside a 9px inset, the native range thumb's radius, so dot i lines up exactly under value i.

### Projection clamps latitude like Leaflet

Where: `apps/web/components/seasons/season-calendar-projection.ts` — `MAX_LATITUDE`

The canvas projection clamps latitude to 85.0511287798, the same bound as Leaflet's SphericalMercator, so lines and land stay aligned with the Leaflet-placed markers.

### Projected longitude is never wrapped

Where: `apps/web/components/seasons/season-calendar-projection.ts` — `mercator`

`mercator` does not wrap longitude, so a path unwrapped past ±180° stays continuous on screen and runs onto the next world copy instead of jumping across the map.

### Travel runs at constant on-screen speed

Where: `apps/web/components/seasons/season-calendar-projection.ts` — `pointAt`, `ProjectedPath`

`pointAt` measures the fraction along the path by projected (on-screen) length, so the glyph moves at an even speed even where Mercator stretches the samples.

### Stop index is not the round number

Where: `apps/web/components/seasons/season-calendar-model.ts` — `CalendarStop.index`, `buildRoute`

A stop's `index` is its position in the list of plotted stops, not its round number, because rounds whose circuit has no coordinates are left off the map. Legs, the playhead and the camera all address stops by index.

### Season progress uses -1 for no next or previous race

Where: `apps/web/components/seasons/season-calendar-model.ts` — `SeasonProgress`

`next` and `previous` are stop indices, or -1 when there is none: `next` is -1 when the season is over or the clock is unknown, and `previous` is -1 outside a season in progress. `previous` is -1 outside a season in progress.

### Skeleton matches the loaded map's footprint

Where: `apps/web/components/seasons/season-calendar-map-wrapper.tsx` — `SeasonCalendarSkeleton`

The loading skeleton repeats the loaded map's heights (340, 440 and 520 px by breakpoint) and its strip and controls rows, so nothing below the map shifts when it arrives. Change the two together.

### Land layer lives in its own Leaflet pane

Where: `apps/web/components/circuits/world-map.tsx` — `Pane name="circuits-land"`

The landmass is drawn in a dedicated pane with a z-index below the overlay pane, because it arrives after a fetch and would otherwise be appended on top of the pins in the shared SVG.

### Great-circle legs are unwrapped across the antimeridian

Where: `apps/web/lib/geo.ts` — `greatCirclePath`

Longitudes are unwrapped so each point stays within 180 degrees of the previous one, which keeps a leg over the antimeridian one continuous line; the map draws every world copy, so it is never cut. The sample count scales with distance so a short hop is not drawn with as many vertices as an intercontinental one.

### Great-circle legs end on their markers

Where: `apps/web/lib/geo.ts` — `greatCirclePath`

The first point is the exact input and the last keeps the destination latitude, so the drawn line meets its markers; the last longitude stays unwrapped so the leg remains continuous.

### Longitudes are framed across the widest empty gap

Where: `apps/web/components/seasons/season-calendar-projection.ts` — `compactLongitudes`

Longitudes are shifted by whole turns so the calendar spans the narrowest window, starting just after the widest empty gap; a season that ends in the Americas and starts in Australia is framed across whichever of the Pacific or Europe leaves less empty map.

### The calendar intro is skipped when session storage is blocked

Where: `apps/web/components/seasons/season-calendar-map.tsx` — `introSeen`, `markIntroSeen`; `apps/web/components/seasons/season-calendar-map.tsx` — `markIntroSeen`

The home intro flight plays once per session, tracked in `sessionStorage`. When storage is blocked (private mode, sandboxed iframe) the intro counts as already seen, so it is skipped rather than replayed on every visit; failed writes are ignored. A failed write is ignored; `introSeen` already treats blocked storage as seen.
