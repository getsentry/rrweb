import type {
  throttleOptions,
  listenerHandler,
  hookResetter,
  blockClass,
  addedNodeMutation,
  DocumentDimension,
  IWindow,
  DeprecatedMirror,
  textMutation,
} from '@sentry-internal/rrweb-types';
import type { IMirror, Mirror } from '@sentry-internal/rrweb-snapshot';
import {
  createMatchPredicate,
  distanceToMatch,
} from '@sentry-internal/rrweb-snapshot';
import { isShadowRoot, IGNORED_NODE } from '@sentry-internal/rrweb-snapshot';
import type { RRNode, RRIFrameElement } from '@sentry-internal/rrdom';

export function on(
  type: string,
  fn: EventListenerOrEventListenerObject,
  target: Document | IWindow = document,
): listenerHandler {
  const options = { capture: true, passive: true };
  target.addEventListener(type, fn, options);
  return () => target.removeEventListener(type, fn, options);
}

// https://github.com/rrweb-io/rrweb/pull/407
const DEPARTED_MIRROR_ACCESS_WARNING =
  'Please stop import mirror directly. Instead of that,' +
  '\r\n' +
  'now you can use replayer.getMirror() to access the mirror instance of a replayer,' +
  '\r\n' +
  'or you can use record.mirror to access the mirror instance during recording.';
/** @deprecated */
export let _mirror: DeprecatedMirror = {
  map: {},
  getId() {
    console.error(DEPARTED_MIRROR_ACCESS_WARNING);
    return -1;
  },
  getNode() {
    console.error(DEPARTED_MIRROR_ACCESS_WARNING);
    return null;
  },
  removeNodeFromMap() {
    console.error(DEPARTED_MIRROR_ACCESS_WARNING);
  },
  has() {
    console.error(DEPARTED_MIRROR_ACCESS_WARNING);
    return false;
  },
  reset() {
    console.error(DEPARTED_MIRROR_ACCESS_WARNING);
  },
};
if (typeof window !== 'undefined' && window.Proxy && window.Reflect) {
  _mirror = new Proxy(_mirror, {
    get(target, prop, receiver) {
      if (prop === 'map') {
        console.error(DEPARTED_MIRROR_ACCESS_WARNING);
      }
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      return Reflect.get(target, prop, receiver);
    },
  });
}

// copy from underscore and modified
export function throttle<T>(
  func: (arg: T) => void,
  wait: number,
  options: throttleOptions = {},
) {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  let previous = 0;
  return function (...args: T[]) {
    const now = Date.now();
    if (!previous && options.leading === false) {
      previous = now;
    }
    const remaining = wait - (now - previous);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-this-alias
    const context = this;
    if (remaining <= 0 || remaining > wait) {
      if (timeout) {
        clearTimeout(timeout);
        timeout = null;
      }
      previous = now;
      func.apply(context, args);
    } else if (!timeout && options.trailing !== false) {
      timeout = setTimeout(() => {
        previous = options.leading === false ? 0 : Date.now();
        timeout = null;
        func.apply(context, args);
      }, remaining);
    }
  };
}

export function hookSetter<T>(
  target: T,
  key: string | number | symbol,
  d: PropertyDescriptor,
  isRevoked?: boolean,
  win = window,
): hookResetter {
  const original = win.Object.getOwnPropertyDescriptor(target, key);
  win.Object.defineProperty(
    target,
    key,
    isRevoked
      ? d
      : {
          set(value) {
            // put hooked setter into event loop to avoid of set latency
            setTimeout(() => {
              d.set!.call(this, value);
            }, 0);
            if (original && original.set) {
              original.set.call(this, value);
            }
          },
        },
  );
  return () => hookSetter(target, key, original || {}, true);
}

// copy from https://github.com/getsentry/sentry-javascript/blob/b2109071975af8bf0316d3b5b38f519bdaf5dc15/packages/utils/src/object.ts
export function patch(
  source: { [key: string]: any },
  name: string,
  replacement: (...args: unknown[]) => unknown,
): () => void {
  try {
    if (!(name in source)) {
      return () => {
        //
      };
    }

    const original = source[name] as () => unknown;
    const wrapped = replacement(original);

    // Make sure it's a function first, as we need to attach an empty prototype for `defineProperties` to work
    // otherwise it'll throw "TypeError: Object.defineProperties called on non-object"
    if (typeof wrapped === 'function') {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      wrapped.prototype = wrapped.prototype || {};
      Object.defineProperties(wrapped, {
        __rrweb_original__: {
          enumerable: false,
          value: original,
        },
      });
    }

    source[name] = wrapped;

    return () => {
      source[name] = original;
    };
  } catch {
    return () => {
      //
    };
    // This can throw if multiple fill happens on a global object like XMLHttpRequest
    // Fixes https://github.com/getsentry/sentry-javascript/issues/2043
  }
}

// guard against old third party libraries which redefine Date.now
let nowTimestamp = Date.now;

if (!(/*@__PURE__*/ /[1-9][0-9]{12}/.test(Date.now().toString()))) {
  // they have already redefined it! use a fallback
  nowTimestamp = () => new Date().getTime();
}
export { nowTimestamp };

export function getWindowScroll(win: Window) {
  const doc = win.document;
  return {
    left: doc.scrollingElement
      ? doc.scrollingElement.scrollLeft
      : win.pageXOffset !== undefined
      ? win.pageXOffset
      : doc?.documentElement.scrollLeft ||
        doc?.body?.parentElement?.scrollLeft ||
        doc?.body?.scrollLeft ||
        0,
    top: doc.scrollingElement
      ? doc.scrollingElement.scrollTop
      : win.pageYOffset !== undefined
      ? win.pageYOffset
      : doc?.documentElement.scrollTop ||
        doc?.body?.parentElement?.scrollTop ||
        doc?.body?.scrollTop ||
        0,
  };
}

export function getWindowHeight(): number {
  return (
    window.innerHeight ||
    (document.documentElement && document.documentElement.clientHeight) ||
    (document.body && document.body.clientHeight)
  );
}

export function getWindowWidth(): number {
  return (
    window.innerWidth ||
    (document.documentElement && document.documentElement.clientWidth) ||
    (document.body && document.body.clientWidth)
  );
}

/**
 * Returns the given node as an HTMLElement if it is one, otherwise the parent node as an HTMLElement
 * @param node - node to check
 * @returns HTMLElement or null
 */

export function closestElementOfNode(node: Node | null): HTMLElement | null {
  if (!node) {
    return null;
  }

  // Catch access to node properties to avoid Firefox "permission denied" errors
  try {
    const el: HTMLElement | null =
      node.nodeType === node.ELEMENT_NODE
        ? (node as HTMLElement)
        : node.parentElement;
    return el;
  } catch (error) {
    return null;
  }
}

/**
 * Checks if the given element set to be blocked by rrweb
 * @param node - node to check
 * @param blockClass - class name to check
 * @param blockSelector - css selectors to check
 * @param checkAncestors - whether to search through parent nodes for the block class
 * @returns true/false if the node was blocked or not
 */
export function isBlocked(
  node: Node | null,
  blockClass: blockClass,
  blockSelector: string | null,
  unblockSelector: string | null,
  checkAncestors: boolean,
): boolean {
  if (!node) {
    return false;
  }
  const el = closestElementOfNode(node);

  if (!el) {
    return false;
  }

  const blockedPredicate = createMatchPredicate(blockClass, blockSelector);

  if (!checkAncestors) {
    const isUnblocked = unblockSelector && el.matches(unblockSelector);

    return blockedPredicate(el) && !isUnblocked;
  }

  const blockDistance = distanceToMatch(el, blockedPredicate);
  let unblockDistance = -1;

  if (blockDistance < 0) {
    return false;
  }

  if (unblockSelector) {
    unblockDistance = distanceToMatch(
      el,
      createMatchPredicate(null, unblockSelector),
    );
  }

  if (blockDistance > -1 && unblockDistance < 0) {
    return true;
  }

  return blockDistance < unblockDistance;
}

export function isSerialized(n: Node, mirror: Mirror): boolean {
  return mirror.getId(n) !== -1;
}

export function isIgnored(n: Node, mirror: Mirror): boolean {
  // The main part of the slimDOM check happens in
  // rrweb-snapshot::serializeNodeWithId
  return mirror.getId(n) === IGNORED_NODE;
}

export function isAncestorRemoved(target: Node, mirror: Mirror): boolean {
  if (isShadowRoot(target)) {
    return false;
  }
  const id = mirror.getId(target);
  if (!mirror.has(id)) {
    return true;
  }
  if (
    target.parentNode &&
    target.parentNode.nodeType === target.DOCUMENT_NODE
  ) {
    return false;
  }
  // if the root is not document, it means the node is not in the DOM tree anymore
  if (!target.parentNode) {
    return true;
  }
  return isAncestorRemoved(target.parentNode, mirror);
}

export function legacy_isTouchEvent(
  event: MouseEvent | TouchEvent | PointerEvent,
): event is TouchEvent {
  return Boolean((event as TouchEvent).changedTouches);
}

export function polyfill(win = window) {
  if ('NodeList' in win && !win.NodeList.prototype.forEach) {
    // eslint-disable-next-line @typescript-eslint/unbound-method
    win.NodeList.prototype.forEach = Array.prototype
      .forEach as unknown as NodeList['forEach'];
  }

  if ('DOMTokenList' in win && !win.DOMTokenList.prototype.forEach) {
    // eslint-disable-next-line @typescript-eslint/unbound-method
    win.DOMTokenList.prototype.forEach = Array.prototype
      .forEach as unknown as DOMTokenList['forEach'];
  }

  // https://github.com/Financial-Times/polyfill-service/pull/183
  if (!Node.prototype.contains) {
    Node.prototype.contains = (...args: unknown[]) => {
      let node = args[0] as Node | null;
      if (!(0 in args)) {
        throw new TypeError('1 argument is required');
      }

      do {
        if (this === node) {
          return true;
        }
      } while ((node = node && node.parentNode));

      return false;
    };
  }
}

type ResolveTree = {
  value: addedNodeMutation;
  children: ResolveTree[];
  parent: ResolveTree | null;
};

export function queueToResolveTrees(queue: addedNodeMutation[]): ResolveTree[] {
  const queueNodeMap: Record<number, ResolveTree> = {};
  const putIntoMap = (
    m: addedNodeMutation,
    parent: ResolveTree | null,
  ): ResolveTree => {
    const nodeInTree: ResolveTree = {
      value: m,
      parent,
      children: [],
    };
    queueNodeMap[m.node.id] = nodeInTree;
    return nodeInTree;
  };

  const queueNodeTrees: ResolveTree[] = [];
  for (const mutation of queue) {
    const { nextId, parentId } = mutation;
    if (nextId && nextId in queueNodeMap) {
      const nextInTree = queueNodeMap[nextId];
      if (nextInTree.parent) {
        const idx = nextInTree.parent.children.indexOf(nextInTree);
        nextInTree.parent.children.splice(
          idx,
          0,
          putIntoMap(mutation, nextInTree.parent),
        );
      } else {
        const idx = queueNodeTrees.indexOf(nextInTree);
        queueNodeTrees.splice(idx, 0, putIntoMap(mutation, null));
      }
      continue;
    }
    if (parentId in queueNodeMap) {
      const parentInTree = queueNodeMap[parentId];
      parentInTree.children.push(putIntoMap(mutation, parentInTree));
      continue;
    }
    queueNodeTrees.push(putIntoMap(mutation, null));
  }

  return queueNodeTrees;
}

export function iterateResolveTree(
  tree: ResolveTree,
  cb: (mutation: addedNodeMutation) => unknown,
) {
  cb(tree.value);
  /**
   * The resolve tree was designed to reflect the DOM layout,
   * but we need append next sibling first, so we do a reverse
   * loop here.
   */
  for (let i = tree.children.length - 1; i >= 0; i--) {
    iterateResolveTree(tree.children[i], cb);
  }
}

export type AppendedIframe = {
  mutationInQueue: addedNodeMutation;
  builtNode: HTMLIFrameElement | RRIFrameElement;
};

export function isSerializedIframe<TNode extends Node | RRNode>(
  n: TNode,
  mirror: IMirror<TNode>,
): boolean {
  return Boolean(n.nodeName === 'IFRAME' && mirror.getMeta(n));
}

export function isSerializedStylesheet<TNode extends Node | RRNode>(
  n: TNode,
  mirror: IMirror<TNode>,
): boolean {
  return Boolean(
    n.nodeName === 'LINK' &&
      n.nodeType === n.ELEMENT_NODE &&
      (n as HTMLElement).getAttribute &&
      (n as HTMLElement).getAttribute('rel') === 'stylesheet' &&
      mirror.getMeta(n),
  );
}

export function getBaseDimension(
  node: Node,
  rootIframe: Node,
): DocumentDimension {
  const frameElement = node.ownerDocument?.defaultView?.frameElement;
  if (!frameElement || frameElement === rootIframe) {
    return {
      x: 0,
      y: 0,
      relativeScale: 1,
      absoluteScale: 1,
    };
  }

  const frameDimension = frameElement.getBoundingClientRect();
  const frameBaseDimension = getBaseDimension(frameElement, rootIframe);
  // the iframe element may have a scale transform
  const relativeScale = frameDimension.height / frameElement.clientHeight;
  return {
    x:
      frameDimension.x * frameBaseDimension.relativeScale +
      frameBaseDimension.x,
    y:
      frameDimension.y * frameBaseDimension.relativeScale +
      frameBaseDimension.y,
    relativeScale,
    absoluteScale: frameBaseDimension.absoluteScale * relativeScale,
  };
}

export function hasShadowRoot<T extends Node | RRNode>(
  n: T,
): n is T & { shadowRoot: ShadowRoot } {
  return Boolean((n as unknown as Element)?.shadowRoot);
}

export function getNestedRule(
  rules: CSSRuleList,
  position: number[],
): CSSGroupingRule {
  const rule = rules[position[0]] as CSSGroupingRule;
  if (position.length === 1) {
    return rule;
  } else {
    return getNestedRule(
      (rule.cssRules[position[1]] as CSSGroupingRule).cssRules,
      position.slice(2),
    );
  }
}

export function getPositionsAndIndex(nestedIndex: number[]) {
  const positions = [...nestedIndex];
  const index = positions.pop();
  return { positions, index };
}

/**
 * Returns the latest mutation in the queue for each node.
 * @param mutations - mutations The text mutations to filter.
 * @returns The filtered text mutations.
 */
export function uniqueTextMutations(mutations: textMutation[]): textMutation[] {
  const idSet = new Set<number>();
  const uniqueMutations: textMutation[] = [];

  for (let i = mutations.length; i--; ) {
    const mutation = mutations[i];
    if (!idSet.has(mutation.id)) {
      uniqueMutations.push(mutation);
      idSet.add(mutation.id);
    }
  }

  return uniqueMutations;
}

export class StyleSheetMirror {
  private id = 1;
  private styleIDMap = new WeakMap<CSSStyleSheet, number>();
  private idStyleMap = new Map<number, CSSStyleSheet>();

  getId(stylesheet: CSSStyleSheet): number {
    return this.styleIDMap.get(stylesheet) ?? -1;
  }

  has(stylesheet: CSSStyleSheet): boolean {
    return this.styleIDMap.has(stylesheet);
  }

  /**
   * @returns If the stylesheet is in the mirror, returns the id of the stylesheet. If not, return the new assigned id.
   */
  add(stylesheet: CSSStyleSheet, id?: number): number {
    if (this.has(stylesheet)) return this.getId(stylesheet);
    let newId: number;
    if (id === undefined) {
      newId = this.id++;
    } else newId = id;
    this.styleIDMap.set(stylesheet, newId);
    this.idStyleMap.set(newId, stylesheet);
    return newId;
  }

  getStyle(id: number): CSSStyleSheet | null {
    return this.idStyleMap.get(id) || null;
  }

  reset(): void {
    this.styleIDMap = new WeakMap();
    this.idStyleMap = new Map();
    this.id = 1;
  }

  generateId(): number {
    return this.id++;
  }
}

/**
 * Get the direct shadow host of a node in shadow dom. Returns null if it is not in a shadow dom.
 */
export function getShadowHost(n: Node): Element | null {
  let shadowHost: Element | null = null;
  if (
    n.getRootNode?.()?.nodeType === Node.DOCUMENT_FRAGMENT_NODE &&
    (n.getRootNode() as ShadowRoot).host
  )
    shadowHost = (n.getRootNode() as ShadowRoot).host;
  return shadowHost;
}

/**
 * Get the root shadow host of a node in nested shadow doms. Returns the node itself if it is not in a shadow dom.
 */
export function getRootShadowHost(n: Node): Node {
  let rootShadowHost: Node = n;

  let shadowHost: Element | null;
  // If n is in a nested shadow dom.
  while ((shadowHost = getShadowHost(rootShadowHost)))
    rootShadowHost = shadowHost;

  return rootShadowHost;
}

export function shadowHostInDom(n: Node): boolean {
  const doc = n.ownerDocument;
  if (!doc) return false;
  const shadowHost = getRootShadowHost(n);
  return doc.contains(shadowHost);
}

export function inDom(n: Node): boolean {
  const doc = n.ownerDocument;
  if (!doc) return false;
  return doc.contains(n) || shadowHostInDom(n);
}

/**
 * We generally want to use window.requestAnimationFrame / window.setTimeout / window.clearTimeout.
 * However, in some cases this may be wrapped (e.g. by Zone.js for Angular),
 * so we try to get an unpatched version of this from a sandboxed iframe.
 */

interface CacheableImplementations {
  requestAnimationFrame: typeof requestAnimationFrame;
  setTimeout: typeof setTimeout;
  clearTimeout: typeof clearTimeout;
}

const cachedImplementations: Partial<CacheableImplementations> = {};

function getImplementation<T extends keyof CacheableImplementations>(
  name: T,
): CacheableImplementations[T] {
  const cached = cachedImplementations[name];
  if (cached) {
    return cached;
  }

  const document = window.document;
  let impl = window[name] as CacheableImplementations[T];
  if (document && typeof document.createElement === 'function') {
    try {
      const sandbox = document.createElement('iframe');
      sandbox.hidden = true;
      document.head.appendChild(sandbox);
      const contentWindow = sandbox.contentWindow;
      if (contentWindow && contentWindow[name]) {
        impl =
          // eslint-disable-next-line @typescript-eslint/unbound-method
          contentWindow[name] as CacheableImplementations[T];
      }
      document.head.removeChild(sandbox);
    } catch (e) {
      // Could not create sandbox iframe, just use window.xxx
    }
  }

  return (cachedImplementations[name] = impl.bind(
    window,
  ) as CacheableImplementations[T]);
}

export function onRequestAnimationFrame(
  ...rest: Parameters<typeof requestAnimationFrame>
): ReturnType<typeof requestAnimationFrame> {
  return getImplementation('requestAnimationFrame')(...rest);
}

export function setTimeout(
  ...rest: Parameters<typeof window.setTimeout>
): ReturnType<typeof window.setTimeout> {
  return getImplementation('setTimeout')(...rest);
}

export function clearTimeout(
  ...rest: Parameters<typeof window.clearTimeout>
): ReturnType<typeof window.clearTimeout> {
  return getImplementation('clearTimeout')(...rest);
}
