import * as path from 'path';
import { build } from 'esbuild';
import { describe, expect, it } from 'vitest';

const distEntry = path.resolve(__dirname, '../dist/rrweb.js');

async function bundle(imports: string): Promise<string> {
  const result = await build({
    stdin: {
      contents: `export { ${imports} } from ${JSON.stringify(distEntry)};`,
      resolveDir: __dirname,
    },
    bundle: true,
    minify: true,
    format: 'esm',
    platform: 'browser',
    write: false,
    logLevel: 'silent',
  });
  return result.outputFiles[0].text;
}

describe('tree-shaking of the built package', () => {
  it('does not bundle postcss for record-only imports', async () => {
    expect(await bundle('record')).not.toContain('CssSyntaxError');
  });

  it('bundles postcss for the Replayer', async () => {
    expect(await bundle('Replayer')).toContain('CssSyntaxError');
  });
});
