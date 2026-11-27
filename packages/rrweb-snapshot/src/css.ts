import type { AcceptedPlugin, Rule } from 'postcss';

const MEDIA_SELECTOR = /(max|min)-device-(width|height)/;
const MEDIA_SELECTOR_GLOBAL = new RegExp(MEDIA_SELECTOR.source, 'g');

const mediaSelectorPlugin: AcceptedPlugin = {
  postcssPlugin: 'postcss-custom-selectors',
  prepare() {
    return {
      postcssPlugin: 'postcss-custom-selectors',
      AtRule: function (atrule) {
        // Only media queries: other at-rules, such as an `@import` URL or a
        // `@layer` name, can contain the same text.
        if (
          atrule.name.toLowerCase() === 'media' &&
          atrule.params.match(MEDIA_SELECTOR_GLOBAL)
        ) {
          atrule.params = atrule.params.replace(MEDIA_SELECTOR_GLOBAL, '$1-$2');
        }
      },
    };
  },
};

// Matches `:hover`, and an escaping backslash before it when there is one.
const HOVER_PSEUDO_CLASS = /(\\)?:hover/g;

/**
 * Returns a copy of `selector` with each `:hover` pseudo-class replaced by
 * the `.\:hover` class, or `null` when it has none. An escaped `\:hover`,
 * such as in Tailwind's `.md\:hover\:bg-red:hover`, is part of a class name
 * and stays as it is.
 */
function hoverClassSelector(selector: string): string | null {
  let replaced = false;
  const result = selector.replace(
    HOVER_PSEUDO_CLASS,
    (match, escape: string | undefined) => {
      if (escape) return match;
      replaced = true;
      return '.\\:hover';
    },
  );
  return replaced ? result : null;
}

// Simplified from https://github.com/giuseppeg/postcss-pseudo-classes/blob/HEAD/index.js
const pseudoClassPlugin: AcceptedPlugin = {
  postcssPlugin: 'postcss-hover-classes',
  prepare: function () {
    // postcss visits a rule again after its selector changes. A WeakSet keeps
    // that check constant-time, where upstream's array made it quadratic.
    const fixed = new WeakSet<Rule>();
    return {
      Rule: function (rule) {
        if (fixed.has(rule)) {
          return;
        }
        fixed.add(rule);
        rule.selectors.forEach(function (selector) {
          const hoverSelector = hoverClassSelector(selector);
          if (hoverSelector) {
            rule.selector += ',\n' + hoverSelector;
          }
        });
      },
    };
  },
};

export { mediaSelectorPlugin, pseudoClassPlugin };
