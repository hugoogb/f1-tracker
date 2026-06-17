# Frontend Caching + Ingest-Triggered Revalidation — Design

**Date:** 2026-06-17
**Status:** Approved (pending spec review)
**Slice:** Point 3, slice 1 of 3 (frontend performance)

## Problem

`apps/web/lib/api.ts`'s `fetchApi` uses bare `fetch` with **no caching directives**
(no `next: { revalidate }`, no `cache`). Every server render hits the FastAPI
backend. In the free-tier deployment the backend runs on Render, which cold-starts
after 15 min of inactivity (30–60s). With no cache, those cold starts are exposed
to users on nearly every navigation, and the origin is hit far more than necessary
for data that is almost entirely static (historical F1 results).

## Goals

- Serve cached data for almost all requests; touch the origin rarely.
- Keep data fresh after a race weekend without manual intervention or a redeploy.
- Make the change small, centralized, and low-risk (single chokepoint already exists).

## Non-Goals

- Tiered/per-resource caching (historical vs current season, per-season tags). The
  ingest job does a full current-year refresh, so granular busting buys little.
  Explicitly deferred (YAGNI).
- A frontend test harness (Vitest/Jest). Not currently present; out of scope.
- Caching the client-side search typeahead (runs in the browser; `next` options are
  ignored there, and each query URL is already unique).

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Invalidation granularity | Single global tag `f1-data` | Ingest is a full current-year refresh; one tag is simplest and sufficient. |
| TTL fallback | 1 day (`86400s`) | Tag-busting handles real freshness; TTL is a safety net if the purge ever fails. Keeps origin hits minimal. |
| Purge transport | POST to a Next.js route handler, Bearer-secret auth | Workflow runs in GitHub Actions (cloud) and must reach Vercel; a secret-protected route is the standard pattern. |
| Purge failure handling | Non-blocking (`continue-on-error`) | Data is already in Neon; the 1-day TTL backstops a failed purge. |

## Architecture / Data Flow

```
Page (server component) ──► fetchApi() ──► FastAPI / Neon
                              │  next: { revalidate: 86400, tags: ['f1-data'] }
                              ▼
                     Next.js Data Cache (Vercel)

Ingest workflow (Mondays) ──► seed.py → Neon ──► POST /api/revalidate (Bearer secret)
                                                      │
                                                      ▼  revalidateTag('f1-data')
                                              Next.js purges cached data
```

Two freshness mechanisms working together:
- **Time-based** — 1-day `revalidate` as a backstop.
- **Event-based** — instant `revalidateTag` purge right after each successful ingest.

## Components

### a. `apps/web/lib/constants.ts`
Add two exports:
```ts
export const REVALIDATE_SECONDS = 86400 // 1 day — TTL fallback; real freshness comes from tag-busting
export const F1_DATA_TAG = 'f1-data'
```

### b. `apps/web/lib/api.ts`
`fetchApi` applies the Next.js cache options by default, allowing per-call override:
```ts
import { API_BASE_URL, REVALIDATE_SECONDS, F1_DATA_TAG } from './constants'

async function fetchApi<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    next: { revalidate: REVALIDATE_SECONDS, tags: [F1_DATA_TAG], ...options?.next },
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  })

  if (!res.ok) {
    throw new Error(`API error: ${res.status} ${res.statusText}`)
  }

  return res.json() as Promise<T>
}
```
Notes:
- `...options?.next` lets callers override (e.g. opt out for a dynamic call).
- `RequestInit` in Next.js is augmented with the `next` field; the call site type-checks.
- Client-side calls (search) ignore `next` — no behavior change.

### c. `apps/web/app/api/revalidate/route.ts` (new)
POST route handler (declares the Node runtime so `crypto.timingSafeEqual` is available):
```ts
import { revalidateTag } from 'next/cache'
import { F1_DATA_TAG } from '@/lib/constants'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const secret = process.env.REVALIDATE_SECRET
  const auth = request.headers.get('authorization')
  const provided = auth?.startsWith('Bearer ') ? auth.slice(7) : ''

  if (!secret || !provided || !timingSafeEqual(provided, secret)) {
    return Response.json({ revalidated: false }, { status: 401 })
  }

  revalidateTag(F1_DATA_TAG)
  return Response.json({ revalidated: true, tag: F1_DATA_TAG })
}
```
- `timingSafeEqual`: constant-time comparison (Node `crypto.timingSafeEqual` on equal-length
  buffers, with a length guard) to avoid timing side-channels.
- If `REVALIDATE_SECRET` is unset (e.g. local dev), the route returns 401 — purge disabled,
  which is correct for environments without the secret.

### d. `.github/workflows/ingest.yml`
Add a final step to the `ingest` job, after validation:
```yaml
- name: Purge frontend cache
  continue-on-error: true   # data is already in Neon; TTL backstops a failed purge
  env:
    REVALIDATE_URL: ${{ secrets.REVALIDATE_URL }}
    REVALIDATE_SECRET: ${{ secrets.REVALIDATE_SECRET }}
  run: |
    if [ -z "$REVALIDATE_URL" ]; then
      echo "REVALIDATE_URL not set — skipping cache purge"
      exit 0
    fi
    curl -fsS -X POST "$REVALIDATE_URL" -H "Authorization: Bearer $REVALIDATE_SECRET"
```
Secret passed via env (not `${{ }}` shell interpolation) to avoid injection.

### e. Config / docs
- `.env.example`: add `REVALIDATE_SECRET=` under the Next.js section, with a comment that it
  must also be set in Vercel and matched by the workflow secret.
- `docs/DEPLOYMENT.md`: document the two new GitHub secrets (`REVALIDATE_URL`,
  `REVALIDATE_SECRET`), the Vercel env var (`REVALIDATE_SECRET`), and how the cache + purge
  work.

## Error Handling & Edge Cases

- Failed origin responses are not cached (Next.js default); `fetchApi` still throws on `!res.ok`.
- Bad/missing Bearer secret → `401`; workflow step is `continue-on-error`, so a purge failure
  never fails ingestion. The 1-day TTL backstops it.
- `REVALIDATE_URL` unset in the workflow → step logs and exits 0 (no-op), so the feature can be
  rolled out before the Vercel deploy URL/secret exist.
- Local `next dev`: `revalidate`/tags are largely no-ops; local development behavior is unchanged.

## Testing / Verification

No frontend test harness exists (CI runs lint/typecheck/build only). Verification approach:
1. `pnpm typecheck` — confirms the `next` fetch option and route handler type-check.
2. `pnpm build` — confirms the route handler builds and pages compile.
3. Manual `curl` against the route handler (local or preview deploy):
   - No / wrong `Authorization` → `401 { revalidated: false }`.
   - Correct `Bearer` → `200 { revalidated: true, tag: 'f1-data' }`.

If automated tests are later desired, add Vitest + a single route-handler test (separate scope).

## Rollout

1. Merge the code changes (safe with no secrets set — purge step no-ops).
2. Set `REVALIDATE_SECRET` in Vercel (frontend) and as a GitHub Actions secret.
3. Set `REVALIDATE_URL` GitHub secret to `https://<app>.vercel.app/api/revalidate`.
4. Next ingest run purges the cache automatically.
