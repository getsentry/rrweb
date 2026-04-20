/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
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
