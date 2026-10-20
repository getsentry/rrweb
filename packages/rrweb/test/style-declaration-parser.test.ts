/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StyleDeclarationParser } from '../src/record/style-declaration-parser';

const originalCSSStyleSheet = globalThis.CSSStyleSheet;

afterEach(() => {
  Object.defineProperty(globalThis, 'CSSStyleSheet', {
    configurable: true,
    writable: true,
    value: originalCSSStyleSheet,
  });
  vi.restoreAllMocks();
});

describe('StyleDeclarationParser', () => {
  describe('reusing constructable stylesheets', () => {
    const constructorSpy = vi.fn();

    class FakeCSSStyleSheet extends originalCSSStyleSheet {
      public constructor() {
        super();
        constructorSpy();
      }

      public replaceSync(text: string): void {
        while (this.cssRules.length) {
          this.deleteRule(0);
        }
        this.insertRule(text, 0);
      }
    }

    beforeEach(() => {
      constructorSpy.mockReset();
      Object.defineProperty(globalThis, 'CSSStyleSheet', {
        configurable: true,
        writable: true,
        value: FakeCSSStyleSheet,
      });
    });

    it('allocates one sheet for repeated parses and replaces previous declarations', () => {
      const parser = new StyleDeclarationParser(document);
      expect(constructorSpy).not.toHaveBeenCalled();

      for (let i = 0; i < 1000; i++) {
        const color = i % 2 ? 'blue' : 'red';
        const style = parser.parse(
          `color: ${color}; ${i % 2 ? '' : 'margin: 1px !important;'}`,
        );
        expect(style?.getPropertyValue('color')).toBe(color);
        expect(style?.getPropertyValue('margin')).toBe(i % 2 ? '' : '1px');
        expect(style?.getPropertyPriority('margin')).toBe(
          i % 2 ? '' : 'important',
        );
      }

      expect(constructorSpy).toHaveBeenCalledTimes(1);
    });

    it('keeps sheets isolated between parser instances', () => {
      const first = new StyleDeclarationParser(document);
      const second = new StyleDeclarationParser(document);

      expect(first.parse('color: red;')?.getPropertyValue('color')).toBe('red');
      expect(second.parse('color: blue;')?.getPropertyValue('color')).toBe(
        'blue',
      );
      expect(first.parse('color: green;')?.getPropertyValue('color')).toBe(
        'green',
      );
      expect(constructorSpy).toHaveBeenCalledTimes(2);
    });

    it('falls back after a constructor failure and retries on the next parse', () => {
      constructorSpy.mockImplementationOnce(() => {
        throw new Error('Cannot construct stylesheet');
      });
      const parser = new StyleDeclarationParser(document);

      expect(parser.parse('color: red;')?.getPropertyValue('color')).toBe(
        'red',
      );
      expect(parser.parse('color: blue;')?.getPropertyValue('color')).toBe(
        'blue',
      );
      expect(parser.parse('color: green;')?.getPropertyValue('color')).toBe(
        'green',
      );
      expect(constructorSpy).toHaveBeenCalledTimes(2);
    });

    it('falls back after replaceSync fails and reuses the sheet on recovery', () => {
      const replaceSpy = vi.spyOn(FakeCSSStyleSheet.prototype, 'replaceSync');
      const parser = new StyleDeclarationParser(document);
      expect(parser.parse('color: red;')?.getPropertyValue('color')).toBe(
        'red',
      );

      replaceSpy.mockImplementationOnce(() => {
        throw new Error('Cannot replace stylesheet');
      });
      expect(parser.parse('color: blue;')?.getPropertyValue('color')).toBe(
        'blue',
      );
      expect(parser.parse('color: green;')?.getPropertyValue('color')).toBe(
        'green',
      );
      expect(replaceSpy).toHaveBeenCalledTimes(3);
      expect(constructorSpy).toHaveBeenCalledTimes(1);
    });
  });

  it('falls back to detached element parsing when constructable stylesheets are unavailable', () => {
    Object.defineProperty(globalThis, 'CSSStyleSheet', {
      configurable: true,
      writable: true,
      value: undefined,
    });

    const parser = new StyleDeclarationParser(document);

    const style = parser.parse('--message:"Hello: World;"; color:blue;');

    expect(style?.getPropertyValue('--message')).toBe('"Hello: World;"');
    expect(style?.getPropertyValue('color')).toBe('blue');
  });

  it('uses constructable stylesheet parsing when replaceSync is available', () => {
    const fakeStyle = document.createElement('span').style;
    fakeStyle.setProperty('--message', '"Hello: World;"');
    fakeStyle.setProperty('color', 'blue');

    class FakeCSSStyleSheet {
      public cssRules: CSSRule[] = [];

      public replaceSync(_text: string): void {
        this.cssRules = [
          {
            type: CSSRule.STYLE_RULE,
            style: fakeStyle,
          } as CSSRule,
        ];
      }
    }

    Object.defineProperty(globalThis, 'CSSStyleSheet', {
      configurable: true,
      writable: true,
      value: FakeCSSStyleSheet,
    });

    const parser = new StyleDeclarationParser(document);
    const fallbackSpy = vi.spyOn(
      parser as unknown as {
        parseWithDetachedElement: (styleText: string) => CSSStyleDeclaration;
      },
      'parseWithDetachedElement',
    );

    const style = parser.parse('--message:"Hello: World;"; color:blue;');

    expect(style?.getPropertyValue('--message')).toBe('"Hello: World;"');
    expect(style?.getPropertyValue('color')).toBe('blue');
    expect(fallbackSpy).not.toHaveBeenCalled();
  });
});
