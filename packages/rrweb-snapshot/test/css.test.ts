import { describe, it, expect, vi } from 'vitest';
import postcss, { type AcceptedPlugin, type Rule } from 'postcss';
import { mediaSelectorPlugin, pseudoClassPlugin } from '../src/css';
import { adaptCssForReplay, createCache } from '../src/rebuild';
import { fixSafariColons, escapeImportStatement } from './../src/utils';

function process(plugin: AcceptedPlugin, input: string): string {
  return postcss([plugin]).process(input, {}).css;
}

const withoutWhitespace = (s: string) => s.replace(/\s+/g, '');

describe('css plugins', () => {
  describe('mediaSelectorPlugin', () => {
    it('selectors without device remain unchanged', () => {
      const cssText =
        '@media only screen and (min-width: 1200px) { .a { width: 10px; }}';
      expect(process(mediaSelectorPlugin, cssText)).toEqual(cssText);
    });

    it('only rewrites media queries', () => {
      const cssText = [
        '@import url("https://cdn.example.com/min-device-width.css");',
        '@layer max-device-height { .a { width: 10px; } }',
      ].join('\n');
      expect(process(mediaSelectorPlugin, cssText)).toEqual(cssText);
    });

    it('can adapt media rules to replay context', () => {
      [
        ['min', 'width'],
        ['min', 'height'],
        ['max', 'width'],
        ['max', 'height'],
      ].forEach(([first, second]) => {
        expect(
          process(
            mediaSelectorPlugin,
            `@media only screen and (${first}-device-${second}: 1200px) { .a { width: 10px; }}`,
          ),
        ).toEqual(
          `@media only screen and (${first}-${second}: 1200px) { .a { width: 10px; }}`,
        );
      });
    });
  });

  describe('pseudoClassPlugin', () => {
    it('leaves an escaped :hover in a class name alone', () => {
      const cssText = '.md\\:hover\\:bg-red:hover { color: red; }';
      expect(process(pseudoClassPlugin, cssText)).toEqual(
        `.md\\:hover\\:bg-red:hover,
.md\\:hover\\:bg-red.\\:hover { color: red; }`,
      );
    });

    it('adds no copy when :hover only appears escaped in a class name', () => {
      const cssText = '.md\\:hover\\:bg-red { color: red; }';
      expect(process(pseudoClassPlugin, cssText)).toEqual(cssText);
    });

    it('parses nested commas in selectors correctly', () => {
      const cssText =
        'body > ul :is(li:not(:first-of-type) a.current, li:not(:first-of-type).active a) {background: red;}';
      expect(process(pseudoClassPlugin, cssText)).toEqual(cssText);
    });

    it("doesn't ignore :hover within :is brackets", () => {
      const cssText =
        'body > ul :is(li:not(:first-of-type) a:hover, li:not(:first-of-type).active a) {background: red;}';
      expect(process(pseudoClassPlugin, cssText))
        .toEqual(`body > ul :is(li:not(:first-of-type) a:hover, li:not(:first-of-type).active a),
body > ul :is(li:not(:first-of-type) a.\\:hover, li:not(:first-of-type).active a) {background: red;}`);
    });

    it('should parse selector with comma nested inside ()', () => {
      const cssText =
        '[_nghost-ng-c4172599085]:not(.fit-content).aim-select:hover:not(:disabled, [_nghost-ng-c4172599085]:not(.fit-content).aim-select--disabled, [_nghost-ng-c4172599085]:not(.fit-content).aim-select--invalid, [_nghost-ng-c4172599085]:not(.fit-content).aim-select--active) { border-color: rgb(84, 84, 84); }';
      expect(process(pseudoClassPlugin, cssText))
        .toEqual(`[_nghost-ng-c4172599085]:not(.fit-content).aim-select:hover:not(:disabled, [_nghost-ng-c4172599085]:not(.fit-content).aim-select--disabled, [_nghost-ng-c4172599085]:not(.fit-content).aim-select--invalid, [_nghost-ng-c4172599085]:not(.fit-content).aim-select--active),
[_nghost-ng-c4172599085]:not(.fit-content).aim-select.\\:hover:not(:disabled, [_nghost-ng-c4172599085]:not(.fit-content).aim-select--disabled, [_nghost-ng-c4172599085]:not(.fit-content).aim-select--invalid, [_nghost-ng-c4172599085]:not(.fit-content).aim-select--active) { border-color: rgb(84, 84, 84); }`);
    });

    it('ignores ( in strings', () => {
      const cssText =
        'li[attr="weirdly("] a:hover, li[attr="weirdly)"] a {background-color: red;}';
      expect(process(pseudoClassPlugin, cssText))
        .toEqual(`li[attr="weirdly("] a:hover, li[attr="weirdly)"] a,
li[attr="weirdly("] a.\\:hover {background-color: red;}`);
    });

    it('ignores escaping in strings', () => {
      const cssText = `li[attr="weirder\\"("] a:hover, li[attr="weirder\\")"] a {background-color: red;}`;
      expect(process(pseudoClassPlugin, cssText))
        .toEqual(`li[attr="weirder\\"("] a:hover, li[attr="weirder\\")"] a,
li[attr="weirder\\"("] a.\\:hover {background-color: red;}`);
    });

    it('ignores comma in string', () => {
      const cssText = 'li[attr="has,comma"] a:hover {background: red;}';
      expect(process(pseudoClassPlugin, cssText)).toEqual(
        `li[attr="has,comma"] a:hover,
li[attr="has,comma"] a.\\:hover {background: red;}`,
      );
    });

    it.each([
      ['.foo,.bar {}', ['.foo', '.bar']],
      ['.bar:has(:disabled) {}', ['.bar:has(:disabled)']],
      ['.bar:has(input, button) {}', ['.bar:has(input, button)']],
      [
        '.bar:has(input:is(:disabled),button:has(:disabled)) {}',
        ['.bar:has(input:is(:disabled),button:has(:disabled))'],
      ],
      [
        '.bar:has(div, input:is(:disabled), button) {}',
        ['.bar:has(div,input:is(:disabled), button)'],
      ],
      [
        '.bar:has(div, input:is(:disabled),button:has(:disabled,.baz)) {}',
        ['.bar:has(div,input:is(:disabled),button:has(:disabled,.baz))'],
      ],
      [
        '.bar:has(input), .foo:has(input, button), .baz {}',
        ['.bar:has(input)', '.foo:has(input, button)', '.baz'],
      ],
      [
        '.bar:has(input:is(:disabled),button:has(:disabled,.baz), div:has(:disabled,.baz)){color: red;}',
        [
          '.bar:has(input:is(:disabled),button:has(:disabled,.baz),div:has(:disabled,.baz))',
        ],
      ],
      [
        '.bar:has(:has(:has(a), :has(:has(:has(b, :has(a), c), e))), input:is(:disabled), button) {}',
        [
          '.bar:has(:has(:has(a),:has(:has(:has(b,:has(a), c), e))),input:is(:disabled), button)',
        ],
      ],
      [
        '.foo,.bar:has(input:is(:disabled)){color: red;}',
        ['.foo', '.bar:has(input:is(:disabled))'],
      ],
      [
        '.foo,.bar:has(input:is(:disabled),button:has(:disabled,.baz)){color: red;}',
        ['.foo', '.bar:has(input:is(:disabled),button:has(:disabled,.baz))'],
      ],
      [
        '.foo,.bar:has(input:is(:disabled),button:has(:disabled), div:has(:disabled,.baz)){color: red;}',
        [
          '.foo',
          '.bar:has(input:is(:disabled),button:has(:disabled),div:has(:disabled,.baz))',
        ],
      ],
      [
        '.foo,.bar:has(input:is(:disabled),button:has(:disabled,.baz), div:has(:disabled,.baz)){color: red;}',
        [
          '.foo',
          '.bar:has(input:is(:disabled),button:has(:disabled,.baz),div:has(:disabled,.baz))',
        ],
      ],
      ['.bar:has(:disabled), .foo {}', ['.bar:has(:disabled)', '.foo']],
      [
        '.bar:has(input:is(:disabled),.foo,button:is(:disabled)), .foo {}',
        ['.bar:has(input:is(:disabled),.foo,button:is(:disabled))', '.foo'],
      ],
      [
        '.bar:has(input:is(:disabled),.foo,button:is(:disabled)), .foo:has(input, button), .baz,  {}',
        [
          '.bar:has(input:is(:disabled),.foo,button:is(:disabled))',
          '.foo:has(input, button)',
          '.baz',
        ],
      ],
    ])(
      'splits selector lists with functional pseudo classes: %s',
      (cssText, expected) => {
        const rule = postcss.parse(cssText).first as Rule;
        // postcss keeps the empty selector after a trailing comma; browsers
        // drop the whole rule, so it does not matter for replay.
        expect(rule.selectors.filter(Boolean).map(withoutWhitespace)).toEqual(
          expected.map(withoutWhitespace),
        );

        // With `:hover` on every selector, each one gets exactly one copy.
        const hovered = expected.map((selector) => `${selector}:hover`);
        const result = postcss.parse(
          process(pseudoClassPlugin, `${hovered.join(', ')} {}`),
        ).first as Rule;
        expect(result.selectors.map(withoutWhitespace)).toEqual(
          [
            ...hovered,
            ...hovered.map((selector) =>
              selector.replace(/:hover/g, '.\\:hover'),
            ),
          ].map(withoutWhitespace),
        );
      },
    );
  });
});

describe('adaptCssForReplay with unparseable css (#1734)', function () {
  it('falls back to the original text, byte for byte, instead of throwing', () => {
    const cssText = '.a { content: "unterminated }';
    const cache = createCache();
    const consoleWarnSpy = vi
      .spyOn(console, 'warn')
      .mockImplementation(() => undefined);
    let result = '';
    expect(() => {
      result = adaptCssForReplay(cssText, cache);
    }).not.toThrow();
    expect(result).toBe(cssText);
    consoleWarnSpy.mockRestore();
  });
});

describe('css utils', () => {
  it('parses : in attribute selectors correctly', () => {
    const out1 = fixSafariColons('[data-foo] { color: red; }');
    expect(out1).toEqual('[data-foo] { color: red; }');

    const out2 = fixSafariColons('[data-foo:other] { color: red; }');
    expect(out2).toEqual('[data-foo\\:other] { color: red; }');

    const out3 = fixSafariColons('[data-aa\\:other] { color: red; }');
    expect(out3).toEqual('[data-aa\\:other] { color: red; }');
  });

  it('parses imports with quotes correctly', () => {
    const out1 = escapeImportStatement({
      cssText: `@import url("/foo.css;900;800"");`,
      href: '/foo.css;900;800"',
      media: {
        length: 0,
      },
      layerName: null,
      supportsText: null,
    } as unknown as CSSImportRule);
    expect(out1).toEqual(`@import url("/foo.css;900;800\\"");`);

    const out2 = escapeImportStatement({
      cssText: `@import url("/foo.css;900;800"") supports(display: flex);`,
      href: '/foo.css;900;800"',
      media: {
        length: 0,
      },
      layerName: null,
      supportsText: 'display: flex',
    } as unknown as CSSImportRule);
    expect(out2).toEqual(
      `@import url("/foo.css;900;800\\"") supports(display: flex);`,
    );

    const out3 = escapeImportStatement({
      cssText: `@import url("/foo.css;900;800"");`,
      href: '/foo.css;900;800"',
      media: {
        length: 1,
        mediaText: 'print, screen',
      },
      layerName: null,
      supportsText: null,
    } as unknown as CSSImportRule);
    expect(out3).toEqual(`@import url("/foo.css;900;800\\"") print, screen;`);

    const out4 = escapeImportStatement({
      cssText: `@import url("/foo.css;900;800"") layer(layer-1);`,
      href: '/foo.css;900;800"',
      media: {
        length: 0,
      },
      layerName: 'layer-1',
      supportsText: null,
    } as unknown as CSSImportRule);
    expect(out4).toEqual(`@import url("/foo.css;900;800\\"") layer(layer-1);`);

    const out5 = escapeImportStatement({
      cssText: `@import url("/foo.css;900;800"") layer;`,
      href: '/foo.css;900;800"',
      media: {
        length: 0,
      },
      layerName: '',
      supportsText: null,
    } as unknown as CSSImportRule);
    expect(out5).toEqual(`@import url("/foo.css;900;800\\"") layer;`);
  });
});
