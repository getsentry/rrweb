import {
  idNodeMap,
  MaskInputFn,
  MaskInputOptions,
  nodeMetaMap,
  IMirror,
  serializedNodeWithId,
  serializedNode,
  NodeType,
  documentNode,
  documentTypeNode,
  textNode,
  elementNode,
} from './types';

export function isElement(n: Node): n is Element {
  return n.nodeType === n.ELEMENT_NODE;
}

export function isShadowRoot(n: Node): n is ShadowRoot {
  const host: Element | null = (n as ShadowRoot)?.host;
  return Boolean(host?.shadowRoot === n);
}

/**
 * To fix the issue https://github.com/rrweb-io/rrweb/issues/933.
 * Some websites use polyfilled shadow dom and this function is used to detect this situation.
 */
export function isNativeShadowDom(shadowRoot: ShadowRoot): boolean {
  return Object.prototype.toString.call(shadowRoot) === '[object ShadowRoot]';
}

/**
 * Browsers sometimes destructively modify the css rules they receive.
 * This function tries to rectify the modifications the browser made to make it more cross platform compatible.
 * @param cssText - output of `CSSStyleRule.cssText`
 * @returns `cssText` with browser inconsistencies fixed.
 */
function fixBrowserCompatibilityIssuesInCSS(cssText: string): string {
  /**
   * Chrome outputs `-webkit-background-clip` as `background-clip` in `CSSStyleRule.cssText`.
   * But then Chrome ignores `background-clip` as css input.
   * Re-introduce `-webkit-background-clip` to fix this issue.
   */
  if (
    cssText.includes(' background-clip: text;') &&
    !cssText.includes(' -webkit-background-clip: text;')
  ) {
    cssText = cssText.replace(
      /\sbackground-clip:\s*text;/g,
      ' -webkit-background-clip: text; background-clip: text;',
    );
  }
  return cssText;
}

// Remove this declaration once typescript has added `CSSImportRule.supportsText` to the lib.
declare interface CSSImportRule extends CSSRule {
  readonly href: string;
  readonly layerName: string | null;
  readonly media: MediaList;
  readonly styleSheet: CSSStyleSheet;
  /**
   * experimental API, currently only supported in firefox
   * https://developer.mozilla.org/en-US/docs/Web/API/CSSImportRule/supportsText
   */
  readonly supportsText?: string | null;
}

/**
 * Browsers sometimes incorrectly escape `@import` on `.cssText` statements.
 * This function tries to correct the escaping.
 * more info: https://bugs.chromium.org/p/chromium/issues/detail?id=1472259
 * @param cssImportRule
 * @returns `cssText` with browser inconsistencies fixed, or null if not applicable.
 */
export function escapeImportStatement(rule: CSSImportRule): string {
  const { cssText } = rule;
  if (cssText.split('"').length < 3) return cssText;

  const statement = ['@import', `url(${JSON.stringify(rule.href)})`];
  if (rule.layerName === '') {
    statement.push(`layer`);
  } else if (rule.layerName) {
    statement.push(`layer(${rule.layerName})`);
  }
  if (rule.supportsText) {
    statement.push(`supports(${rule.supportsText})`);
  }
  if (rule.media.length) {
    statement.push(rule.media.mediaText);
  }
  return statement.join(' ') + ';';
}

export function stringifyStylesheet(s: CSSStyleSheet): string | null {
  try {
    const rules = s.rules || s.cssRules;
    return rules
      ? fixBrowserCompatibilityIssuesInCSS(
          Array.from(rules, stringifyRule).join(''),
        )
      : null;
  } catch (error) {
    return null;
  }
}

/**
 * There is a bug in chrome (https://issues.chromium.org/issues/41416124) with the `all` property where we can't use `cssText` because it is wrong.
 * Instead, attempt to serialize the css string using `CSSStyleDeclaration`.
 */
export function fixAllCssProperty(rule: CSSStyleRule) {
  let styles = '';
  for (let i = 0; i < rule.style.length; i++) {
    const styleDeclaration = rule.style;
    const attribute = styleDeclaration[i];
    const isImportant = styleDeclaration.getPropertyPriority(attribute);
    styles += `${attribute}:${styleDeclaration.getPropertyValue(attribute)}${
      isImportant ? ` !important` : ''
    };`;
  }

  return `${rule.selectorText} { ${styles} }`;
}

export function stringifyRule(rule: CSSRule): string {
  let importStringified;
  if (isCSSImportRule(rule)) {
    try {
      importStringified =
        // for same-origin stylesheets,
        // we can access the imported stylesheet rules directly
        stringifyStylesheet(rule.styleSheet) ||
        // work around browser issues with the raw string `@import url(...)` statement
        escapeImportStatement(rule);
    } catch (error) {
      // ignore
    }
  } else if (isCSSStyleRule(rule)) {
    let cssText = rule.cssText;
    const needsSafariColonFix = rule.selectorText.includes(':');
    const needsAllFix =
      typeof rule.style['all'] === 'string' && rule.style['all'];

    if (needsAllFix) {
      cssText = fixAllCssProperty(rule);
    }

    if (needsSafariColonFix) {
      // Safari does not escape selectors with : properly
      // see https://bugs.webkit.org/show_bug.cgi?id=184604
      //
      // This needs to be after `fixAllCssProperty()` which requires a
      // `CssStylRule` and generates a string (i.e. `cssText`) and the below
      // operates on `cssText`
      cssText = fixSafariColons(cssText);
    }

    if (needsSafariColonFix || needsAllFix) {
      return cssText;
    }
  }

  return importStringified || rule.cssText;
}

export function fixSafariColons(cssStringified: string): string {
  // Replace e.g. [aa:bb] with [aa\\:bb]
  const regex = /(\[(?:[\w-]+)[^\\])(:(?:[\w-]+)\])/gm;
  return cssStringified.replace(regex, '$1\\$2');
}

export function isCSSImportRule(rule: CSSRule): rule is CSSImportRule {
  return 'styleSheet' in rule;
}

export function isCSSStyleRule(rule: CSSRule): rule is CSSStyleRule {
  return 'selectorText' in rule;
}

export class Mirror implements IMirror<Node> {
  private idNodeMap: idNodeMap = new Map();
  private nodeMetaMap: nodeMetaMap = new WeakMap();

  getId(n: Node | undefined | null): number {
    if (!n) return -1;

    const id = this.getMeta(n)?.id;

    // if n is not a serialized Node, use -1 as its id.
    return id ?? -1;
  }

  getNode(id: number): Node | null {
    return this.idNodeMap.get(id) || null;
  }

  getIds(): number[] {
    return Array.from(this.idNodeMap.keys());
  }

  getMeta(n: Node): serializedNodeWithId | null {
    return this.nodeMetaMap.get(n) || null;
  }

  // removes the node from idNodeMap
  // doesn't remove the node from nodeMetaMap
  removeNodeFromMap(n: Node) {
    const id = this.getId(n);
    this.idNodeMap.delete(id);

    if (n.childNodes) {
      n.childNodes.forEach((childNode) =>
        this.removeNodeFromMap(childNode as unknown as Node),
      );
    }
  }
  has(id: number): boolean {
    return this.idNodeMap.has(id);
  }

  hasNode(node: Node): boolean {
    return this.nodeMetaMap.has(node);
  }

  add(n: Node, meta: serializedNodeWithId) {
    const id = meta.id;
    this.idNodeMap.set(id, n);
    this.nodeMetaMap.set(n, meta);
  }

  replace(id: number, n: Node) {
    const oldNode = this.getNode(id);
    if (oldNode) {
      const meta = this.nodeMetaMap.get(oldNode);
      if (meta) this.nodeMetaMap.set(n, meta);
    }
    this.idNodeMap.set(id, n);
  }

  reset() {
    this.idNodeMap = new Map();
    this.nodeMetaMap = new WeakMap();
  }
}

export function createMirror(): Mirror {
  return new Mirror();
}

export function shouldMaskInput({
  maskInputOptions,
  tagName,
  type,
}: {
  maskInputOptions: MaskInputOptions;
  tagName: Uppercase<string>;
  type: Lowercase<string> | null;
}): boolean {
  // Handle `option` like `select
  if (tagName === 'OPTION') {
    tagName = 'SELECT';
  }
  return Boolean(
    maskInputOptions[tagName.toLowerCase() as keyof MaskInputOptions] ||
      (type && maskInputOptions[type as keyof MaskInputOptions]) ||
      type === 'password' ||
      // Default to "text" option for inputs without a "type" attribute defined
      (tagName === 'INPUT' && !type && maskInputOptions['text']),
  );
}

export function maskInputValue({
  isMasked,
  element,
  value,
  maskInputFn,
}: {
  isMasked: boolean;
  element: HTMLElement;
  value: string | null;
  maskInputFn?: MaskInputFn;
}): string {
  let text = value || '';

  if (!isMasked) {
    return text;
  }

  if (maskInputFn) {
    text = maskInputFn(text, element);
  }

  return '*'.repeat(text.length);
}

export function toLowerCase<T extends string>(str: T): Lowercase<T> {
  return str.toLowerCase() as unknown as Lowercase<T>;
}

export function toUpperCase<T extends string>(str: T): Uppercase<T> {
  return str.toUpperCase() as unknown as Uppercase<T>;
}

const ORIGINAL_ATTRIBUTE_NAME = '__rrweb_original__';
type PatchedGetImageData = {
  [ORIGINAL_ATTRIBUTE_NAME]: CanvasImageData['getImageData'];
} & CanvasImageData['getImageData'];

export function is2DCanvasBlank(canvas: HTMLCanvasElement): boolean {
  const ctx = canvas.getContext('2d');
  if (!ctx) return true;

  const chunkSize = 50;

  // get chunks of the canvas and check if it is blank
  for (let x = 0; x < canvas.width; x += chunkSize) {
    for (let y = 0; y < canvas.height; y += chunkSize) {
      // eslint-disable-next-line @typescript-eslint/unbound-method
      const getImageData = ctx.getImageData as PatchedGetImageData;
      const originalGetImageData =
        ORIGINAL_ATTRIBUTE_NAME in getImageData
          ? getImageData[ORIGINAL_ATTRIBUTE_NAME]
          : getImageData;
      // by getting the canvas in chunks we avoid an expensive
      // `getImageData` call that retrieves everything
      // even if we can already tell from the first chunk(s) that
      // the canvas isn't blank
      const pixelBuffer = new Uint32Array(
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access
        originalGetImageData.call(
          ctx,
          x,
          y,
          Math.min(chunkSize, canvas.width - x),
          Math.min(chunkSize, canvas.height - y),
        ).data.buffer,
      );
      if (pixelBuffer.some((pixel) => pixel !== 0)) return false;
    }
  }
  return true;
}

export function isNodeMetaEqual(a: serializedNode, b: serializedNode): boolean {
  if (!a || !b || a.type !== b.type) return false;
  if (a.type === NodeType.Document)
    return a.compatMode === (b as documentNode).compatMode;
  else if (a.type === NodeType.DocumentType)
    return (
      a.name === (b as documentTypeNode).name &&
      a.publicId === (b as documentTypeNode).publicId &&
      a.systemId === (b as documentTypeNode).systemId
    );
  else if (
    a.type === NodeType.Comment ||
    a.type === NodeType.Text ||
    a.type === NodeType.CDATA
  )
    return a.textContent === (b as textNode).textContent;
  else if (a.type === NodeType.Element)
    return (
      a.tagName === (b as elementNode).tagName &&
      JSON.stringify(a.attributes) ===
        JSON.stringify((b as elementNode).attributes) &&
      a.isSVG === (b as elementNode).isSVG &&
      a.needBlock === (b as elementNode).needBlock
    );
  return false;
}

/**
 * Get the type of an input element.
 * This takes care of the case where a password input is changed to a text input.
 * In this case, we continue to consider this of type password, in order to avoid leaking sensitive data
 * where passwords should be masked.
 */
export function getInputType(element: HTMLElement): Lowercase<string> | null {
  // when omitting the type of input element(e.g. <input />), the type is treated as text
  const type = (element as HTMLInputElement).type;

  return element.hasAttribute('data-rr-is-password')
    ? 'password'
    : type
    ? // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
      toLowerCase(type)
    : null;
}

export function getInputValue(
  el:
    | HTMLInputElement
    | HTMLTextAreaElement
    | HTMLSelectElement
    | HTMLOptionElement,
  tagName: Uppercase<string>,
  type: Lowercase<string> | null,
): string {
  if (tagName === 'INPUT' && (type === 'radio' || type === 'checkbox')) {
    // checkboxes & radio buttons return `on` as their el.value when no value is specified
    // we only want to get the value if it is specified as `value='xxx'`
    return el.getAttribute('value') || '';
  }

  return el.value;
}

/**
 * Extracts the file extension from an a path, considering search parameters and fragments.
 * @param path - Path to file
 * @param baseURL - [optional] Base URL of the page, used to resolve relative paths. Defaults to current page URL.
 */
export function extractFileExtension(
  path: string,
  baseURL?: string,
): string | null {
  let url;
  try {
    url = new URL(path, baseURL ?? window.location.href);
  } catch (err) {
    return null;
  }
  const regex = /\.([0-9a-z]+)(?:$)/i;
  const match = url.pathname.match(regex);
  return match?.[1] ?? null;
}

/**
 * We generally want to use window.requestAnimationFrame / window.setTimeout / window.clearTimeout.
 * However, in some cases this may be wrapped (e.g. by Zone.js for Angular),
 * so we try to get an unpatched version of this from a sandboxed iframe.
 *
 * TODO(sentry): This is duplicated from rrweb utils, ideally we extract this to a new package.
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

/**
 * Get the content document of an iframe.
 * Catching errors is necessary because some older browsers block access to the content document of a sandboxed iframe.
 */
export function getIframeContentDocument(iframe?: HTMLIFrameElement) {
  try {
    return (iframe as HTMLIFrameElement).contentDocument;
  } catch (e) {
    // noop
  }
}
