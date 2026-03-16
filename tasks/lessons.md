# F1 Tracker - Lessons Learned

## Next.js 16

- **Build requires `NODE_ENV=production`**: Next.js 16.1.6 has a bug where `_global-error` prerendering fails with `TypeError: Cannot read properties of null (reading 'useContext')` if `NODE_ENV` is set to `development` during build. Workaround: prefix build script with `NODE_ENV=production`.
- **Duplicate lockfiles**: When using pnpm workspaces, `create-next-app` generates its own `pnpm-lock.yaml` inside the app directory. Delete it to avoid "multiple lockfiles detected" warnings.

## TypeScript + Promise.allSettled

- **Don't use dynamic indexing**: `results[idx].value` won't narrow types. Instead use named destructuring: `const [fooResult, barResult] = await Promise.allSettled([...])` with explicitly typed promises.
- **Reject non-applicable promises**: For conditional fetches (e.g. sprint data only for 2021+), use `Promise.reject('not applicable')` rather than `undefined` to keep the allSettled array consistent.

## Recharts

- **Tooltip formatter typing**: Don't type-narrow the `value` param in Recharts Tooltip `formatter`. Use `(value) => [String(value), 'Label']` instead of `(value: number) => [value, 'Label']`. The Recharts types expect `ValueType | undefined`.

## Backend / Frontend Alignment

- **Field name consistency**: Always verify backend response field names match frontend type definitions. Example: backend used `championshipPosition` but frontend types initially had `position`. Check the actual API response shape before defining TypeScript types.

## Testing

- **SQLite in-memory with FastAPI TestClient**: Must use `StaticPool` from SQLAlchemy to share the same in-memory DB connection across threads. Without it, the TestClient's thread gets a different connection where tables don't exist.
- **Exclude Alembic from ruff**: Auto-generated migration files have style issues (trailing whitespace, old Union syntax, long lines). Add `extend-exclude = ["alembic"]` to `[tool.ruff]`.

## Monorepo / Lint-Staged

- **eslint in workspace**: `eslint --fix` in root lint-staged config fails because `eslint` is only installed in `apps/web/`. Either use `pnpm --filter web lint` (but that runs a script, not a file-scoped command), or just run Prettier in pre-commit and leave eslint for CI.

## Pre-commit Hooks

- **Husky paths are repo-root-relative**: `git diff --cached --name-only` returns paths like `pipeline/tests/conftest.py`. If the hook does `cd pipeline` before running ruff, those paths won't resolve. Fix: filter with `-- 'pipeline/**/*.py'` and strip the prefix with `sed 's|^pipeline/||'` before passing to ruff.

## Backend Architecture

- **Shared serializers prevent dict drift**: Inline `{"id": d.id, "ref": d.ref, ...}` dicts across 8+ routers diverge over time. A central `serializers.py` with `driver_summary()`, `driver_detail()`, `constructor_compact()` etc. ensures consistency and makes field changes atomic.
- **Generic pagination reduces boilerplate**: A `paginate(db, query, count_query, page, page_size, serializer)` helper replaces repetitive offset/limit/count/serialize logic across list endpoints.
- **Constants file for magic numbers**: `DEFAULT_PAGE_SIZE`, `MAX_PAGE_SIZE`, `SEARCH_MIN_LENGTH`, etc. in `constants.py` prevents silent inconsistencies when the same limit appears in multiple routers.

## SQL Performance

- **Window functions over Python loops**: Replacing Python position calculation (O(drivers x laps) loop) with SQL `SUM() OVER (PARTITION BY driver ORDER BY lap)` + `RANK() OVER (PARTITION BY lap ORDER BY cumulative_time)` moves the work to the database. The query also uses a subquery to find the max consecutive valid lap per driver (stopping at first NULL time) via `COALESCE(MIN(lap).FILTER(time IS NULL) - 1, MAX(lap))`.
