# Agent Instructions — rrweb (Sentry fork)

Published as `@sentry-internal/*`. Main branch: `sentry-v2`.

## Package Manager

Use **yarn** (v1): `yarn install`, `yarn build:all`, `yarn test`

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
| Build     | `yarn build`                  |
| Test      | `yarn test`                   |
| Typecheck | `yarn check-types`            |
| Lint      | `yarn eslint path/to/file.ts` |

### packages/rrweb E2E

- `yarn test:headless` — Build + Puppeteer (headless)
- `yarn retest` — Run without rebuilding

## Build Notes

- `yarn build:all` before cross-package work (Turborepo ordering)
- Tests in `packages/rrweb` require build first (`test:headless` handles this)
- Vitest is the test runner; E2E uses Puppeteer

## Key Conventions

- ES modules (`"type": "module"`), dual CJS/ESM via Vite
- Add changesets for user-facing changes: `yarn changeset`
- Style: `.eslintrc.js` + `.prettierrc` (don't duplicate rules here)

## Commit Attribution

AI commits MUST include:

```
Co-Authored-By: <agent name and model> <noreply@anthropic.com>
```
