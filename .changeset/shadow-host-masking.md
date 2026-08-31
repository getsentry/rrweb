---
"rrweb-snapshot": patch
"rrweb": patch
---

Fix masking and blocking not propagating from a shadow host into its shadow root

`distanceToMatch` stopped its ancestor walk at the shadow boundary, so a `maskTextSelector`/`maskTextClass` or `blockSelector`/`blockClass` match on an open shadow host was never seen by nodes inside that host's shadow root. Text, attribute mutations, and input values inside the shadow tree were recorded unmasked. The walk now steps from a shadow root onto its host, which also makes unmask/unblock selectors inside a shadow root resolve against a matched host.
