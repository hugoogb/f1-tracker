# Frontend Caching + Ingest-Triggered Revalidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cache all frontend data fetches with a 1-day ISR fallback and a single `f1-data` tag, and add a secret-protected route the ingest workflow purges after each run so data refreshes instantly after a race.

**Architecture:** Add Next.js cache directives (`next: { revalidate, tags }`) at the single `fetchApi` chokepoint. Add a Bearer-secret-protected `POST /api/revalidate` route handler that calls `revalidateTag('f1-data')`. The existing scheduled ingest workflow calls that route after a successful ingest. Time-based TTL backstops a failed purge.

**Tech Stack:** Next.js 16 (App Router, route handlers, `next/cache`), TypeScript, Node `crypto.timingSafeEqual`, GitHub Actions, `curl`.

**Note on testing:** This project has **no frontend test harness** (CI runs lint/typecheck/build only), and the spec explicitly defers adding one. Verification gates below use `pnpm typecheck`, `pnpm build`, and manual `curl` instead of unit tests. All commands run from `apps/web/` unless stated otherwise.

---

### Task 1: Add cache constants and wire them into `fetchApi`

**Files:**
- Modify: `apps/web/lib/constants.ts`
- Modify: `apps/web/lib/api.ts:1-17`

- [ ] **Step 1: Add the two constants**

In `apps/web/lib/constants.ts`, add after the `API_BASE_URL` line (line 1):

```ts
// Cache TTL fallback (1 day). Real freshness comes from tag-busting on ingest;
// this is just a backstop if the revalidate webhook ever fails.
export const REVALIDATE_SECONDS = 86400
export const F1_DATA_TAG = 'f1-data'
```

- [ ] **Step 2: Apply cache options in `fetchApi`**

Replace the import line and the `fetch` call in `apps/web/lib/api.ts` (lines 1-17). The full new top of the file:

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
- `...options?.next` lets any future call override the defaults.
- Next.js augments the global `RequestInit` type to include `next`, so this type-checks.

- [ ] **Step 3: Verify types**

Run: `pnpm typecheck`
Expected: PASS (exit 0, no errors).

- [ ] **Step 4: Verify lint + format**

Run: `pnpm lint && pnpm format:check`
Expected: PASS. If format fails, run `pnpm format` then re-check.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/constants.ts apps/web/lib/api.ts
git commit -m "feat(web): cache API fetches with 1-day ISR + f1-data tag"
```

---

### Task 2: Add the secret-protected revalidate route handler

**Files:**
- Create: `apps/web/app/api/revalidate/route.ts`

- [ ] **Step 1: Create the route handler**

Create `apps/web/app/api/revalidate/route.ts` with exactly:

```ts
import { revalidateTag } from 'next/cache'
import { timingSafeEqual } from 'node:crypto'
import { F1_DATA_TAG } from '@/lib/constants'

export const runtime = 'nodejs'

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}

export async function POST(request: Request) {
  const secret = process.env.REVALIDATE_SECRET
  const auth = request.headers.get('authorization')
  const provided = auth?.startsWith('Bearer ') ? auth.slice(7) : ''

  if (!secret || !provided || !safeEqual(provided, secret)) {
    return Response.json({ revalidated: false }, { status: 401 })
  }

  revalidateTag(F1_DATA_TAG)
  return Response.json({ revalidated: true, tag: F1_DATA_TAG })
}
```

- [ ] **Step 2: Verify types**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Verify the production build compiles the route**

Run: `pnpm build`
Expected: PASS. The build output lists a route for `/api/revalidate` (under the ƒ / dynamic route section).

- [ ] **Step 4: Manual auth check (local)**

In one terminal: `REVALIDATE_SECRET=testsecret pnpm dev`
In another terminal run both:

```bash
# Missing/wrong secret → 401
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3000/api/revalidate
# Expected: 401

# Correct secret → 200 + JSON body
curl -s -X POST http://localhost:3000/api/revalidate -H "Authorization: Bearer testsecret"
# Expected: {"revalidated":true,"tag":"f1-data"}
```

Stop the dev server when done.

- [ ] **Step 5: Verify lint + format**

Run: `pnpm lint && pnpm format:check`
Expected: PASS (run `pnpm format` first if needed).

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/api/revalidate/route.ts
git commit -m "feat(web): add secret-protected /api/revalidate route"
```

---

### Task 3: Wire the cache purge into the ingest workflow + document config

**Files:**
- Modify: `.github/workflows/ingest.yml` (append a step to the `ingest` job, after the "Validate data" step)
- Modify: `.env.example`
- Modify: `docs/DEPLOYMENT.md`

- [ ] **Step 1: Add the purge step to the workflow**

In `.github/workflows/ingest.yml`, the `ingest` job currently ends with:

```yaml
      - name: Validate data (informational)
        continue-on-error: true
        run: uv run python scripts/validate.py
```

Append immediately after it (same indentation, still inside `steps:`):

```yaml
      - name: Purge frontend cache
        continue-on-error: true # data is already in Neon; TTL backstops a failed purge
        working-directory: .
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

Note: `working-directory: .` overrides the job-level `defaults.run.working-directory: pipeline` so `curl` runs from the repo root (it doesn't depend on the directory, but this keeps it explicit).

- [ ] **Step 2: Validate the workflow YAML parses**

Run from repo root:

```bash
cd pipeline && uv run python -c "import yaml; yaml.safe_load(open('../.github/workflows/ingest.yml')); print('OK')"
```

Expected: `OK`.

- [ ] **Step 3: Add `REVALIDATE_SECRET` to `.env.example`**

In `.env.example`, replace the Next.js section (the last two lines) with:

```
# Next.js (baked into the bundle at build time — set before `pnpm build`)
NEXT_PUBLIC_API_URL=http://localhost:8000/api

# Shared secret for POST /api/revalidate (cache purge). Must match the Vercel env
# var and the REVALIDATE_SECRET GitHub Actions secret used by the ingest workflow.
REVALIDATE_SECRET=
```

- [ ] **Step 4: Document the secrets + cache behavior in DEPLOYMENT.md**

In `docs/DEPLOYMENT.md`, find the "Automated data updates (GitHub Actions → Neon)" section's **One-time setup** list. After its item 2 (the `NEON_DATABASE_URL` secret), add:

```markdown
3. Add two more repository secrets so the job can purge the frontend cache after
   ingest (optional — if unset, the job skips the purge and the 1-day cache TTL
   refreshes data instead):
   - `REVALIDATE_SECRET` — a random shared secret (e.g. `openssl rand -hex 32`).
   - `REVALIDATE_URL` — `https://<your-app>.vercel.app/api/revalidate`
   Set the **same** `REVALIDATE_SECRET` value as a Vercel environment variable so
   the route handler accepts the request.
```

Then, in the "Deploy the frontend (Vercel)" section's environment-variable table, add a row:

```markdown
| `REVALIDATE_SECRET`   | Same value as the GitHub `REVALIDATE_SECRET` secret |
```

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/ingest.yml .env.example docs/DEPLOYMENT.md
git commit -m "feat: purge frontend cache from ingest workflow"
```

---

### Task 4: Final end-to-end verification

**Files:** none (verification only)

- [ ] **Step 1: Full frontend gate**

From `apps/web/`:

```bash
pnpm lint && pnpm format:check && pnpm typecheck && pnpm build
```

Expected: all PASS; build output includes the `/api/revalidate` route.

- [ ] **Step 2: Confirm the working tree is clean**

Run from repo root: `git status --short`
Expected: empty (everything committed).

- [ ] **Step 3: Confirm commit history**

Run: `git log --oneline -4`
Expected: the three feature commits from Tasks 1-3 plus the spec commit are present.

---

## Self-Review

**Spec coverage:**
- ISR caching in `fetchApi` (1-day TTL, `f1-data` tag) → Task 1. ✓
- `apps/web/lib/constants.ts` exports `REVALIDATE_SECONDS`, `F1_DATA_TAG` → Task 1. ✓
- `/api/revalidate` route handler, Bearer secret, constant-time compare, Node runtime → Task 2. ✓
- Workflow purge step (env-passed secret, `continue-on-error`, no-op when URL unset) → Task 3. ✓
- `.env.example` + `DEPLOYMENT.md` config docs → Task 3. ✓
- Verification via typecheck/build/curl, no Vitest → Tasks 1-4. ✓
- Rollout safe before secrets exist (purge no-ops) → Task 3 Step 1 guard. ✓

**Placeholder scan:** No TBD/TODO; all code blocks complete; all commands have expected output.

**Type/name consistency:** `F1_DATA_TAG` / `REVALIDATE_SECONDS` defined in Task 1 and reused in Task 2; `REVALIDATE_SECRET` / `REVALIDATE_URL` consistent across Tasks 2-3 (route env var, `.env.example`, workflow, docs). `safeEqual` defined and used within Task 2. ✓
