/**
 * This class is used to parse a style declaration into a CSSStyleDeclaration object.
 * It uses an unattached doc unless `CSSStyleSheet.prototype.replaceSync` is available which can be used to bypass CSP violations.
 * https://developer.mozilla.org/en-US/docs/Web/API/CSSStyleSheet/replaceSync
 *
 * This builds on https://github.com/getsentry/rrweb/pull/211#issuecomment-2284551183 which exhausted the other available options.
 *
 * Note: This means some browsers (older than 23 March 2023) will use the unattached doc and may experience CSP violations,
 * but newer browsers will use the replaceSync method and will not experience CSP violations.
 */
export class StyleDeclarationParser {
  private unattachedDoc: Document | null = null;

  public constructor(private readonly doc: Document) {}

  public parse(styleText: string): CSSStyleDeclaration | null {
    return (
      this.parseWithConstructableStylesheet(styleText) ||
      this.parseWithDetachedElement(styleText)
    );
  }

  private parseWithConstructableStylesheet(
    styleText: string,
  ): CSSStyleDeclaration | null {
    if (
      typeof CSSStyleSheet === 'undefined' ||
      typeof CSSStyleSheet.prototype.replaceSync !== 'function'
    ) {
      return null;
    }

    try {
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(`x { ${styleText} }`);

      const rule = sheet.cssRules[0];
      if (!rule || rule.type !== CSSRule.STYLE_RULE) {
        return null;
      }

      return (rule as CSSStyleRule).style;
    } catch {
      return null;
    }
  }

  private parseWithDetachedElement(styleText: string): CSSStyleDeclaration {
    const old = this.getUnattachedDoc().createElement('span');
    old.setAttribute('style', styleText);
    return old.style;
  }

  private getUnattachedDoc(): Document {
    if (!this.unattachedDoc) {
      try {
        // avoid upsetting the observed document from a CSP point of view
        this.unattachedDoc = document.implementation.createHTMLDocument();
      } catch {
        this.unattachedDoc = this.doc;
      }
    }

    return this.unattachedDoc;
  }
}
