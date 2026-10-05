---
"rrweb-snapshot": patch
"rrweb": patch
---

Fall back to the window's own `setTimeout`, `clearTimeout` and `requestAnimationFrame` when the implementation taken from the sandbox iframe throws (e.g. `NS_ERROR_NOT_INITIALIZED` in Firefox).
