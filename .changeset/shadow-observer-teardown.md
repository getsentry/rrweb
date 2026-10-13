---
"@sentry/rrweb": patch
---

fix: disconnect shadow-DOM observers when their host is removed

Each observed shadow root previously kept a live `MutationObserver` (plus its mutation buffer) for the rest of the recording session, so repeatedly removing and recreating web components retained every detached shadow tree. Removed hosts now release their shadow observers and buffers once they are detached, while moved or reinserted hosts keep being observed.
