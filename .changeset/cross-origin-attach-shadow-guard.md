---
"rrweb": patch
---

Fix: guard cross-origin `Element` read in `ShadowDomManager.observeAttachShadow` so it no longer throws SecurityError/TypeError into the host page
