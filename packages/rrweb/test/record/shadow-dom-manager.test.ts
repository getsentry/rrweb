/**
 * @vitest-environment jsdom
 */
import { vi } from 'vitest';
import type { Mirror } from '@sentry/rrweb-snapshot';
import { ShadowDomManager } from '../../src/record/shadow-dom-manager';

type BypassOptions = ConstructorParameters<
  typeof ShadowDomManager
>[0]['bypassOptions'];

function createManager(): ShadowDomManager {
  return new ShadowDomManager({
    mutationCb: vi.fn(),
    scrollCb: vi.fn(),
    bypassOptions: {
      canvasManager: {
        addShadowRoot: vi.fn(),
        resetShadowRoots: vi.fn(),
      },
    } as unknown as BypassOptions,
    mirror: { getId: vi.fn() } as unknown as Mirror,
  });
}

describe('ShadowDomManager', () => {
  // Regression tests for https://github.com/getsentry/rrweb/issues/321:
  // a cross-origin iframe's `contentWindow` is a truthy-restricted proxy, so
  // the unguarded `iframeWindow.Element` read threw into the host page.
  describe('observeAttachShadow', () => {
    it('does not throw when reading a property of a cross-origin window throws', () => {
      const restrictedWindow = new Proxy(
        {},
        {
          get() {
            throw new DOMException(
              "Failed to read a named property 'Element' from 'Window': Blocked a frame from accessing a cross-origin frame.",
              'SecurityError',
            );
          },
        },
      );
      const iframe = {
        contentDocument: document.implementation.createHTMLDocument(),
        contentWindow: restrictedWindow,
      } as unknown as HTMLIFrameElement;
      const manager = createManager();

      expect(() => manager.observeAttachShadow(iframe)).not.toThrow();
    });

    it('does not throw when the iframe window has no Element constructor', () => {
      const iframe = {
        contentDocument: document.implementation.createHTMLDocument(),
        contentWindow: {},
      } as unknown as HTMLIFrameElement;
      const manager = createManager();

      expect(() => manager.observeAttachShadow(iframe)).not.toThrow();
    });

    it('patches attachShadow of an accessible iframe window', () => {
      class FakeElement {
        attachShadow() {
          return {} as ShadowRoot;
        }
      }
      const original = FakeElement.prototype.attachShadow;
      const iframe = {
        contentDocument: document.implementation.createHTMLDocument(),
        contentWindow: { Element: FakeElement },
      } as unknown as HTMLIFrameElement;
      const manager = createManager();

      manager.observeAttachShadow(iframe);

      const patched = FakeElement.prototype.attachShadow as unknown as {
        __rrweb_original__?: unknown;
      };
      expect(patched).not.toBe(original);
      expect(patched.__rrweb_original__).toBe(original);
    });
  });
});
