import {
  serializedNode,
  serializedNodeWithId,
  NodeType,
  attributes,
  MaskInputOptions,
  SlimDOMOptions,
  DataURLOptions,
  MaskTextFn,
  MaskInputFn,
  KeepIframeSrcFn,
  ICanvas,
  serializedElementNodeWithId,
  MaskAttributeFn,
} from './types';
import {
  Mirror,
  is2DCanvasBlank,
  isElement,
  isShadowRoot,
  maskInputValue,
  isNativeShadowDom,
  stringifyStylesheet,
  getInputType,
  getInputValue,
  toLowerCase,
  extractFileExtension,
  toUpperCase,
  shouldMaskInput,
  setTimeout,
  clearTimeout,
  getIframeContentDocument,
} from './utils';

let _id = 1;
const tagNameRegex = new RegExp('[^a-z0-9-_:]');

export const IGNORED_NODE = -2;

export function genId(): number {
  return _id++;
}

function getValidTagName(element: HTMLElement): Lowercase<string> {
  if (element instanceof HTMLFormElement) {
    return 'form';
  }

  const processedTagName = toLowerCase(element.tagName);

  if (tagNameRegex.test(processedTagName)) {
    // if the tag name is odd and we cannot extract
    // anything from the string, then we return a
    // generic div
    return 'div';
  }

  return processedTagName;
}

function extractOrigin(url: string): string {
  let origin = '';
  if (url.indexOf('//') > -1) {
    origin = url.split('/').slice(0, 3).join('/');
  } else {
    origin = url.split('/')[0];
  }
  origin = origin.split('?')[0];
  return origin;
}

let canvasService: HTMLCanvasElement | null;
let canvasCtx: CanvasRenderingContext2D | null;

const URL_IN_CSS_REF = /url\((?:(')([^']*)'|(")(.*?)"|([^)]*))\)/gm;
const URL_PROTOCOL_MATCH = /^(?:[a-z+]+:)?\/\//i;
const URL_WWW_MATCH = /^www\..*/i;
const DATA_URI = /^(data:)([^,]*),(.*)/i;
export function absoluteToStylesheet(
  cssText: string | null,
  href: string,
): string {
  return (cssText || '').replace(
    URL_IN_CSS_REF,
    (
      origin: string,
      quote1: string,
      path1: string,
      quote2: string,
      path2: string,
      path3: string,
    ) => {
      const filePath = path1 || path2 || path3;
      const maybeQuote = quote1 || quote2 || '';
      if (!filePath) {
        return origin;
      }
      if (URL_PROTOCOL_MATCH.test(filePath) || URL_WWW_MATCH.test(filePath)) {
        return `url(${maybeQuote}${filePath}${maybeQuote})`;
      }
      if (DATA_URI.test(filePath)) {
        return `url(${maybeQuote}${filePath}${maybeQuote})`;
      }
      if (filePath[0] === '/') {
        return `url(${maybeQuote}${
          extractOrigin(href) + filePath
        }${maybeQuote})`;
      }
      const stack = href.split('/');
      const parts = filePath.split('/');
      stack.pop();
      for (const part of parts) {
        if (part === '.') {
          continue;
        } else if (part === '..') {
          stack.pop();
        } else {
          stack.push(part);
        }
      }
      return `url(${maybeQuote}${stack.join('/')}${maybeQuote})`;
    },
  );
}

// eslint-disable-next-line no-control-regex
const SRCSET_NOT_SPACES = /^[^ \t\n\r\u000c]+/; // Don't use \s, to avoid matching non-breaking space
// eslint-disable-next-line no-control-regex
const SRCSET_COMMAS_OR_SPACES = /^[, \t\n\r\u000c]+/;
function getAbsoluteSrcsetString(doc: Document, attributeValue: string) {
  /*
    run absoluteToDoc over every url in the srcset

    this is adapted from https://github.com/albell/parse-srcset/
    without the parsing of the descriptors (we return these as-is)
    parce-srcset is in turn based on
    https://html.spec.whatwg.org/multipage/embedded-content.html#parse-a-srcset-attribute
  */
  if (attributeValue.trim() === '') {
    return attributeValue;
  }

  let pos = 0;

  function collectCharacters(regEx: RegExp) {
    let chars: string;
    const match = regEx.exec(attributeValue.substring(pos));
    if (match) {
      chars = match[0];
      pos += chars.length;
      return chars;
    }
    return '';
  }

  const output = [];
  // eslint-disable-next-line no-constant-condition
  while (true) {
    collectCharacters(SRCSET_COMMAS_OR_SPACES);
    if (pos >= attributeValue.length) {
      break;
    }
    // don't split on commas within urls
    let url = collectCharacters(SRCSET_NOT_SPACES);
    if (url.slice(-1) === ',') {
      // aside: according to spec more than one comma at the end is a parse error, but we ignore that
      url = absoluteToDoc(doc, url.substring(0, url.length - 1));
      // the trailing comma splits the srcset, so the interpretion is that
      // another url will follow, and the descriptor is empty
      output.push(url);
    } else {
      let descriptorsStr = '';
      url = absoluteToDoc(doc, url);
      let inParens = false;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const c = attributeValue.charAt(pos);
        if (c === '') {
          output.push((url + descriptorsStr).trim());
          break;
        } else if (!inParens) {
          if (c === ',') {
            pos += 1;
            output.push((url + descriptorsStr).trim());
            break; // parse the next url
          } else if (c === '(') {
            inParens = true;
          }
        } else {
          // in parenthesis; ignore commas
          // (parenthesis may be supported by future additions to spec)
          if (c === ')') {
            inParens = false;
          }
        }
        descriptorsStr += c;
        pos += 1;
      }
    }
  }
  return output.join(', ');
}

const cachedDocument = new WeakMap<Document, HTMLAnchorElement>();

export function absoluteToDoc(doc: Document, attributeValue: string): string {
  if (!attributeValue || attributeValue.trim() === '') {
    return attributeValue;
  }

  return getHref(doc, attributeValue);
}

function isSVGElement(el: Element): boolean {
  return Boolean(el.tagName === 'svg' || (el as SVGElement).ownerSVGElement);
}

function getHref(doc: Document, customHref?: string) {
  let a = cachedDocument.get(doc);
  if (!a) {
    a = doc.createElement('a');
    cachedDocument.set(doc, a);
  }
  if (!customHref) {
    customHref = '';
  } else if (customHref.startsWith('blob:') || customHref.startsWith('data:')) {
    return customHref;
  }
  // note: using `new URL` is slower. See #1434 or https://jsbench.me/uqlud17rxo/1
  a.setAttribute('href', customHref);
  return a.href;
}

export function transformAttribute(
  doc: Document,
  tagName: Lowercase<string>,
  name: Lowercase<string>,
  value: string | null,
  element: HTMLElement,
  maskAttributeFn: MaskAttributeFn | undefined,
): string | null {
  if (!value) {
    return value;
  }

  // relative path in attribute
  if (
    name === 'src' ||
    (name === 'href' && !(tagName === 'use' && value[0] === '#'))
  ) {
    // href starts with a # is an id pointer for svg
    return absoluteToDoc(doc, value);
  } else if (name === 'xlink:href' && value[0] !== '#') {
    // xlink:href starts with # is an id pointer
    return absoluteToDoc(doc, value);
  } else if (
    name === 'background' &&
    (tagName === 'table' || tagName === 'td' || tagName === 'th')
  ) {
    return absoluteToDoc(doc, value);
  } else if (name === 'srcset') {
    return getAbsoluteSrcsetString(doc, value);
  } else if (name === 'style') {
    return absoluteToStylesheet(value, getHref(doc));
  } else if (tagName === 'object' && name === 'data') {
    return absoluteToDoc(doc, value);
  }

  // Custom attribute masking
  if (typeof maskAttributeFn === 'function') {
    return maskAttributeFn(name, value, element);
  }

  return value;
}

export function ignoreAttribute(
  tagName: string,
  name: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _value: unknown,
): boolean {
  return (tagName === 'video' || tagName === 'audio') && name === 'autoplay';
}

export function _isBlockedElement(
  element: HTMLElement,
  blockClass: string | RegExp,
  blockSelector: string | null,
  unblockSelector: string | null,
): boolean {
  try {
    if (unblockSelector && element.matches(unblockSelector)) {
      return false;
    }

    if (typeof blockClass === 'string') {
      if (element.classList.contains(blockClass)) {
        return true;
      }
    } else {
      for (let eIndex = element.classList.length; eIndex--; ) {
        const className = element.classList[eIndex];
        if (blockClass.test(className)) {
          return true;
        }
      }
    }
    if (blockSelector) {
      return element.matches(blockSelector);
    }
  } catch (e) {
    //
  }

  return false;
}

function elementClassMatchesRegex(el: HTMLElement, regex: RegExp): boolean {
  for (let eIndex = el.classList.length; eIndex--; ) {
    const className = el.classList[eIndex];
    if (regex.test(className)) {
      return true;
    }
  }
  return false;
}

export function classMatchesRegex(
  node: Node | null,
  regex: RegExp,
  checkAncestors: boolean,
): boolean {
  if (!node) return false;
  if (checkAncestors) {
    return (
      distanceToMatch(node, (node) =>
        elementClassMatchesRegex(node as HTMLElement, regex),
      ) >= 0
    );
  } else if (node.nodeType === node.ELEMENT_NODE) {
    return elementClassMatchesRegex(node as HTMLElement, regex);
  }
  return false;
}

export function distanceToMatch(
  node: Node | null,
  matchPredicate: (node: Node) => boolean,
  limit = Infinity,
  distance = 0,
): number {
  if (!node) return -1;
  if (node.nodeType !== node.ELEMENT_NODE) return -1;
  if (distance > limit) return -1;
  if (matchPredicate(node)) return distance;
  return distanceToMatch(node.parentNode, matchPredicate, limit, distance + 1);
}

export function createMatchPredicate(
  className: string | RegExp | null,
  selector: string | null,
): (node: Node) => boolean {
  return (node: Node) => {
    const el = node as HTMLElement;
    if (el === null) return false;

    try {
      if (className) {
        if (typeof className === 'string') {
          if (el.matches(`.${className}`)) return true;
        } else if (elementClassMatchesRegex(el, className)) {
          return true;
        }
      }

      if (selector && el.matches(selector)) return true;

      return false;
    } catch {
      return false;
    }
  };
}

export function needMaskingText(
  node: Node,
  maskTextClass: string | RegExp,
  maskTextSelector: string | null,
  unmaskTextClass: string | RegExp | null,
  unmaskTextSelector: string | null,
  maskAllText: boolean,
): boolean {
  try {
    const el: HTMLElement | null =
      node.nodeType === node.ELEMENT_NODE
        ? (node as HTMLElement)
        : node.parentElement;
    if (el === null) return false;

    if (el.tagName === 'INPUT') {
      // Special cases: We want to enforce some masking for password & credit-card related fields,
      // no matter the settings
      const autocomplete = el.getAttribute('autocomplete');
      const disallowedAutocompleteValues = [
        'current-password',
        'new-password',
        'cc-number',
        'cc-exp',
        'cc-exp-month',
        'cc-exp-year',
        'cc-csc',
      ];
      if (disallowedAutocompleteValues.includes(autocomplete as string)) {
        return true;
      }
    }

    let maskDistance = -1;
    let unmaskDistance = -1;

    if (maskAllText) {
      unmaskDistance = distanceToMatch(
        el,
        createMatchPredicate(unmaskTextClass, unmaskTextSelector),
      );

      if (unmaskDistance < 0) {
        return true;
      }

      maskDistance = distanceToMatch(
        el,
        createMatchPredicate(maskTextClass, maskTextSelector),
        unmaskDistance >= 0 ? unmaskDistance : Infinity,
      );
    } else {
      maskDistance = distanceToMatch(
        el,
        createMatchPredicate(maskTextClass, maskTextSelector),
      );

      if (maskDistance < 0) {
        return false;
      }

      unmaskDistance = distanceToMatch(
        el,
        createMatchPredicate(unmaskTextClass, unmaskTextSelector),
        maskDistance >= 0 ? maskDistance : Infinity,
      );
    }

    return maskDistance >= 0
      ? unmaskDistance >= 0
        ? maskDistance <= unmaskDistance
        : true
      : unmaskDistance >= 0
      ? false
      : !!maskAllText;
  } catch (e) {
    //
  }

  return !!maskAllText;
}

// https://stackoverflow.com/a/36155560
function onceIframeLoaded(
  iframeEl: HTMLIFrameElement,
  listener: () => unknown,
  iframeLoadTimeout: number,
) {
  const win = iframeEl.contentWindow;
  if (!win) {
    return;
  }
  // document is loading
  let fired = false;

  let readyState: DocumentReadyState;
  try {
    readyState = win.document.readyState;
  } catch (error) {
    return;
  }
  if (readyState !== 'complete') {
    const timer = setTimeout(() => {
      if (!fired) {
        listener();
        fired = true;
      }
    }, iframeLoadTimeout);
    iframeEl.addEventListener('load', () => {
      clearTimeout(timer);
      fired = true;
      listener();
    });
    return;
  }
  // check blank frame for Chrome
  const blankUrl = 'about:blank';
  if (
    win.location.href !== blankUrl ||
    iframeEl.src === blankUrl ||
    iframeEl.src === ''
  ) {
    // iframe was already loaded, make sure we wait to trigger the listener
    // till _after_ the mutation that found this iframe has had time to process
    setTimeout(listener, 0);

    return iframeEl.addEventListener('load', listener); // keep listing for future loads
  }
  // use default listener
  iframeEl.addEventListener('load', listener);
}

function onceStylesheetLoaded(
  link: HTMLLinkElement,
  listener: () => unknown,
  styleSheetLoadTimeout: number,
) {
  let fired = false;
  let styleSheetLoaded: StyleSheet | null;
  try {
    styleSheetLoaded = link.sheet;
  } catch (error) {
    return;
  }

  if (styleSheetLoaded) return;

  const timer = setTimeout(() => {
    if (!fired) {
      listener();
      fired = true;
    }
  }, styleSheetLoadTimeout);

  link.addEventListener('load', () => {
    clearTimeout(timer);
    fired = true;
    listener();
  });
}

function serializeNode(
  n: Node,
  options: {
    doc: Document;
    mirror: Mirror;
    blockClass: string | RegExp;
    blockSelector: string | null;
    unblockSelector: string | null;
    maskAllText: boolean;
    maskAttributeFn: MaskAttributeFn | undefined;
    maskTextClass: string | RegExp;
    unmaskTextClass: string | RegExp | null;
    maskTextSelector: string | null;
    unmaskTextSelector: string | null;
    inlineStylesheet: boolean;
    maskInputOptions: MaskInputOptions;
    maskTextFn: MaskTextFn | undefined;
    maskInputFn: MaskInputFn | undefined;
    dataURLOptions?: DataURLOptions;
    inlineImages: boolean;
    recordCanvas: boolean;
    keepIframeSrcFn: KeepIframeSrcFn;
    /**
     * `newlyAddedElement: true` skips scrollTop and scrollLeft check
     */
    newlyAddedElement?: boolean;
  },
): serializedNode | false {
  const {
    doc,
    mirror,
    blockClass,
    blockSelector,
    unblockSelector,
    maskAllText,
    maskAttributeFn,
    maskTextClass,
    unmaskTextClass,
    maskTextSelector,
    unmaskTextSelector,
    inlineStylesheet,
    maskInputOptions = {},
    maskTextFn,
    maskInputFn,
    dataURLOptions = {},
    inlineImages,
    recordCanvas,
    keepIframeSrcFn,
    newlyAddedElement = false,
  } = options;
  // Only record root id when document object is not the base document
  const rootId = getRootId(doc, mirror);
  switch (n.nodeType) {
    case n.DOCUMENT_NODE:
      if ((n as Document).compatMode !== 'CSS1Compat') {
        return {
          type: NodeType.Document,
          childNodes: [],
          compatMode: (n as Document).compatMode, // probably "BackCompat"
        };
      } else {
        return {
          type: NodeType.Document,
          childNodes: [],
        };
      }
    case n.DOCUMENT_TYPE_NODE:
      return {
        type: NodeType.DocumentType,
        name: (n as DocumentType).name,
        publicId: (n as DocumentType).publicId,
        systemId: (n as DocumentType).systemId,
        rootId,
      };
    case n.ELEMENT_NODE:
      return serializeElementNode(n as HTMLElement, {
        doc,
        blockClass,
        blockSelector,
        unblockSelector,
        inlineStylesheet,
        maskAttributeFn,
        maskInputOptions,
        maskInputFn,
        dataURLOptions,
        inlineImages,
        recordCanvas,
        keepIframeSrcFn,
        newlyAddedElement,
        rootId,
        maskAllText,
        maskTextClass,
        unmaskTextClass,
        maskTextSelector,
        unmaskTextSelector,
      });
    case n.TEXT_NODE:
      return serializeTextNode(n as Text, {
        doc,
        maskAllText,
        maskTextClass,
        unmaskTextClass,
        maskTextSelector,
        unmaskTextSelector,
        maskTextFn,
        maskInputOptions,
        maskInputFn,
        rootId,
      });
    case n.CDATA_SECTION_NODE:
      return {
        type: NodeType.CDATA,
        textContent: '',
        rootId,
      };
    case n.COMMENT_NODE:
      return {
        type: NodeType.Comment,
        textContent: (n as Comment).textContent || '',
        rootId,
      };
    default:
      return false;
  }
}

function getRootId(doc: Document, mirror: Mirror): number | undefined {
  if (!mirror.hasNode(doc)) return undefined;
  const docId = mirror.getId(doc);
  return docId === 1 ? undefined : docId;
}

function serializeTextNode(
  n: Text,
  options: {
    doc: Document;
    maskAllText: boolean;
    maskTextClass: string | RegExp;
    unmaskTextClass: string | RegExp | null;
    maskTextSelector: string | null;
    unmaskTextSelector: string | null;
    maskTextFn: MaskTextFn | undefined;
    maskInputOptions: MaskInputOptions;
    maskInputFn: MaskInputFn | undefined;
    rootId: number | undefined;
  },
): serializedNode {
  const {
    maskAllText,
    maskTextClass,
    unmaskTextClass,
    maskTextSelector,
    unmaskTextSelector,
    maskTextFn,
    maskInputOptions,
    maskInputFn,
    rootId,
  } = options;
  // The parent node may not be a html element which has a tagName attribute.
  // So just let it be undefined which is ok in this use case.
  const parentTagName = n.parentNode && (n.parentNode as HTMLElement).tagName;
  let textContent = n.textContent;
  const isStyle = parentTagName === 'STYLE' ? true : undefined;
  const isScript = parentTagName === 'SCRIPT' ? true : undefined;
  const isTextarea = parentTagName === 'TEXTAREA' ? true : undefined;
  if (isStyle && textContent) {
    try {
      // try to read style sheet
      if (n.nextSibling || n.previousSibling) {
        // This is not the only child of the stylesheet.
        // We can't read all of the sheet's .cssRules and expect them
        // to _only_ include the current rule(s) added by the text node.
        // So we'll be conservative and keep textContent as-is.
      } else if ((n.parentNode as HTMLStyleElement).sheet?.cssRules) {
        textContent = stringifyStylesheet(
          (n.parentNode as HTMLStyleElement).sheet!,
        );
      }
    } catch (err) {
      console.warn(
        `Cannot get CSS styles from text's parentNode. Error: ${err as string}`,
        n,
      );
    }
    textContent = absoluteToStylesheet(textContent, getHref(options.doc));
  }
  if (isScript) {
    textContent = 'SCRIPT_PLACEHOLDER';
  }
  const forceMask = needMaskingText(
    n,
    maskTextClass,
    maskTextSelector,
    unmaskTextClass,
    unmaskTextSelector,
    maskAllText,
  );

  if (!isStyle && !isScript && !isTextarea && textContent && forceMask) {
    textContent = maskTextFn
      ? maskTextFn(textContent, n.parentElement)
      : textContent.replace(/[\S]/g, '*');
  }
  if (isTextarea && textContent && (maskInputOptions.textarea || forceMask)) {
    textContent = maskInputFn
      ? maskInputFn(textContent, n.parentNode as HTMLElement)
      : textContent.replace(/[\S]/g, '*');
  }

  // Handle <option> text like an input value
  if (parentTagName === 'OPTION' && textContent) {
    const isInputMasked = shouldMaskInput({
      type: null,
      tagName: parentTagName,
      maskInputOptions,
    });

    textContent = maskInputValue({
      isMasked: needMaskingText(
        n,
        maskTextClass,
        maskTextSelector,
        unmaskTextClass,
        unmaskTextSelector,
        isInputMasked,
      ),
      element: n as unknown as HTMLElement,
      value: textContent,
      maskInputFn,
    });
  }

  return {
    type: NodeType.Text,
    textContent: textContent || '',
    isStyle,
    rootId,
  };
}

function serializeElementNode(
  n: HTMLElement,
  options: {
    doc: Document;
    blockClass: string | RegExp;
    blockSelector: string | null;
    unblockSelector: string | null;
    inlineStylesheet: boolean;
    maskAttributeFn: MaskAttributeFn | undefined;
    maskInputOptions: MaskInputOptions;
    maskInputFn: MaskInputFn | undefined;
    dataURLOptions?: DataURLOptions;
    inlineImages: boolean;
    recordCanvas: boolean;
    keepIframeSrcFn: KeepIframeSrcFn;
    /**
     * `newlyAddedElement: true` skips scrollTop and scrollLeft check
     */
    newlyAddedElement?: boolean;
    rootId: number | undefined;
    maskAllText: boolean;
    maskTextClass: string | RegExp;
    unmaskTextClass: string | RegExp | null;
    maskTextSelector: string | null;
    unmaskTextSelector: string | null;
  },
): serializedNode | false {
  const {
    doc,
    blockClass,
    blockSelector,
    unblockSelector,
    inlineStylesheet,
    maskInputOptions = {},
    maskAttributeFn,
    maskInputFn,
    dataURLOptions = {},
    inlineImages,
    recordCanvas,
    keepIframeSrcFn,
    newlyAddedElement = false,
    rootId,
    maskTextClass,
    unmaskTextClass,
    maskTextSelector,
    unmaskTextSelector,
  } = options;
  const needBlock = _isBlockedElement(
    n,
    blockClass,
    blockSelector,
    unblockSelector,
  );
  const tagName = getValidTagName(n);
  let attributes: attributes = {};
  const len = n.attributes.length;
  for (let i = 0; i < len; i++) {
    const attr = n.attributes[i];
    // Looks like `attr.name` can be undefined although the types say differently
    // see: https://github.com/getsentry/sentry-javascript/issues/10292
    if (attr.name && !ignoreAttribute(tagName, attr.name, attr.value)) {
      attributes[attr.name] = transformAttribute(
        doc,
        tagName,
        toLowerCase(attr.name),
        attr.value,
        n,
        maskAttributeFn,
      );
    }
  }
  // remote css
  if (tagName === 'link' && inlineStylesheet) {
    const stylesheet = Array.from(doc.styleSheets).find((s) => {
      return s.href === (n as HTMLLinkElement).href;
    });
    let cssText: string | null = null;
    if (stylesheet) {
      cssText = stringifyStylesheet(stylesheet);
    }
    if (cssText) {
      attributes.rel = null;
      attributes.href = null;
      attributes.crossorigin = null;
      attributes._cssText = absoluteToStylesheet(cssText, stylesheet!.href!);
    }
  }
  // dynamic stylesheet
  if (
    tagName === 'style' &&
    (n as HTMLStyleElement).sheet &&
    // TODO: Currently we only try to get dynamic stylesheet when it is an empty style element
    !(n.innerText || n.textContent || '').trim().length
  ) {
    const cssText = stringifyStylesheet(
      (n as HTMLStyleElement).sheet as CSSStyleSheet,
    );
    if (cssText) {
      attributes._cssText = absoluteToStylesheet(cssText, getHref(doc));
    }
  }
  // form fields
  if (
    tagName === 'input' ||
    tagName === 'textarea' ||
    tagName === 'select' ||
    tagName === 'option'
  ) {
    const el = n as
      | HTMLInputElement
      | HTMLTextAreaElement
      | HTMLSelectElement
      | HTMLOptionElement;

    const type = getInputType(el);
    const value = getInputValue(el, toUpperCase(tagName), type);
    const checked = (el as HTMLInputElement).checked;
    if (type !== 'submit' && type !== 'button' && value) {
      const forceMask = needMaskingText(
        el,
        maskTextClass,
        maskTextSelector,
        unmaskTextClass,
        unmaskTextSelector,
        shouldMaskInput({
          type,
          tagName: toUpperCase(tagName),
          maskInputOptions,
        }),
      );

      attributes.value = maskInputValue({
        isMasked: forceMask,
        element: el,
        value,
        maskInputFn,
      });
    }
    if (checked) {
      attributes.checked = checked;
    }
  }
  if (tagName === 'option') {
    if ((n as HTMLOptionElement).selected && !maskInputOptions['select']) {
      attributes.selected = true;
    } else {
      // ignore the html attribute (which corresponds to DOM (n as HTMLOptionElement).defaultSelected)
      // if it's already been changed
      delete attributes.selected;
    }
  }
  // canvas image data
  if (tagName === 'canvas' && recordCanvas) {
    if ((n as ICanvas).__context === '2d') {
      // only record this on 2d canvas
      if (!is2DCanvasBlank(n as HTMLCanvasElement)) {
        attributes.rr_dataURL = (n as HTMLCanvasElement).toDataURL(
          dataURLOptions.type,
          dataURLOptions.quality,
        );
      }
    } else if (!('__context' in n)) {
      // context is unknown, better not call getContext to trigger it
      const canvasDataURL = (n as HTMLCanvasElement).toDataURL(
        dataURLOptions.type,
        dataURLOptions.quality,
      );

      // create blank canvas of same dimensions
      const blankCanvas = doc.createElement('canvas');
      blankCanvas.width = (n as HTMLCanvasElement).width;
      blankCanvas.height = (n as HTMLCanvasElement).height;
      const blankCanvasDataURL = blankCanvas.toDataURL(
        dataURLOptions.type,
        dataURLOptions.quality,
      );

      // no need to save dataURL if it's the same as blank canvas
      if (canvasDataURL !== blankCanvasDataURL) {
        attributes.rr_dataURL = canvasDataURL;
      }
    }
  }
  // save image offline
  if (tagName === 'img' && inlineImages) {
    if (!canvasService) {
      canvasService = doc.createElement('canvas');
      canvasCtx = canvasService.getContext('2d');
    }
    const image = n as HTMLImageElement;
    const imageSrc: string =
      image.currentSrc || image.getAttribute('src') || '<unknown-src>';
    const priorCrossOrigin = image.crossOrigin;
    const recordInlineImage = () => {
      image.removeEventListener('load', recordInlineImage);
      try {
        canvasService!.width = image.naturalWidth;
        canvasService!.height = image.naturalHeight;
        canvasCtx!.drawImage(image, 0, 0);
        attributes.rr_dataURL = canvasService!.toDataURL(
          dataURLOptions.type,
          dataURLOptions.quality,
        );
      } catch (err) {
        if (image.crossOrigin !== 'anonymous') {
          image.crossOrigin = 'anonymous';
          if (image.complete && image.naturalWidth !== 0)
            recordInlineImage(); // too early due to image reload
          else image.addEventListener('load', recordInlineImage);
          return;
        } else {
          console.warn(
            `Cannot inline img src=${imageSrc}! Error: ${err as string}`,
          );
        }
      }
      if (image.crossOrigin === 'anonymous') {
        priorCrossOrigin
          ? (attributes.crossOrigin = priorCrossOrigin)
          : image.removeAttribute('crossorigin');
      }
    };
    // The image content may not have finished loading yet.
    if (image.complete && image.naturalWidth !== 0) recordInlineImage();
    else image.addEventListener('load', recordInlineImage);
  }
  // media elements
  if (tagName === 'audio' || tagName === 'video') {
    attributes.rr_mediaState = (n as HTMLMediaElement).paused
      ? 'paused'
      : 'played';
    attributes.rr_mediaCurrentTime = (n as HTMLMediaElement).currentTime;
  }
  // Scroll
  if (!newlyAddedElement) {
    // `scrollTop` and `scrollLeft` are expensive calls because they trigger reflow.
    // Since `scrollTop` & `scrollLeft` are always 0 when an element is added to the DOM.
    // And scrolls also get picked up by rrweb's ScrollObserver
    // So we can safely skip the `scrollTop/Left` calls for newly added elements
    if (n.scrollLeft) {
      attributes.rr_scrollLeft = n.scrollLeft;
    }
    if (n.scrollTop) {
      attributes.rr_scrollTop = n.scrollTop;
    }
  }
  // block element
  if (needBlock) {
    const { width, height } = n.getBoundingClientRect();
    attributes = {
      class: attributes.class,
      rr_width: `${width}px`,
      rr_height: `${height}px`,
    };
  }
  // iframe
  if (tagName === 'iframe' && !keepIframeSrcFn(attributes.src as string)) {
    // Don't try to access `contentDocument` if iframe is blocked, otherwise it
    // will trigger browser warnings.
    if (!needBlock && !getIframeContentDocument(n as HTMLIFrameElement)) {
      // we can't record it directly as we can't see into it
      // preserve the src attribute so a decision can be taken at replay time
      attributes.rr_src = attributes.src;
    }
    delete attributes.src; // prevent auto loading
  }

  let isCustomElement: true | undefined;
  try {
    if (customElements.get(tagName)) isCustomElement = true;
  } catch (e) {
    // In case old browsers don't support customElements
  }

  return {
    type: NodeType.Element,
    tagName,
    attributes,
    childNodes: [],
    isSVG: isSVGElement(n as Element) || undefined,
    needBlock,
    rootId,
    isCustom: isCustomElement,
  };
}

function lowerIfExists(
  maybeAttr: string | number | boolean | undefined | null,
): string {
  if (maybeAttr === undefined || maybeAttr === null) {
    return '';
  } else {
    return (maybeAttr as string).toLowerCase();
  }
}

function slimDOMExcluded(
  sn: serializedNode,
  slimDOMOptions: SlimDOMOptions,
): boolean {
  if (slimDOMOptions.comment && sn.type === NodeType.Comment) {
    // TODO: convert IE conditional comments to real nodes
    return true;
  } else if (sn.type === NodeType.Element) {
    if (
      slimDOMOptions.script &&
      // script tag
      (sn.tagName === 'script' ||
        // (module)preload link
        (sn.tagName === 'link' &&
          (sn.attributes.rel === 'preload' ||
            sn.attributes.rel === 'modulepreload')) ||
        // prefetch link
        (sn.tagName === 'link' &&
          sn.attributes.rel === 'prefetch' &&
          typeof sn.attributes.href === 'string' &&
          extractFileExtension(sn.attributes.href) === 'js'))
    ) {
      return true;
    } else if (
      slimDOMOptions.headFavicon &&
      ((sn.tagName === 'link' && sn.attributes.rel === 'shortcut icon') ||
        (sn.tagName === 'meta' &&
          (lowerIfExists(sn.attributes.name).match(
            /^msapplication-tile(image|color)$/,
          ) ||
            lowerIfExists(sn.attributes.name) === 'application-name' ||
            lowerIfExists(sn.attributes.rel) === 'icon' ||
            lowerIfExists(sn.attributes.rel) === 'apple-touch-icon' ||
            lowerIfExists(sn.attributes.rel) === 'shortcut icon')))
    ) {
      return true;
    } else if (sn.tagName === 'meta') {
      if (
        slimDOMOptions.headMetaDescKeywords &&
        lowerIfExists(sn.attributes.name).match(/^description|keywords$/)
      ) {
        return true;
      } else if (
        slimDOMOptions.headMetaSocial &&
        (lowerIfExists(sn.attributes.property).match(/^(og|twitter|fb):/) || // og = opengraph (facebook)
          lowerIfExists(sn.attributes.name).match(/^(og|twitter):/) ||
          lowerIfExists(sn.attributes.name) === 'pinterest')
      ) {
        return true;
      } else if (
        slimDOMOptions.headMetaRobots &&
        (lowerIfExists(sn.attributes.name) === 'robots' ||
          lowerIfExists(sn.attributes.name) === 'googlebot' ||
          lowerIfExists(sn.attributes.name) === 'bingbot')
      ) {
        return true;
      } else if (
        slimDOMOptions.headMetaHttpEquiv &&
        sn.attributes['http-equiv'] !== undefined
      ) {
        // e.g. X-UA-Compatible, Content-Type, Content-Language,
        // cache-control, X-Translated-By
        return true;
      } else if (
        slimDOMOptions.headMetaAuthorship &&
        (lowerIfExists(sn.attributes.name) === 'author' ||
          lowerIfExists(sn.attributes.name) === 'generator' ||
          lowerIfExists(sn.attributes.name) === 'framework' ||
          lowerIfExists(sn.attributes.name) === 'publisher' ||
          lowerIfExists(sn.attributes.name) === 'progid' ||
          lowerIfExists(sn.attributes.property).match(/^article:/) ||
          lowerIfExists(sn.attributes.property).match(/^product:/))
      ) {
        return true;
      } else if (
        slimDOMOptions.headMetaVerification &&
        (lowerIfExists(sn.attributes.name) === 'google-site-verification' ||
          lowerIfExists(sn.attributes.name) === 'yandex-verification' ||
          lowerIfExists(sn.attributes.name) === 'csrf-token' ||
          lowerIfExists(sn.attributes.name) === 'p:domain_verify' ||
          lowerIfExists(sn.attributes.name) === 'verify-v1' ||
          lowerIfExists(sn.attributes.name) === 'verification' ||
          lowerIfExists(sn.attributes.name) === 'shopify-checkout-api-token')
      ) {
        return true;
      }
    }
  }
  return false;
}

export function serializeNodeWithId(
  n: Node,
  options: {
    doc: Document;
    mirror: Mirror;
    blockClass: string | RegExp;
    blockSelector: string | null;
    unblockSelector: string | null;
    maskTextClass: string | RegExp;
    unmaskTextClass: string | RegExp | null;
    maskTextSelector: string | null;
    unmaskTextSelector: string | null;
    skipChild: boolean;
    inlineStylesheet: boolean;
    newlyAddedElement?: boolean;
    maskInputOptions?: MaskInputOptions;
    maskAllText: boolean;
    maskAttributeFn: MaskAttributeFn | undefined;
    maskTextFn: MaskTextFn | undefined;
    maskInputFn: MaskInputFn | undefined;
    slimDOMOptions: SlimDOMOptions;
    dataURLOptions?: DataURLOptions;
    keepIframeSrcFn?: KeepIframeSrcFn;
    inlineImages?: boolean;
    recordCanvas?: boolean;
    preserveWhiteSpace?: boolean;
    onSerialize?: (n: Node) => unknown;
    onIframeLoad?: (
      iframeNode: HTMLIFrameElement,
      node: serializedElementNodeWithId,
    ) => unknown;
    iframeLoadTimeout?: number;
    onStylesheetLoad?: (
      linkNode: HTMLLinkElement,
      node: serializedElementNodeWithId,
    ) => unknown;
    stylesheetLoadTimeout?: number;
  },
): serializedNodeWithId | null {
  const {
    doc,
    mirror,
    blockClass,
    blockSelector,
    unblockSelector,
    maskAllText,
    maskTextClass,
    unmaskTextClass,
    maskTextSelector,
    unmaskTextSelector,
    skipChild = false,
    inlineStylesheet = true,
    maskInputOptions = {},
    maskAttributeFn,
    maskTextFn,
    maskInputFn,
    slimDOMOptions,
    dataURLOptions = {},
    inlineImages = false,
    recordCanvas = false,
    onSerialize,
    onIframeLoad,
    iframeLoadTimeout = 5000,
    onStylesheetLoad,
    stylesheetLoadTimeout = 5000,
    keepIframeSrcFn = () => false,
    newlyAddedElement = false,
  } = options;
  let { preserveWhiteSpace = true } = options;
  const _serializedNode = serializeNode(n, {
    doc,
    mirror,
    blockClass,
    blockSelector,
    maskAllText,
    unblockSelector,
    maskTextClass,
    unmaskTextClass,
    maskTextSelector,
    unmaskTextSelector,
    inlineStylesheet,
    maskInputOptions,
    maskAttributeFn,
    maskTextFn,
    maskInputFn,
    dataURLOptions,
    inlineImages,
    recordCanvas,
    keepIframeSrcFn,
    newlyAddedElement,
  });
  if (!_serializedNode) {
    // TODO: dev only
    console.warn(n, 'not serialized');
    return null;
  }

  let id: number | undefined;
  if (mirror.hasNode(n)) {
    // Reuse the previous id
    id = mirror.getId(n);
  } else if (
    slimDOMExcluded(_serializedNode, slimDOMOptions) ||
    (!preserveWhiteSpace &&
      _serializedNode.type === NodeType.Text &&
      !_serializedNode.isStyle &&
      !_serializedNode.textContent.replace(/^\s+|\s+$/gm, '').length)
  ) {
    id = IGNORED_NODE;
  } else {
    id = genId();
  }

  const serializedNode = Object.assign(_serializedNode, { id });
  // add IGNORED_NODE to mirror to track nextSiblings
  mirror.add(n, serializedNode);

  if (id === IGNORED_NODE) {
    return null; // slimDOM
  }

  if (onSerialize) {
    onSerialize(n);
  }
  let recordChild = !skipChild;
  if (serializedNode.type === NodeType.Element) {
    recordChild = recordChild && !serializedNode.needBlock;
    // this property was not needed in replay side
    delete serializedNode.needBlock;
    const shadowRoot = (n as HTMLElement).shadowRoot;
    if (shadowRoot && isNativeShadowDom(shadowRoot))
      serializedNode.isShadowHost = true;
  }
  if (
    (serializedNode.type === NodeType.Document ||
      serializedNode.type === NodeType.Element) &&
    recordChild
  ) {
    if (
      slimDOMOptions.headWhitespace &&
      serializedNode.type === NodeType.Element &&
      serializedNode.tagName === 'head'
      // would impede performance: || getComputedStyle(n)['white-space'] === 'normal'
    ) {
      preserveWhiteSpace = false;
    }
    const bypassOptions = {
      doc,
      mirror,
      blockClass,
      blockSelector,
      maskAllText,
      unblockSelector,
      maskTextClass,
      unmaskTextClass,
      maskTextSelector,
      unmaskTextSelector,
      skipChild,
      inlineStylesheet,
      maskInputOptions,
      maskAttributeFn,
      maskTextFn,
      maskInputFn,
      slimDOMOptions,
      dataURLOptions,
      inlineImages,
      recordCanvas,
      preserveWhiteSpace,
      onSerialize,
      onIframeLoad,
      iframeLoadTimeout,
      onStylesheetLoad,
      stylesheetLoadTimeout,
      keepIframeSrcFn,
    };
    const childNodes = n.childNodes ? Array.from(n.childNodes) : [];
    for (const childN of childNodes) {
      const serializedChildNode = serializeNodeWithId(childN, bypassOptions);
      if (serializedChildNode) {
        serializedNode.childNodes.push(serializedChildNode);
      }
    }

    if (isElement(n) && n.shadowRoot) {
      for (const childN of Array.from(n.shadowRoot.childNodes)) {
        const serializedChildNode = serializeNodeWithId(childN, bypassOptions);
        if (serializedChildNode) {
          isNativeShadowDom(n.shadowRoot) &&
            (serializedChildNode.isShadow = true);
          serializedNode.childNodes.push(serializedChildNode);
        }
      }
    }
  }

  if (
    n.parentNode &&
    isShadowRoot(n.parentNode) &&
    isNativeShadowDom(n.parentNode)
  ) {
    serializedNode.isShadow = true;
  }

  if (
    serializedNode.type === NodeType.Element &&
    serializedNode.tagName === 'iframe' &&
    !_isBlockedElement(
      n as HTMLIFrameElement,
      blockClass,
      blockSelector,
      unblockSelector,
    )
  ) {
    onceIframeLoaded(
      n as HTMLIFrameElement,
      () => {
        const iframeDoc = getIframeContentDocument(n as HTMLIFrameElement);
        if (iframeDoc && onIframeLoad) {
          const serializedIframeNode = serializeNodeWithId(iframeDoc, {
            doc: iframeDoc,
            mirror,
            blockClass,
            blockSelector,
            unblockSelector,
            maskAllText,
            maskTextClass,
            unmaskTextClass,
            maskTextSelector,
            unmaskTextSelector,
            skipChild: false,
            inlineStylesheet,
            maskInputOptions,
            maskAttributeFn,
            maskTextFn,
            maskInputFn,
            slimDOMOptions,
            dataURLOptions,
            inlineImages,
            recordCanvas,
            preserveWhiteSpace,
            onSerialize,
            onIframeLoad,
            iframeLoadTimeout,
            onStylesheetLoad,
            stylesheetLoadTimeout,
            keepIframeSrcFn,
          });

          if (serializedIframeNode) {
            onIframeLoad(
              n as HTMLIFrameElement,
              serializedIframeNode as serializedElementNodeWithId,
            );
          }
        }
      },
      iframeLoadTimeout,
    );
  }

  // <link rel=stylesheet href=...>
  if (
    serializedNode.type === NodeType.Element &&
    serializedNode.tagName === 'link' &&
    typeof serializedNode.attributes.rel === 'string' &&
    (serializedNode.attributes.rel === 'stylesheet' ||
      (serializedNode.attributes.rel === 'preload' &&
        typeof serializedNode.attributes.href === 'string' &&
        extractFileExtension(serializedNode.attributes.href) === 'css'))
  ) {
    onceStylesheetLoaded(
      n as HTMLLinkElement,
      () => {
        if (onStylesheetLoad) {
          const serializedLinkNode = serializeNodeWithId(n, {
            doc,
            mirror,
            blockClass,
            blockSelector,
            unblockSelector,
            maskAllText,
            maskTextClass,
            unmaskTextClass,
            maskTextSelector,
            unmaskTextSelector,
            skipChild: false,
            inlineStylesheet,
            maskInputOptions,
            maskAttributeFn,
            maskTextFn,
            maskInputFn,
            slimDOMOptions,
            dataURLOptions,
            inlineImages,
            recordCanvas,
            preserveWhiteSpace,
            onSerialize,
            onIframeLoad,
            iframeLoadTimeout,
            onStylesheetLoad,
            stylesheetLoadTimeout,
            keepIframeSrcFn,
          });

          if (serializedLinkNode) {
            onStylesheetLoad(
              n as HTMLLinkElement,
              serializedLinkNode as serializedElementNodeWithId,
            );
          }
        }
      },
      stylesheetLoadTimeout,
    );
  }

  return serializedNode;
}

function snapshot(
  n: Document,
  options?: {
    mirror?: Mirror;
    blockClass?: string | RegExp;
    blockSelector?: string | null;
    unblockSelector?: string | null;
    maskAllText?: boolean;
    maskTextClass?: string | RegExp;
    unmaskTextClass?: string | RegExp | null;
    maskTextSelector?: string | null;
    unmaskTextSelector?: string | null;
    inlineStylesheet?: boolean;
    maskAllInputs?: boolean | MaskInputOptions;
    maskAttributeFn?: MaskAttributeFn;
    maskTextFn?: MaskTextFn;
    maskInputFn?: MaskInputFn;
    slimDOM?: 'all' | boolean | SlimDOMOptions;
    dataURLOptions?: DataURLOptions;
    inlineImages?: boolean;
    recordCanvas?: boolean;
    preserveWhiteSpace?: boolean;
    onSerialize?: (n: Node) => unknown;
    onIframeLoad?: (
      iframeNode: HTMLIFrameElement,
      node: serializedElementNodeWithId,
    ) => unknown;
    iframeLoadTimeout?: number;
    onStylesheetLoad?: (
      linkNode: HTMLLinkElement,
      node: serializedElementNodeWithId,
    ) => unknown;
    stylesheetLoadTimeout?: number;
    keepIframeSrcFn?: KeepIframeSrcFn;
  },
): serializedNodeWithId | null {
  const {
    mirror = new Mirror(),
    blockClass = 'rr-block',
    blockSelector = null,
    unblockSelector = null,
    maskAllText = false,
    maskTextClass = 'rr-mask',
    unmaskTextClass = null,
    maskTextSelector = null,
    unmaskTextSelector = null,
    inlineStylesheet = true,
    inlineImages = false,
    recordCanvas = false,
    maskAllInputs = false,
    maskAttributeFn,
    maskTextFn,
    maskInputFn,
    slimDOM = false,
    dataURLOptions,
    preserveWhiteSpace,
    onSerialize,
    onIframeLoad,
    iframeLoadTimeout,
    onStylesheetLoad,
    stylesheetLoadTimeout,
    keepIframeSrcFn = () => false,
  } = options || {};
  const maskInputOptions: MaskInputOptions =
    maskAllInputs === true
      ? {
          color: true,
          date: true,
          'datetime-local': true,
          email: true,
          month: true,
          number: true,
          range: true,
          search: true,
          tel: true,
          text: true,
          time: true,
          url: true,
          week: true,
          textarea: true,
          select: true,
        }
      : maskAllInputs === false
      ? {}
      : maskAllInputs;
  const slimDOMOptions: SlimDOMOptions =
    slimDOM === true || slimDOM === 'all'
      ? // if true: set of sensible options that should not throw away any information
        {
          script: true,
          comment: true,
          headFavicon: true,
          headWhitespace: true,
          headMetaDescKeywords: slimDOM === 'all', // destructive
          headMetaSocial: true,
          headMetaRobots: true,
          headMetaHttpEquiv: true,
          headMetaAuthorship: true,
          headMetaVerification: true,
        }
      : slimDOM === false
      ? {}
      : slimDOM;
  return serializeNodeWithId(n, {
    doc: n,
    mirror,
    blockClass,
    blockSelector,
    unblockSelector,
    maskAllText,
    maskTextClass,
    unmaskTextClass,
    maskTextSelector,
    unmaskTextSelector,
    skipChild: false,
    inlineStylesheet,
    maskInputOptions,
    maskAttributeFn,
    maskTextFn,
    maskInputFn,
    slimDOMOptions,
    dataURLOptions,
    inlineImages,
    recordCanvas,
    preserveWhiteSpace,
    onSerialize,
    onIframeLoad,
    iframeLoadTimeout,
    onStylesheetLoad,
    stylesheetLoadTimeout,
    keepIframeSrcFn,
    newlyAddedElement: false,
  });
}

export function visitSnapshot(
  node: serializedNodeWithId,
  onVisit: (node: serializedNodeWithId) => unknown,
) {
  function walk(current: serializedNodeWithId) {
    onVisit(current);
    if (
      current.type === NodeType.Document ||
      current.type === NodeType.Element
    ) {
      current.childNodes.forEach(walk);
    }
  }

  walk(node);
}

export function cleanupSnapshot() {
  // allow a new recording to start numbering nodes from scratch
  _id = 1;
}

export default snapshot;
