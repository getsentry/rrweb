/**
 * Benchmarks for `adaptCssForReplay`, the CSS rewrite that runs for every
 * stylesheet during replay. Run with `pnpm bench`.
 */
import * as fs from 'fs';
import * as path from 'path';
import { bench, describe } from 'vitest';
import { adaptCssForReplay, createCache } from '../src/rebuild';

const benchmarkCss = fs.readFileSync(
  path.resolve(__dirname, './css/benchmark.css'),
  'utf8',
);

/**
 * Tailwind-like utility CSS: every utility has a `hover:` variant, and every
 * fourth block is wrapped in a responsive `@media` rule.
 */
function utilityCss(utilities: number): string {
  let css = '';
  for (let i = 0; i < utilities; i++) {
    const block = [
      `.u-${i} { color: rgb(${i % 255} 0 0); padding: ${i % 16}px; }`,
      `.hover\\:u-${i}:hover { color: rgb(0 ${i % 255} 0); }`,
      `.group:hover .group-hover\\:u-${i}, .peer:hover ~ .peer-hover\\:u-${i} { opacity: 0.${i % 10}; }`,
    ].join('\n');
    css +=
      i % 4 === 0 ? `@media (min-width: 640px) {\n${block}\n}\n` : `${block}\n`;
  }
  return css;
}

const mediumUtilityCss = utilityCss(1_000);
// Just under the 1MB limit above which stylesheets are not adapted.
const largeUtilityCss = utilityCss(5_300);
const oversizedUtilityCss = utilityCss(6_000);
const smallComponentCss = utilityCss(5);

describe('adaptCssForReplay: one stylesheet', () => {
  bench(`test/css/benchmark.css (${benchmarkCss.length} chars)`, () => {
    adaptCssForReplay(benchmarkCss, createCache());
  });

  bench(`utility css (${mediumUtilityCss.length} chars)`, () => {
    adaptCssForReplay(mediumUtilityCss, createCache());
  });

  bench(`utility css (${largeUtilityCss.length} chars)`, () => {
    adaptCssForReplay(largeUtilityCss, createCache());
  });

  bench(`utility css over the 1MB limit (${oversizedUtilityCss.length} chars)`, () => {
    adaptCssForReplay(oversizedUtilityCss, createCache());
  });
});

describe('adaptCssForReplay: many style elements', () => {
  const styles = Array.from(
    { length: 500 },
    (_, i) => `/* component ${i} */\n${smallComponentCss}`,
  );

  bench(`500 component stylesheets (${smallComponentCss.length} chars each)`, () => {
    const cache = createCache();
    for (const cssText of styles) {
      adaptCssForReplay(cssText, cache);
    }
  });
});

describe('adaptCssForReplay: cache hit', () => {
  const cache = createCache();
  adaptCssForReplay(benchmarkCss, cache);

  bench('test/css/benchmark.css', () => {
    adaptCssForReplay(benchmarkCss, cache);
  });
});
