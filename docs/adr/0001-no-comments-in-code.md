# 0001 — No comments in code

### Code carries no comments

Where: `apps/web/eslint-rules/no-comments.mjs`, `apps/web/eslint.config.mjs` — `local/no-comments`

Source files carry no comments. Code says what it does through names and types; a non-obvious constraint or choice goes into an ADR section in `docs/adr/`, with a `Where:` line naming the file and symbol; a shortcut taken knowingly goes into a GitHub issue. A rule that every contributor must know belongs in `CLAUDE.md`, which is not repeated here.

### Directives are allowed

Where: `apps/web/eslint-rules/no-comments.mjs` — `DIRECTIVES`

Comments that a tool reads are not comments: `eslint-disable*`/`eslint-enable`/`eslint-env`, `global`/`exported`, `@ts-expect-error`/`@ts-ignore`/`@ts-nocheck`/`@ts-check`, `/// <reference`, `prettier-ignore`, `@__PURE__`, `@vitest-environment`, and shebangs. A new marker that a tool needs is added to `DIRECTIVES`.

### The ratchet

Where: `apps/web/eslint-suppressions.json`

ESLint's bulk suppressions hold any comment still left in the web app. The count only ever shrinks: after deleting comments, run `pnpm lint:prune` (`eslint . --prune-suppressions` in `apps/web`), or `pnpm lint` fails with "There are suppressions left that do not occur anymore". Never pass `--suppress-rule` again; it is for the one-time baseline only. The baseline is listed in `.prettierignore` because ESLint writes it in its own format.

### Python and shell have no ratchet

Where: `pipeline/`, `scripts/`, `.husky/pre-commit`

Ruff has no rule against comments, and shell has no linter in CI, so the ban there is a convention kept in review. Directives stay (`# noqa`, `# type: ignore`, `# shellcheck`, shebangs). Python docstrings are documentation and are not covered by the ban.
