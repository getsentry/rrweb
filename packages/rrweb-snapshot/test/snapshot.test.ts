/**
 * @vitest-environment jsdom
 */
import { JSDOM } from 'jsdom';
import { describe, it, expect, vi } from 'vitest';
import {
  absoluteToStylesheet,
  serializeNodeWithId,
  transformAttribute,
  _isBlockedElement,
  needMaskingText,
} from '../src/snapshot';
import snapshot from '../src/snapshot';
import { serializedNodeWithId, NodeType } from '../src/types';
import { Mirror } from '../src/utils';

describe('absolute url to stylesheet', () => {
  const href = 'http://localhost/css/style.css';

  it('can handle relative path', () => {
    expect(absoluteToStylesheet('url(a.jpg)', href)).toEqual(
      `url(http://localhost/css/a.jpg)`,
    );
  });

  it('can handle same level path', () => {
    expect(absoluteToStylesheet('url("./a.jpg")', href)).toEqual(
      `url("http://localhost/css/a.jpg")`,
    );
  });

  it('can handle parent level path', () => {
    expect(absoluteToStylesheet('url("../a.jpg")', href)).toEqual(
      `url("http://localhost/a.jpg")`,
    );
  });

  it('can handle absolute path', () => {
    expect(absoluteToStylesheet('url("/a.jpg")', href)).toEqual(
      `url("http://localhost/a.jpg")`,
    );
  });

  it('can handle external path', () => {
    expect(absoluteToStylesheet('url("http://localhost/a.jpg")', href)).toEqual(
      `url("http://localhost/a.jpg")`,
    );
  });

  it('can handle single quote path', () => {
    expect(absoluteToStylesheet(`url('./a.jpg')`, href)).toEqual(
      `url('http://localhost/css/a.jpg')`,
    );
  });

  it('can handle no quote path', () => {
    expect(absoluteToStylesheet('url(./a.jpg)', href)).toEqual(
      `url(http://localhost/css/a.jpg)`,
    );
  });

  it('can handle multiple no quote paths', () => {
    expect(
      absoluteToStylesheet(
        'background-image: url(images/b.jpg);background: #aabbcc url(images/a.jpg) 50% 50% repeat;',
        href,
      ),
    ).toEqual(
      `background-image: url(http://localhost/css/images/b.jpg);` +
        `background: #aabbcc url(http://localhost/css/images/a.jpg) 50% 50% repeat;`,
    );
  });

  it('can handle data url image', () => {
    expect(
      absoluteToStylesheet('url(data:image/gif;base64,ABC)', href),
    ).toEqual('url(data:image/gif;base64,ABC)');
    expect(
      absoluteToStylesheet(
        'url(data:application/font-woff;base64,d09GMgABAAAAAAm)',
        href,
      ),
    ).toEqual('url(data:application/font-woff;base64,d09GMgABAAAAAAm)');
  });

  it('preserves quotes around inline svgs with spaces', () => {
    expect(
      absoluteToStylesheet(
        "url(\"data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 8 8'%3E%3Cpath fill='%2328a745' d='M3'/%3E%3C/svg%3E\")",
        href,
      ),
    ).toEqual(
      "url(\"data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 8 8'%3E%3Cpath fill='%2328a745' d='M3'/%3E%3C/svg%3E\")",
    );
    expect(
      absoluteToStylesheet(
        'url(\'data:image/svg+xml;utf8,<svg width="28" height="32" viewBox="0 0 28 32" xmlns="http://www.w3.org/2000/svg"><path d="M27 14C28" fill="white"/></svg>\')',
        href,
      ),
    ).toEqual(
      'url(\'data:image/svg+xml;utf8,<svg width="28" height="32" viewBox="0 0 28 32" xmlns="http://www.w3.org/2000/svg"><path d="M27 14C28" fill="white"/></svg>\')',
    );
    expect(
      absoluteToStylesheet(
        'url("data:image/svg+xml;utf8,<svg width="28" height="32" viewBox="0 0 28 32" xmlns="http://www.w3.org/2000/svg"><path d="M27 14C28" fill="white"/></svg>")',
        href,
      ),
    ).toEqual(
      'url("data:image/svg+xml;utf8,<svg width="28" height="32" viewBox="0 0 28 32" xmlns="http://www.w3.org/2000/svg"><path d="M27 14C28" fill="white"/></svg>")',
    );
  });
  it('can handle empty path', () => {
    expect(absoluteToStylesheet(`url('')`, href)).toEqual(`url('')`);
  });
});

describe('transformAttribute()', () => {
  it('handles empty attribute value', () => {
    expect(
      transformAttribute(
        document,
        'a',
        'data-loading',
        null,
        document.createElement('span'),
        undefined,
      ),
    ).toBe(null);
    expect(
      transformAttribute(
        document,
        'a',
        'data-loading',
        '',
        document.createElement('span'),
        undefined,
      ),
    ).toBe('');
  });

  it('handles custom masking function', () => {
    const maskAttributeFn = vi
      .fn()
      .mockImplementation((_key, value): string => {
        return value.split('').reverse().join('');
      }) as any;
    expect(
      transformAttribute(
        document,
        'a',
        'data-loading',
        'foo',
        document.createElement('span'),
        maskAttributeFn,
      ),
    ).toBe('oof');
    expect(maskAttributeFn).toHaveBeenCalledTimes(1);
  });
});

describe('isBlockedElement()', () => {
  const subject = (html: string, opt: any = {}) =>
    _isBlockedElement(
      render(html),
      'rr-block',
      opt.blockSelector,
      opt.unblockSelector,
    );

  const render = (html: string): HTMLElement =>
    JSDOM.fragment(html).querySelector('div')!;

  it('can handle empty elements', () => {
    expect(subject('<div />')).toEqual(false);
  });

  it('blocks prohibited className', () => {
    expect(subject('<div class="foo rr-block bar" />')).toEqual(true);
  });

  it('does not block random data selector', () => {
    expect(subject('<div data-rr-block />')).toEqual(false);
  });

  it('blocks blocked selector', () => {
    expect(
      subject('<div data-rr-block />', { blockSelector: '[data-rr-block]' }),
    ).toEqual(true);
  });
});

describe('style elements', () => {
  const serializeNode = (node: Node): serializedNodeWithId | null => {
    return serializeNodeWithId(node, {
      doc: document,
      mirror: new Mirror(),
      blockClass: 'blockblock',
      blockSelector: null,
      unblockSelector: null,
      maskAllText: false,
      maskTextClass: 'maskmask',
      unmaskTextClass: 'unmaskmask',
      maskTextSelector: null,
      unmaskTextSelector: null,
      skipChild: false,
      inlineStylesheet: true,
      maskAttributeFn: undefined,
      maskTextFn: undefined,
      maskInputFn: undefined,
      slimDOMOptions: {},
    });
  };

  const render = (html: string): HTMLStyleElement => {
    document.write(html);
    return document.querySelector('style')!;
  };

  it('should serialize all rules of stylesheet when the sheet has a single child node', () => {
    const styleEl = render(`<style>body { color: red; }</style>`);
    styleEl.sheet?.insertRule('section { color: blue; }');
    expect(serializeNode(styleEl.childNodes[0])).toMatchObject({
      isStyle: true,
      rootId: undefined,
      textContent: 'section {color: blue;}body {color: red;}',
      type: 3,
    });
  });

  it('should serialize individual text nodes on stylesheets with multiple child nodes', () => {
    const styleEl = render(`<style>body { color: red; }</style>`);
    styleEl.append(document.createTextNode('section { color: blue; }'));
    expect(serializeNode(styleEl.childNodes[1])).toMatchObject({
      isStyle: true,
      rootId: undefined,
      textContent: 'section { color: blue; }',
      type: 3,
    });
  });
});

describe('iframe', () => {
  const serializeNode = (node: Node): serializedNodeWithId | null => {
    return serializeNodeWithId(node, {
      doc: document,
      mirror: new Mirror(),
      blockClass: 'blockblock',
      blockSelector: null,
      unblockSelector: null,
      maskAllText: false,
      maskTextClass: 'maskmask',
      unmaskTextClass: null,
      maskTextSelector: null,
      unmaskTextSelector: null,
      skipChild: false,
      inlineStylesheet: true,
      maskAttributeFn: undefined,
      maskTextFn: undefined,
      maskInputFn: undefined,
      slimDOMOptions: {},
      newlyAddedElement: false,
    });
  };

  const render = (html: string): HTMLDivElement => {
    document.write(html);
    return document.querySelector('iframe')!;
  };

  it('serializes', () => {
    // Not sure how to trigger condition where we can't access
    // `iframe.contentDocument` due to CORS. Ideally it should have `rr_src`
    // attribute
    const el = render(`<iframe src="https://example.dev"/>`);
    expect(serializeNode(el)).toMatchObject({
      attributes: {},
    });
  });

  it('can be blocked', () => {
    const el = render(`<iframe class="blockblock" src="https://example.dev"/>`);
    expect(serializeNode(el)).toMatchObject({
      attributes: {
        class: 'blockblock',
        rr_height: '0px',
        rr_width: '0px',
      },
    });
  });
});

describe('scrollTop/scrollLeft', () => {
  const serializeNode = (node: Node): serializedNodeWithId | null => {
    return serializeNodeWithId(node, {
      doc: document,
      mirror: new Mirror(),
      blockClass: 'blockblock',
      blockSelector: null,
      unblockSelector: null,
      maskAllText: false,
      maskTextClass: 'maskmask',
      unmaskTextClass: 'unmaskmask',
      maskTextSelector: null,
      unmaskTextSelector: null,
      skipChild: false,
      inlineStylesheet: true,
      maskAttributeFn: undefined,
      maskTextFn: undefined,
      maskInputFn: undefined,
      slimDOMOptions: {},
      newlyAddedElement: false,
    });
  };

  const render = (html: string): HTMLDivElement => {
    document.write(html);
    return document.querySelector('div')!;
  };

  it('should serialize scroll positions', () => {
    const el = render(`<div stylel='overflow: auto; width: 1px; height: 1px;'>
      Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.
    </div>`);
    el.scrollTop = 10;
    el.scrollLeft = 20;
    expect(serializeNode(el)).toMatchObject({
      attributes: {
        rr_scrollTop: 10,
        rr_scrollLeft: 20,
      },
    });
  });
});

describe('needMaskingText', () => {
  const render = (html: string): HTMLDivElement => {
    document.write(html);
    return document.querySelector('div')!;
  };

  it('should not mask by default', () => {
    const el = render(`<div class='foo'>Lorem ipsum</div>`);
    expect(
      needMaskingText(el, 'maskmask', null, 'unmaskmask', null, false),
    ).toEqual(false);
  });

  it('should mask if the masking class is matched', () => {
    const el = render(`<div class='foo maskmask'>Lorem ipsum</div>`);
    expect(
      needMaskingText(el, 'maskmask', null, 'unmaskmask', null, false),
    ).toEqual(true);
    expect(
      needMaskingText(el, /^maskmask$/, null, /^unmaskmask$/, null, false),
    ).toEqual(true);
  });

  it('should mask if the masking class is matched on an ancestor', () => {
    const el = render(
      `<div class='foo maskmask'><span>Lorem ipsum</span></div>`,
    );
    expect(
      needMaskingText(
        el.children[0],
        'maskmask',
        null,
        'unmaskmask',
        null,
        false,
      ),
    ).toEqual(true);
    expect(
      needMaskingText(
        el.children[0],
        /^maskmask$/,
        null,
        /^unmaskmask$/,
        null,
        false,
      ),
    ).toEqual(true);
  });

  it('should mask if the masking selector is matched', () => {
    const el = render(`<div class='foo'>Lorem ipsum</div>`);
    expect(
      needMaskingText(el, 'maskmask', '.foo', 'unmaskmask', null, false),
    ).toEqual(true);
  });

  it('should mask if the masking selector is matched on an ancestor', () => {
    const el = render(`<div class='foo'><span>Lorem ipsum</span></div>`);
    expect(
      needMaskingText(
        el.children[0],
        'maskmask',
        '.foo',
        'unmaskmask',
        null,
        false,
      ),
    ).toEqual(true);
  });

  it('should mask by default', () => {
    const el = render(`<div class='foo'>Lorem ipsum</div>`);
    expect(
      needMaskingText(el, 'maskmask', null, 'unmaskmask', null, true),
    ).toEqual(true);
  });

  it('should not mask if the un-masking class is matched', () => {
    const el = render(`<div class='foo unmaskmask'>Lorem ipsum</div>`);
    expect(
      needMaskingText(el, 'maskmask', null, 'unmaskmask', null, true),
    ).toEqual(false);
    expect(
      needMaskingText(el, /^maskmask$/, null, /^unmaskmask$/, null, true),
    ).toEqual(false);
  });

  it('should not mask if the un-masking class is matched on an ancestor', () => {
    const el = render(
      `<div class='foo unmaskmask'><span>Lorem ipsum</span></div>`,
    );
    expect(
      needMaskingText(
        el.children[0],
        'maskmask',
        null,
        'unmaskmask',
        null,
        true,
      ),
    ).toEqual(false);
    expect(
      needMaskingText(
        el.children[0],
        /^maskmask$/,
        null,
        /^unmaskmask$/,
        null,
        true,
      ),
    ).toEqual(false);
  });

  it('should mask if the masking class is more specific than the unmasking class', () => {
    const el = render(
      `<div class='unmaskmask'><div class='maskmask'><span>Lorem ipsum</span><div></div>`,
    );
    expect(
      needMaskingText(
        el.children[0].children[0],
        'maskmask',
        null,
        'unmaskmask',
        null,
        false,
      ),
    ).toEqual(true);
    expect(
      needMaskingText(
        el.children[0].children[0],
        /^maskmask$/,
        null,
        /^unmaskmask$/,
        null,
        false,
      ),
    ).toEqual(true);
  });

  it('should not mask if the unmasking class is more specific than the masking class', () => {
    const el = render(
      `<div class='maskmask'><div class='unmaskmask'><span>Lorem ipsum</span><div></div>`,
    );
    expect(
      needMaskingText(
        el.children[0].children[0],
        'maskmask',
        null,
        'unmaskmask',
        null,
        false,
      ),
    ).toEqual(false);
    expect(
      needMaskingText(
        el.children[0].children[0],
        /^maskmask$/,
        null,
        /^unmaskmask$/,
        null,
        false,
      ),
    ).toEqual(false);
  });

  it('should not mask if the unmasking selector is matched', () => {
    const el = render(`<div class='foo'>Lorem ipsum</div>`);
    expect(
      needMaskingText(el, 'maskmask', null, 'unmaskmask', '.foo', true),
    ).toEqual(false);
  });

  it('should not mask if the unmasking selector is matched on an ancestor', () => {
    const el = render(`<div class='foo'><span>Lorem ipsum</span></div>`);
    expect(
      needMaskingText(
        el.children[0],
        'maskmask',
        null,
        'unmaskmask',
        '.foo',
        true,
      ),
    ).toEqual(false);
  });

  it('should mask if the masking selector is more specific than the unmasking selector', () => {
    const el = render(
      `<div class='foo'><div class='bar'><span>Lorem ipsum</span><div></div>`,
    );
    expect(
      needMaskingText(
        el.children[0].children[0],
        'maskmask',
        '.bar',
        'unmaskmask',
        '.foo',
        false,
      ),
    ).toEqual(true);
  });

  it('should not mask if the unmasking selector is more specific than the masking selector', () => {
    const el = render(
      `<div class='bar'><div class='foo'><span>Lorem ipsum</span><div></div>`,
    );
    expect(
      needMaskingText(
        el.children[0].children[0],
        'maskmask',
        '.bar',
        'unmaskmask',
        '.foo',
        false,
      ),
    ).toEqual(false);
  });

  describe('enforced masking', () => {
    it.each([
      'current-password',
      'new-password',
      'cc-number',
      'cc-exp',
      'cc-exp-month',
      'cc-exp-year',
      'cc-csc',
    ])('enforces masking for autocomplete="%s"', (autocompleteValue) => {
      document.write(
        `<input autocomplete='${autocompleteValue}' value='initial' class='unmaskmask'></input>`,
      );
      const el = document.querySelector('input')!;
      expect(
        needMaskingText(el, 'maskmask', '.foo', 'unmaskmask', null, false),
      ).toEqual(true);
    });

    it('does not mask other autocomplete values', () => {
      document.write(
        `<input autocomplete='name' value='initial' class='unmaskmask'></input>`,
      );
      const el = document.querySelector('input')!;
      expect(
        needMaskingText(el, 'maskmask', '.foo', 'unmaskmask', null, false),
      ).toEqual(false);
    });
  });
});

describe('jsdom snapshot', () => {
  const render = (html: string): Document => {
    document.write(html);
    return document;
  };

  it("doesn't rely on global browser objects", () => {
    // this test is incomplete in terms of coverage,
    // but the idea being that we are checking that all features use the
    // passed-in `doc` object rather than the global `document`
    // (which is only present in browsers)
    // in any case, supporting jsdom is not a primary goal

    const doc = render(`<!DOCTYPE html><p>Hello world</p><canvas></canvas>`);
    const sn = snapshot(doc, {
      // JSDOM Error: Not implemented: HTMLCanvasElement.prototype.toDataURL (without installing the canvas npm package)
      //recordCanvas: true,
    });
    expect(sn).toMatchObject({
      type: 0,
    });
  });
});

describe('image loading', () => {
  const render = (html: string): Document => {
    document.write(html);
    return document;
  };

  it('should trigger onBlockedImageLoad callback when blocked image loads', async () => {
    const doc = render(`
      <!DOCTYPE html>
      <html>
        <head></head>
        <body>
          <div>
            <img src="data:image/gif;base64," class="rr-block" />
          </div>
        </body>
      </html>
    `);

    const mirror = new Mirror();
    const onBlockedImageLoad = vi.fn();

    // Mock the image to simulate incomplete loading
    const img = doc.querySelector('img') as HTMLImageElement;
    Object.defineProperty(img, 'complete', {
      value: false,
      writable: true,
    });

    // Serialize the node with the onBlockedImageLoad callback
    const serializedNode = serializeNodeWithId(img, {
      doc,
      mirror,
      blockClass: 'rr-block',
      blockSelector: null,
      unblockSelector: null,
      maskAllText: false,
      maskTextClass: 'rr-mask',
      unmaskTextClass: null,
      maskTextSelector: null,
      unmaskTextSelector: null,
      skipChild: false,
      inlineStylesheet: true,
      maskInputOptions: {},
      maskAttributeFn: undefined,
      maskTextFn: undefined,
      maskInputFn: undefined,
      slimDOMOptions: {},
      dataURLOptions: {},
      inlineImages: false,
      recordCanvas: false,
      preserveWhiteSpace: true,
      onSerialize: undefined,
      onIframeLoad: undefined,
      iframeLoadTimeout: 5000,
      onBlockedImageLoad,
      onStylesheetLoad: undefined,
      stylesheetLoadTimeout: 5000,
      keepIframeSrcFn: () => false,
      newlyAddedElement: false,
    });

    expect(serializedNode?.type).toEqual(NodeType.Element);
    if (serializedNode?.type === NodeType.Element) {
      // for typescript
      expect(serializedNode?.attributes.rr_width).toBe('0px');
      expect(serializedNode?.attributes.rr_height).toBe('0px');
    }

    // Mock getBoundingClientRect to return specific dimensions
    const mockRect = {
      width: 100,
      height: 150,
      top: 0,
      left: 0,
      bottom: 150,
      right: 100,
    };
    img.getBoundingClientRect = vi.fn().mockReturnValue(mockRect);

    // Simulate the image load event
    const loadEvent = new window.Event('load');
    img.dispatchEvent(loadEvent);

    // Verify that onBlockedImageLoad was called with correct parameters
    expect(onBlockedImageLoad).toHaveBeenCalledTimes(1);
    expect(onBlockedImageLoad).toHaveBeenCalledWith(
      img,
      serializedNode,
      mockRect,
    );
  });

  it('should not trigger onBlockedImageLoad for non-blocked images', async () => {
    const doc = render(`
      <!DOCTYPE html>
      <html>
        <head></head>
        <body>
          <div>
            <img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" />
          </div>
        </body>
      </html>
    `);

    const mirror = new Mirror();
    const onBlockedImageLoad = vi.fn();

    // Mock the image to simulate incomplete loading
    const img = doc.querySelector('img') as HTMLImageElement;
    Object.defineProperty(img, 'complete', {
      value: false,
      writable: true,
    });

    // Serialize the node with the onBlockedImageLoad callback
    const serializedNode = serializeNodeWithId(img, {
      doc,
      mirror,
      blockClass: 'rr-block',
      blockSelector: null,
      unblockSelector: null,
      maskAllText: false,
      maskTextClass: 'rr-mask',
      unmaskTextClass: null,
      maskTextSelector: null,
      unmaskTextSelector: null,
      skipChild: false,
      inlineStylesheet: true,
      maskInputOptions: {},
      maskAttributeFn: undefined,
      maskTextFn: undefined,
      maskInputFn: undefined,
      slimDOMOptions: {},
      dataURLOptions: {},
      inlineImages: false,
      recordCanvas: false,
      preserveWhiteSpace: true,
      onSerialize: undefined,
      onIframeLoad: undefined,
      iframeLoadTimeout: 5000,
      onBlockedImageLoad,
      onStylesheetLoad: undefined,
      stylesheetLoadTimeout: 5000,
      keepIframeSrcFn: () => false,
      newlyAddedElement: false,
    });

    expect(serializedNode).toEqual(
      expect.objectContaining({
        type: 2,
        tagName: 'img',
        attributes: {
          src: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=',
        },
        id: 1,
      }),
    );

    // Simulate the image load event
    const loadEvent = new window.Event('load');
    img.dispatchEvent(loadEvent);

    // Verify that onBlockedImageLoad was called with correct parameters
    expect(onBlockedImageLoad).not.toHaveBeenCalled();
  });

  it.only('should not trigger onBlockedImageLoad for already complete images', async () => {
    const doc = render(`
      <!DOCTYPE html>
      <html>
        <head></head>
        <body>
          <div>
            <img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" class="rr-block" />
          </div>
        </body>
      </html>
    `);

    const mirror = new Mirror();
    const onBlockedImageLoad = vi.fn();

    // Mock the image to simulate already complete loading
    const img = doc.querySelector('img') as HTMLImageElement;
    Object.defineProperty(img, 'complete', {
      value: true,
      writable: true,
    });

    // Mock getBoundingClientRect to return specific dimensions
    const mockRect = {
      width: 100,
      height: 150,
      top: 0,
      left: 0,
      bottom: 150,
      right: 100,
    };
    img.getBoundingClientRect = vi.fn().mockReturnValue(mockRect);

    // Serialize the node with the onBlockedImageLoad callback
    const serializedNode = serializeNodeWithId(img, {
      doc,
      mirror,
      blockClass: 'rr-block',
      blockSelector: null,
      unblockSelector: null,
      maskAllText: false,
      maskTextClass: 'rr-mask',
      unmaskTextClass: null,
      maskTextSelector: null,
      unmaskTextSelector: null,
      skipChild: false,
      inlineStylesheet: true,
      maskInputOptions: {},
      maskAttributeFn: undefined,
      maskTextFn: undefined,
      maskInputFn: undefined,
      slimDOMOptions: {},
      dataURLOptions: {},
      inlineImages: false,
      recordCanvas: false,
      preserveWhiteSpace: true,
      onSerialize: undefined,
      onIframeLoad: undefined,
      iframeLoadTimeout: 5000,
      onBlockedImageLoad,
      onStylesheetLoad: undefined,
      stylesheetLoadTimeout: 5000,
      keepIframeSrcFn: () => false,
      newlyAddedElement: false,
    });

    console.log(serializedNode);
    expect(serializedNode).toEqual(
      expect.objectContaining({
        type: 2,
        tagName: 'img',
        attributes: {
          class: 'rr-block',
          rr_width: '100px',
          rr_height: '150px',
        },
      }),
    );

    // Simulate the image load event
    const loadEvent = new window.Event('load');
    img.dispatchEvent(loadEvent);

    // Verify that onBlockedImageLoad was not called since the image was already complete
    expect(onBlockedImageLoad).not.toHaveBeenCalled();
  });
});
