# Agent Instructions — rrweb (Sentry fork)

Published as `@sentry/*`. Main branch: `sentry-v2`.

## Package Manager

Use **pnpm** (12): `pnpm install`, `pnpm build:all`, `pnpm test`

## Monorepo Layout

- `packages/rrweb` — Core record & replay
- `packages/rrweb-snapshot` — DOM serializer
- `packages/types` — Shared TypeScript types
- `packages/rrdom`, `packages/record`, `packages/replay`, `packages/rrweb-player`
- `packages/plugins/*` — Console, canvas-webrtc, sequential-id

## File-Scoped Commands

Run from package directory (`cd packages/<pkg>`):

| Task      | Command                       |
| --------- | ----------------------------- |
| Build     | `pnpm build`                  |
| Test      | `pnpm test`                   |
| Typecheck | `pnpm check-types`            |
| Lint      | `pnpm oxlint path/to/file.ts` |

### packages/rrweb E2E

- `pnpm test:headless` — Build + Puppeteer (headless)
- `pnpm retest` — Run without rebuilding

## Build Notes

- `pnpm build:all` before cross-package work (Turborepo ordering)
- Tests in `packages/rrweb` require build first (`test:headless` handles this)
- Vitest is the test runner; E2E uses Puppeteer

## Key Conventions

- ES modules (`"type": "module"`), dual CJS/ESM via Vite
- Style: `.oxlintrc.json` + `.oxfmtrc.json` (don't duplicate rules here)
- No changesets: Craft generates `CHANGELOG.md` from PR titles at release

## Commit Attribution

AI commits MUST include:

```
Co-Authored-By: <agent name and model> <noreply@anthropic.com>
```
