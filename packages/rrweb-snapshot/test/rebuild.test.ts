/**
 * @vitest-environment jsdom
 */
import * as fs from 'fs';
import * as path from 'path';
import { describe, it, beforeEach, expect, vi } from 'vitest';
import {
  adaptCssForReplay,
  addHoverClass,
  buildNodeWithSN,
  createCache,
} from '../src/rebuild';
import { NodeType } from '../src/types';
import { createMirror, Mirror } from '../src/utils';

declare module 'vitest' {
  interface Assertion {
    toMatchCss(expected: string): void;
  }
}

/** Removes comments, whitespace and semicolons, like upstream's `normalizeCssString`. */
function normalizeCss(cssText: string): string {
  return cssText.replace(/\/\*[^*]*\*\/|[\s;]/g, '');
}

expect.extend({
  toMatchCss: function (received: string, expected: string) {
    const pass = normalizeCss(received) === normalizeCss(expected);
    return {
      message: () =>
        pass
          ? ''
          : `Received (${received}) is not the same as expected (${expected})`,
      pass,
    };
  },
});

function getDuration(hrtime: [number, number]) {
  const [seconds, nanoseconds] = hrtime;
  return seconds * 1000 + nanoseconds / 1000000;
}

describe('rebuild', function () {
  let cache: ReturnType<typeof createCache>;
  let mirror: Mirror;

  beforeEach(() => {
    mirror = createMirror();
    cache = createCache();
  });

  describe('rr_dataURL', function () {
    it('should rebuild dataURL', function () {
      const dataURI =
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
      const node = buildNodeWithSN(
        {
          id: 1,
          tagName: 'img',
          type: NodeType.Element,
          attributes: {
            rr_dataURL: dataURI,
            src: 'http://example.com/image.png',
          },
          childNodes: [],
        },
        {
          doc: document,
          mirror,
          hackCss: false,
          cache,
        },
      ) as HTMLImageElement;
      expect(node?.src).toBe(dataURI);
    });
  });

  describe('rr_width/rr_height', function () {
    it('rebuild blocked element with correct dimensions', function () {
      const node = buildNodeWithSN(
        {
          id: 1,
          tagName: 'svg',
          type: NodeType.Element,
          isSVG: true,
          attributes: {
            rr_width: '50px',
            rr_height: '50px',
          },
          childNodes: [],
        },
        {
          doc: document,
          mirror,
          hackCss: false,
          cache,
        },
      ) as HTMLDivElement;
      expect(node.style.width).toBe('50px');
      expect(node.style.height).toBe('50px');
    });
  });

  describe('shadowDom', function () {
    it('rebuild shadowRoot without siblings', function () {
      const node = buildNodeWithSN(
        {
          id: 1,
          tagName: 'div',
          type: NodeType.Element,
          attributes: {},
          childNodes: [
            {
              id: 2,
              tagName: 'div',
              type: NodeType.Element,
              attributes: {},
              childNodes: [],
              isShadow: true,
            },
          ],
          isShadowHost: true,
        },
        {
          doc: document,
          mirror,
          hackCss: false,
          cache,
        },
      ) as HTMLDivElement;
      expect(node.shadowRoot?.childNodes.length).toBe(1);
    });
  });

  describe('add hover class to hover selector related rules', function () {
    it('will do nothing to css text without :hover', () => {
      const cssText = 'body { color: white }';
      expect(adaptCssForReplay(cssText, cache)).toMatchCss(cssText);
    });

    it('can add hover class to css text', () => {
      const cssText = '.a:hover { color: white }';
      expect(adaptCssForReplay(cssText, cache)).toMatchCss(
        '.a:hover, .a.\\:hover { color: white }',
      );
    });

    it('can correctly add hover when in middle of selector', () => {
      const cssText = 'ul li a:hover img { color: white }';
      expect(adaptCssForReplay(cssText, cache)).toMatchCss(
        'ul li a:hover img, ul li a.\\:hover img { color: white }',
      );
    });

    it('can correctly add hover on multiline selector', () => {
      const cssText = `ul li.specified a:hover img,
ul li.multiline
b:hover
img,
ul li.specified c:hover img {
  color: white
}`;
      expect(adaptCssForReplay(cssText, cache)).toMatchCss(
        `ul li.specified a:hover img,
ul li.multiline
b:hover
img,
ul li.specified c:hover img,
ul li.specified a.\\:hover img,
ul li.multiline b.\\:hover img,
ul li.specified c.\\:hover img {
  color: white
}`,
      );
    });

    it('can add hover class within media query', () => {
      const cssText = '@media screen { .m:hover { color: white } }';
      expect(adaptCssForReplay(cssText, cache)).toMatchCss(
        '@media screen { .m:hover, .m.\\:hover { color: white } }',
      );
    });

    it('can add hover class when there is multi selector', () => {
      const cssText = '.a, .b:hover, .c { color: white }';
      expect(adaptCssForReplay(cssText, cache)).toMatchCss(
        '.a, .b:hover, .c, .b.\\:hover { color: white }',
      );
    });

    it('can add hover class when there is a multi selector with the same prefix', () => {
      const cssText = '.a:hover, .a:hover::after { color: white }';
      expect(adaptCssForReplay(cssText, cache)).toMatchCss(
        '.a:hover, .a:hover::after, .a.\\:hover, .a.\\:hover::after { color: white }',
      );
    });

    it('can add hover class when :hover is not the end of selector', () => {
      const cssText = 'div:hover::after { color: white }';
      expect(adaptCssForReplay(cssText, cache)).toMatchCss(
        'div:hover::after, div.\\:hover::after { color: white }',
      );
    });

    it('can add hover class when the selector has multi :hover', () => {
      const cssText = 'a:hover b:hover { color: white }';
      expect(adaptCssForReplay(cssText, cache)).toMatchCss(
        'a:hover b:hover, a.\\:hover b.\\:hover { color: white }',
      );
    });

    it('will ignore :hover in css value', () => {
      const cssText = '.a::after { content: ":hover" }';
      expect(adaptCssForReplay(cssText, cache)).toMatchCss(cssText);
    });

    it('can adapt media rules to replay context', () => {
      const cssText =
        '@media only screen and (min-device-width : 1200px) { .a { width: 10px; }}';
      expect(adaptCssForReplay(cssText, cache)).toMatchCss(
        '@media only screen and (min-width : 1200px) { .a { width: 10px; }}',
      );
    });

    it('can add hover class to rules nested in at-rules', () => {
      const cssText = [
        '@supports (display: grid) { .a:hover { color: white } }',
        '@layer base { .b:hover { color: white } }',
        '@container (min-width: 1px) { .c:hover { color: white } }',
        '@media (min-width: 1px) { @supports (display: grid) { .d:hover { color: white } } }',
      ].join('\n');
      expect(adaptCssForReplay(cssText, cache)).toMatchCss(
        [
          '@supports (display: grid) { .a:hover, .a.\\:hover { color: white } }',
          '@layer base { .b:hover, .b.\\:hover { color: white } }',
          '@container (min-width: 1px) { .c:hover, .c.\\:hover { color: white } }',
          '@media (min-width: 1px) { @supports (display: grid) { .d:hover, .d.\\:hover { color: white } } }',
        ].join('\n'),
      );
    });

    it('can add hover class to nested css rules', () => {
      const cssText = '.a { color: red; &:hover { color: white } }';
      expect(adaptCssForReplay(cssText, cache)).toMatchCss(
        '.a { color: red; &:hover, &.\\:hover { color: white } }',
      );
    });

    it('can add hover class to escaped utility class names', () => {
      const cssText = '.hover\\:bg-red:hover { color: red }';
      expect(adaptCssForReplay(cssText, cache)).toMatchCss(
        '.hover\\:bg-red:hover, .hover\\:bg-red.\\:hover { color: red }',
      );
    });

    it('will not match a selector inside the selector of another rule', () => {
      // https://linear.app/getsentry/issue/REPLAY-1044
      const cssText =
        'button:hover { color: white } @media (min-width: 1px) { button.header-button:hover { border-radius: 50% } }';
      expect(adaptCssForReplay(cssText, cache)).toMatchCss(
        'button:hover, button.\\:hover { color: white } @media (min-width: 1px) { button.header-button:hover, button.header-button.\\:hover { border-radius: 50% } }',
      );
    });

    it('will not match a selector inside a declaration value', () => {
      const cssText = 'a:hover { color: red } .b::after { content: "a:hover" }';
      expect(adaptCssForReplay(cssText, cache)).toMatchCss(
        'a:hover, a.\\:hover { color: red } .b::after { content: "a:hover" }',
      );
    });

    it('will not adapt stylesheets of 1MB or more', () => {
      const rule = '.a:hover { color: white }';
      const cssText = rule.repeat(Math.ceil(1_000_000 / rule.length));
      expect(adaptCssForReplay(cssText, cache)).toBe(cssText);
    });

    it('keeps addHoverClass as an alias', () => {
      expect(addHoverClass).toBe(adaptCssForReplay);
    });

    it('should be a lot faster to add a hover class to a previously processed css string', () => {
      const factor = 100;

      const cssText = fs.readFileSync(
        path.resolve(__dirname, './css/benchmark.css'),
        'utf8',
      );

      const start = process.hrtime();
      adaptCssForReplay(cssText, cache);
      const end = process.hrtime(start);

      const cachedStart = process.hrtime();
      adaptCssForReplay(cssText, cache);
      const cachedEnd = process.hrtime(cachedStart);

      expect(getDuration(cachedEnd) * factor).toBeLessThan(getDuration(end));
    });
  });

  describe('isCustom elements', function () {
    it('should not throw when rebuilding custom element without hyphen (e.g. webview)', function () {
      // Elements like Electron's <webview> are registered as custom elements
      // but their names don't contain a hyphen, which makes them invalid for
      // customElements.define(). We should handle this gracefully via try/catch.
      expect(() => {
        buildNodeWithSN(
          {
            id: 1,
            tagName: 'webview',
            type: NodeType.Element,
            attributes: {},
            childNodes: [],
            isCustom: true,
          },
          {
            doc: document,
            mirror,
            hackCss: false,
            cache,
          },
        );
      }).not.toThrow();
    });

    it('should define a custom element with a valid hyphenated name', function () {
      const node = buildNodeWithSN(
        {
          id: 1,
          tagName: 'my-component',
          type: NodeType.Element,
          attributes: {},
          childNodes: [],
          isCustom: true,
        },
        {
          doc: document,
          mirror,
          hackCss: false,
          cache,
        },
      ) as HTMLElement;
      expect(node).toBeTruthy();
      expect(node.tagName.toLowerCase()).toBe('my-component');
    });
  });

  describe('document', function () {
    it('should replace leftover children when document.open() does not clear them', function () {
      const doc = document.implementation.createHTMLDocument();
      // browsers skip open() once the document's parser was aborted
      // (e.g. by window.stop()), keeping the previous rebuild in place
      vi.spyOn(doc, 'open').mockReturnValue(doc);
      const snapshot = {
        id: 1,
        type: NodeType.Document,
        childNodes: [
          {
            id: 2,
            type: NodeType.DocumentType,
            name: 'html',
            publicId: '',
            systemId: '',
          },
          {
            id: 3,
            type: NodeType.Element,
            tagName: 'html',
            attributes: {},
            childNodes: [],
          },
        ],
      } as const;

      buildNodeWithSN(snapshot, { doc, mirror, hackCss: false, cache });

      expect(Array.from(doc.childNodes).map((n) => n.nodeName)).toEqual([
        'html',
        'HTML',
      ]);
      expect(doc.documentElement).toBe(mirror.getNode(3));
    });
  });

  it('should not incorrectly interpret escaped quotes', () => {
    // the ':hover' in the below is a decoy which is not part of the selector,
    // previously that part was being incorrectly consumed by the selector regex
    const should_not_modify =
      ".tailwind :is(.before\\:content-\\[\\'\\'\\])::before { --tw-content: \":hover\"; content: var(--tw-content); }.tailwind :is(.\\[\\&\\>li\\]\\:before\\:content-\\[\\'-\\'\\] > li)::before { color: pink; }";
    expect(adaptCssForReplay(should_not_modify, cache)).toMatchCss(
      should_not_modify,
    );
  });

  it('should not incorrectly interpret at rules', () => {
    // the ':hover' in the below is a decoy which is not part of the selector,
    const should_not_modify =
      '@import url("https://fonts.googleapis.com/css2?family=Rubik:ital,wght@0,400;0,500;0,700;1,400&display=:hover");';
    expect(adaptCssForReplay(should_not_modify, cache)).toMatchCss(
      should_not_modify,
    );
  });

  it('handles exceptions from postcss when calling adaptCssForReplay', () => {
    const consoleWarnSpy = vi
      .spyOn(console, 'warn')
      .mockImplementation(() => undefined);
    // trigger CssSyntaxError by passing invalid css
    const cssText = 'a{';
    expect(adaptCssForReplay(cssText, cache)).toBe(cssText);
    expect(consoleWarnSpy).toHaveBeenLastCalledWith(
      'Failed to adapt css for replay',
      expect.any(Error),
    );
    consoleWarnSpy.mockRestore();
  });
});
