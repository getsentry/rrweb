# Changelog

## 1.104.0
- fix: masking inputs on change when `maskAllInputs:false` (#61)
- fix: Run prepublish scripts before building tarballs (#64)
- fix: textarea value is being duplicated (#62)
- feat: Export `typings/types` (#60)
- feat: Remove `autoplay` attribute from audio/video tags (#59)
- fix: more robust `rootShadowHost` check (#50)
- fix: Exclude `modulepreload` as well (#52)

## 1.103.0

- feat: Check `blockSelector` for blocking elements as well (#49)

## 1.102.0

- feat: Add `maskAllText` option
- feat: With maskAllText, mask the attributes: placeholder, title, `aria-label`
- feat: fix masking on `textarea`

## 1.101.2

- fix: Ensure we do not check `window` in module scope (#47)

## 1.101.1

- fix: Fix accidential `dependencies` of `rrweb-snapshot` (#45)

## 1.101.0

- feat: Wrap rrweb callbacks in wrapper to better handle errors (#41)
- fix(replayer): Fix null objects on playback (#38)
- fix: Ensure CSS support is checked more robustly (#42)

## 1.100.2

- fix: Catch style mutation handling (#33)
- fix: Handle case where `event` is null/undefined (#32)

## 1.100.1

This patch adds a public publish config to the rrweb packages to enable publishing to NPM.

- chore(rrweb): Add `publishConfig` field to package.jsons (#30)

## 1.100.0

This release marks the first `@sentry-internal/rr*` release of our forked packages.
Note: These packages are supposed to be used internally by other Sentry projects.
We do not provide support or make any guarantees in terms of breaking changes.

We're starting releasing our forked packages with version `1.100.0`, as this gives us enough headroom over
possible future rrweb v1.x patches while still staying in sync with the rrweb major version.

- feat(rrweb): Guard against missing `window.CSSStyleSheet` (#12)
- feat(rrweb/rrweb-snapshot): Add `maskInputSelector`, `unmaskInputSelector`, and `unmaskTextSelector` (#10)
- feat(rrweb/rrweb-snapshot): Add `unblockSelector` and `ignoreSelector` (#14)
- fix(rrweb): Ignore errors in style observers (#16)
- ref(rrweb/rrweb-snapshot): Update types (#13)

## v1.0.0

### Featrues & Improvements

- Support record same-origin non-sandboxed iframe.
- Support record open-mode shadow DOM.
- Implement the plugin API.
- Export `record.takeFullSnapshot` as a public API
- Record and replay drag events.
- Add options to mask texts (#540).

### Fixes

- Get the original MutationObserver when Angular patched it.
- Fix RangeError: Maximum call stack size exceeded (#479).
- Fix the linked-list implementation in the recorder.
- Don't perform newly added actions if the player is paused (#539).
- Fix inaccurate mouse position (#522)

### Breaking Changes

- Deprecated the usage of `rrweb.mirror`. Please use `record.mirror` and `replayer.getMirror()` instead.
- Deprecated the record option `recordLog `. See the new plugin API [here](./docs/recipes/console.md).
- Deprecated the replay option ` `. See the new plugin API [here](./docs/recipes/console.md).
