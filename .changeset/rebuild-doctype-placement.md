---
"rrweb-snapshot": patch
---

Keep a single doctype before the root element when rebuilding a full snapshot, instead of throwing a HierarchyRequestError when the snapshot's doctype is out of order or duplicated.
