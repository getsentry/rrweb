---
"rrweb-snapshot": patch
---

Clear the target document before rebuilding a full snapshot, so a `document.open()` that was skipped (e.g. after `window.stop()`) no longer leaves the previous rebuild in place and throws a HierarchyRequestError.
