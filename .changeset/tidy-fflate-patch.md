---
"@sentry/rrweb": patch
"@sentry/rrweb-packer": patch
---

Bump `fflate` to `^0.4.9` to patch an infinite loop in `unzipSync` on malformed ZIP64 archives (GHSA advisory, Dependabot #319).
