import * as fs from 'fs';
import * as path from 'path';
import { bench, describe } from 'vitest';
import { addHoverClass, createCache } from '../src/rebuild';

function readCss(fileName: string): string {
  return fs.readFileSync(path.resolve(__dirname, './css', fileName), 'utf8');
}

const benchmarkCss = readCss('benchmark.css');
const utilityCss = readCss('utility.css');
const componentCss = readCss('component.css');

// Just under the 1MB limit above which stylesheets are skipped.
const largeUtilityCss = utilityCss.repeat(5);

describe('addHoverClass: one stylesheet', () => {
  bench(`benchmark.css (${benchmarkCss.length} chars)`, () => {
    addHoverClass(benchmarkCss, createCache());
  });

  bench(`utility.css (${utilityCss.length} chars)`, () => {
    addHoverClass(utilityCss, createCache());
  });

  bench(`utility.css x5 (${largeUtilityCss.length} chars)`, () => {
    addHoverClass(largeUtilityCss, createCache());
  });
});

describe('addHoverClass: many style elements', () => {
  const styles = Array.from(
    { length: 500 },
    (_, i) => `/* component ${i} */\n${componentCss}`,
  );

  bench(`500 copies of component.css (${componentCss.length} chars)`, () => {
    const cache = createCache();
    for (const cssText of styles) {
      addHoverClass(cssText, cache);
    }
  });
});

describe('addHoverClass: cache hit', () => {
  const cache = createCache();
  addHoverClass(benchmarkCss, cache);

  bench('benchmark.css', () => {
    addHoverClass(benchmarkCss, cache);
  });
});
