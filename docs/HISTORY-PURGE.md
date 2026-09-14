# History purge runbook

A one-off rewrite that strips the seed database dumps and the removed image
assets out of every commit. Run once; kept here because the same steps apply if
a large binary is ever committed again by accident.

## Why

`git clone` was downloading **52.6 MiB** for a project whose entire working tree
is about 5 MB. Three paths accounted for ~51 MB of it:

| Path | In history | Versions | In current tree |
|---|---:|---:|---|
| `docker/backups/latest.sql.gz` | 48.98 MB | 16 | yes (until this) |
| `apps/web/public/headshots/` | 1.47 MB | 106 | no |
| `apps/web/public/logos/` | 0.83 MB | 52 | no |

The dump is gzipped, so git cannot delta-compress it: every refresh stored a
whole new ~5 MB copy permanently rather than a diff. Deleting a file does not
shrink a repository — the blob stays reachable from the commit that added it —
so the sixteen superseded dumps and both image directories were still in every
clone despite being long gone from the tree.

The images matter for more than size. `4cb10e1` removed driver headshots and
team logos from the tree for licensing reasons (see `ATTRIBUTIONS.md`), but
until this rewrite the repository still shipped them to anyone who cloned it.

## What replaces the dump

It is published as an asset on one rolling release tag (`seed`) instead of being
tracked:

```bash
./scripts/seed-fetch.sh                      # download it  (pnpm db:seed:fetch)
./scripts/db-backup.sh --remote --publish    # replace it   (pnpm db:seed:publish)
```

`bootstrap.sh` fetches it automatically when `docker/backups/latest.sql.gz` is
absent, so a fresh clone is still a one-command setup. The tag is rolling so the
download URL is a constant — no API call and no token on a fresh clone — and
`.gitignore` now covers `docker/backups/*` so the dump cannot drift back in.

## Procedure

Order matters. The rewrite must come last, because it rewrites every commit:
anything still open against the old history — an unmerged branch, a pending pull
request — is stranded on commits that no longer exist.

**1. Publish the seed.** The rewrite removes the dump from history, so the
release asset has to exist before anyone clones the rewritten repository.

```bash
./scripts/db-backup.sh --remote --publish
```

Confirm it is actually fetchable before going further — this is the step that
keeps `bootstrap.sh` working for a fresh clone:

```bash
mv docker/backups/latest.sql.gz /tmp/seed-backup.sql.gz   # keep a copy
./scripts/seed-fetch.sh && ./scripts/db-restore.sh
```

**2. Merge the branch that untracks it.** The commit removing
`docker/backups/latest.sql.gz` from the index and adding `seed-fetch.sh` has to
be on `master` first. Rewriting first and merging afterwards would rebase the
pull request onto history that no longer exists.

**3. Rewrite**, on a **fresh mirror** rather than a working clone — a mirror has
no working tree to clobber and carries every ref, so nothing is left pointing at
old history:

```bash
uv tool install git-filter-repo

git clone --mirror git@github.com:hugoogb/f1-tracker.git /tmp/f1-purge
./scripts/purge-history.sh /tmp/f1-purge
```

The script prints the before/after pack size and then verifies that no matching
blob survives in any ref, failing rather than reporting success if one does.
Expect **52.60 MiB → 1.58 MiB**.

**4. Inspect before publishing:**

```bash
git -C /tmp/f1-purge log --oneline -5 master
git -C /tmp/f1-purge ls-tree -r master --name-only | wc -l    # expect 430
git -C /tmp/f1-purge fsck
```

**5. Publish:**

```bash
git -C /tmp/f1-purge push --force --mirror origin
```

`--mirror` pushes every ref, so branches that are not `master` move to their
rewritten equivalents too rather than being left behind on old history.

## What changes

Nine commits disappear, because after removing those paths they contained
nothing at all:

```
d538204 chore(data): refresh the seed dump
9f51d8e chore(data): refresh the seed dump from production
5d5366e chore(data): refresh seed backup with reconciled 2026 schedule
349ad87 chore(data): refresh seed backup with 2026 race data
c43c66e feat: update backup
9836619 feat: update last db backup
f7ccb24 feat: add Doohan headshot image to public assets
27f7b3b feat: update latest database backup file
9a4c667 feat: update latest database backup
```

Every one is a pure data or asset commit. No commit carrying code is lost, and
`master`'s tree is byte-identical apart from the removed paths.

Every other commit gets a **new SHA**, because rewriting any commit rewrites all
of its descendants.

## Afterwards

Old clones cannot be fast-forwarded onto the new history — re-clone them:

```bash
cd .. && rm -rf f1-tracker && git clone git@github.com:hugoogb/f1-tracker.git
cd f1-tracker && ./scripts/bootstrap.sh
```

Anything referring to a pre-rewrite SHA points at a commit that no longer
exists. That includes merged pull requests, whose commits GitHub keeps
reachable via `refs/pull/*` — the PR pages still render, but their commits are
detached from `master`'s new history, and GitHub may serve the old objects for
some time until it runs its own maintenance. That is cosmetic; a fresh clone
gets only the rewritten history.

Deploys are unaffected: `deploy.yml` builds from whatever `master` points at,
and nothing in the pipeline pins a commit SHA.
