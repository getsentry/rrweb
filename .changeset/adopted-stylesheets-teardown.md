---
"@sentry/rrweb": patch
---

Don't throw when stopping a recording after another script locked `adoptedStyleSheets`, and keep running the remaining cleanup steps when one of them throws.
