---
"rrweb": patch
---

Fix mutation buffers staying locked when a full snapshot fails

`takeFullSnapshot` locked every mutation buffer, serialized the document, then unlocked. The unlock was not protected, so a throw from `snapshot()` or a falsy return left the buffers locked forever. `MutationBuffer.emit()` exits early while locked, so the recorder silently dropped every later DOM mutation for the rest of the page lifetime. The locked region now unlocks in a `finally`.

On a failed snapshot the buffered mutations describe a document the consumer never received, so they are discarded rather than emitted against unknown node ids. A failed checkout also restarts the checkout clock. Before, `lastFullSnapshotEvent` stayed stale and every following event retried the serialization.
