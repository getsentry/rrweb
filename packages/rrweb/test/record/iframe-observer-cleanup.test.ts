/**
 * @vitest-environment jsdom
 *
 * Regression contracts for the same-origin iframe observer lifecycle:
 *
 * 1. Stopping the recorder must release the recording's own mutation buffer
 *    from the module-level registry.
 * 2. A same-origin iframe document must be observed once. Today every full
 *    snapshot re-serializes the iframe, which calls `attachIframe`, which
 *    invokes the load listener, which observes the same document again —
 *    one new buffer per checkout.
 * 3. One DOM change in the iframe must be emitted once, no matter how many
 *    buffers ended up observing its document.
 * 4. Removing the iframe element must release its document's buffer and
 *    disconnect its observer. Detached shadow roots already get this
 *    treatment (via the document buffer's removal loop); iframe documents
 *    have no equivalent release path.
 *
 * These tests fail against the current source by design; the accompanying
 * fix makes them pass.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Mirror, snapshot } from '@sentry/rrweb-snapshot';
import {
  initMutationObserver,
  initObservers,
  mutationBuffers,
  forEachMutationBuffer,
} from '../../src/record/observer';
import type {
  MutationBufferParam,
  observerParam,
} from '../../src/types';
import type MutationBuffer from '../../src/record/mutation';

// rrweb's sandboxed timers never fire in jsdom: queue them and flush manually.
const pendingTimers = vi.hoisted(() => [] as (() => void)[]);
vi.mock('../../src/utils', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/utils')>()),
  setTimeout: (cb: () => void) => pendingTimers.push(cb),
}));

function childListMutation(
  target: Node,
  added: Node[] = [],
  removed: Node[] = [],
): MutationRecord {
  return {
    type: 'childList',
    target,
    addedNodes: added as unknown as NodeList,
    removedNodes: removed as unknown as NodeList,
    previousSibling: null,
    nextSibling: null,
    attributeName: null,
    attributeNamespace: null,
    oldValue: null,
  } as unknown as MutationRecord;
}

function flushTimers() {
  pendingTimers.splice(0).forEach((cb) => cb());
}

describe('Iframe observer lifecycle (regression)', () => {
  let doc: Document;
  let mirror: Mirror;
  let mutationCb: ReturnType<typeof vi.fn>;
  let iframe: HTMLIFrameElement;
  let iframeDoc: Document;
  let iframeMarker: HTMLElement;
  let createdObservers: MutationObserver[];

  const canvasManager = {
    addShadowRoot: vi.fn(),
    resetShadowRoots: vi.fn(),
    addWindow: vi.fn(),
    freeze: vi.fn(),
    unfreeze: vi.fn(),
    lock: vi.fn(),
    unlock: vi.fn(),
    reset: vi.fn(),
  };

  function params(target: Document): MutationBufferParam & observerParam {
    return {
      mutationCb,
      mousemoveCb: vi.fn(),
      mouseInteractionCb: vi.fn(),
      scrollCb: vi.fn(),
      viewportResizeCb: vi.fn(),
      inputCb: vi.fn(),
      mediaInteractionCb: vi.fn(),
      selectionCb: vi.fn(),
      styleSheetRuleCb: vi.fn(),
      styleDeclarationCb: vi.fn(),
      canvasMutationCb: vi.fn(),
      customElementCb: vi.fn(),
      fontCb: vi.fn(),
      blockClass: 'rr-block',
      blockSelector: null,
      unblockSelector: null,
      ignoreClass: 'rr-ignore',
      ignoreSelector: null,
      maskAllText: false,
      maskTextClass: 'rr-mask',
      unmaskTextClass: null,
      maskTextSelector: null,
      unmaskTextSelector: null,
      maskInputOptions: {},
      maskAttributeFn: undefined,
      maskTextFn: undefined,
      maskInputFn: undefined,
      keepIframeSrcFn: () => false,
      inlineStylesheet: true,
      sampling: {},
      recordDOM: true,
      recordCanvas: false,
      inlineImages: false,
      userTriggeredOnInput: false,
      collectFonts: false,
      slimDOMOptions: {},
      dataURLOptions: {},
      doc: target,
      mirror,
      iframeManager: {
        addIframe: vi.fn(),
        attachIframe: vi.fn(),
        addLoadListener: vi.fn(),
      },
      stylesheetManager: {
        trackLinkElement: vi.fn(),
        attachLinkElement: vi.fn(),
        adoptStyleSheets: vi.fn(),
      },
      shadowDomManager: {
        removeShadowRootsFor: vi.fn(),
        reset: vi.fn(),
      },
      canvasManager,
      processedNodeManager: {
        inOtherBuffer: () => false,
        add: () => undefined,
      },
      ignoreCSSAttributes: new Set<string>(),
      plugins: [],
    } as unknown as MutationBufferParam & observerParam;
  }

  /** Mirrors what record()'s load listener does for every attachIframe call. */
  function observeDoc(rootEl: Node): MutationObserver {
    const observer = initMutationObserver(
      params(rootEl as Document) as MutationBufferParam,
      rootEl,
    );
    createdObservers.push(observer);
    return observer;
  }

  beforeEach(() => {
    doc = document;
    mirror = new Mirror();
    mutationCb = vi.fn();
    createdObservers = [];

    iframe = doc.createElement('iframe');
    doc.body.appendChild(iframe);
    iframeDoc = iframe.contentDocument!;
    iframeMarker = iframeDoc.createElement('div');
    iframeDoc.body.appendChild(iframeMarker);

    snapshot(doc, { mirror });
    snapshot(iframeDoc, { mirror });
  });

  afterEach(() => {
    forEachMutationBuffer((b) => b.reset());
    createdObservers.forEach((o) => {
      try {
        o.disconnect();
      } catch {
        // cross-realm observers may already be detached
      }
    });
    mutationBuffers.splice(0, mutationBuffers.length);
    pendingTimers.length = 0;
    vi.restoreAllMocks();
  });

  it('releases the recording buffer when the recording is stopped', () => {
    const before = mutationBuffers.length;
    const stop = initObservers(params(doc) as unknown as observerParam);

    expect(mutationBuffers.length - before).toBe(1);

    stop();
    flushTimers();

    // The teardown resets every buffer, but the buffer of the stopped
    // recording stays registered forever.
    expect(mutationBuffers.length).toBe(before);
  });

  it('observes a same-origin iframe document once, not once per checkout', () => {
    const before = mutationBuffers.length;

    // Every full snapshot re-serializes the iframe and re-invokes the load
    // listener, so three checkouts mean three observe() calls for the same
    // document. The registry must not accumulate one buffer per checkout.
    for (let i = 0; i < 3; i++) {
      observeDoc(iframeDoc);
    }

    expect(mutationBuffers.length - before).toBe(1);
  });

  it('emits an iframe attribute change once, not once per observing buffer', async () => {
    for (let i = 0; i < 3; i++) {
      observeDoc(iframeDoc);
    }

    // Each buffer observing the iframe document has its own real observer,
    // and all of them deliver the same change. With exactly one buffer the
    // change must be emitted exactly once.
    iframeMarker.setAttribute('data-state', 'on');
    // jsdom delivers MutationObserver callbacks as microtasks.
    await Promise.resolve();

    expect(mutationCb).toHaveBeenCalledTimes(1);
  });

  it('releases the iframe buffer when the iframe element is removed', async () => {
    const pushSpy = vi.spyOn(mutationBuffers, 'push');
    const parentObserver = observeDoc(doc);
    observeDoc(iframeDoc);
    const [parentBuffer, iframeBuffer] = pushSpy.mock.calls.map(
      (call) => call[0],
    ) as MutationBuffer[];
    pushSpy.mockRestore();
    expect(iframeBuffer).toBeDefined();

    const disconnectSpy = vi.spyOn(
      window.MutationObserver.prototype,
      'disconnect',
    );
    disconnectSpy.mockClear();

    // The parent document's buffer processes the removal; detached shadow
    // roots are released at exactly this point, iframe documents are not.
    iframe.remove();
    parentBuffer.processMutations([
      childListMutation(doc.body, [], [iframe]),
    ]);
    flushTimers();
    await Promise.resolve();

    void parentObserver;
    expect(mutationBuffers).not.toContain(iframeBuffer);
    expect(disconnectSpy).toHaveBeenCalled();
  });
});
