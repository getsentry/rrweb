import commonjs from '@rollup/plugin-commonjs';
import resolve from '@rollup/plugin-node-resolve';
import typescript from 'rollup-plugin-typescript2';
import { defineConfig } from 'rollup';
import { terser } from 'rollup-plugin-terser';

const workerStrBaseConfig = {
  input: ['./src/_image-bitmap-data-url-worker.ts'],
  treeshake: 'smallest',
  plugins: [
    commonjs(),
    typescript({
      tsconfig: './tsconfig.json',
      inlineSourceMap: false,
      sourceMap: false,
      inlineSources: false,
    }),
    resolve(),
    terser({
      mangle: {
        module: true,
      },
    }),
    {
      name: 'worker-to-string',
      renderChunk(code) {
        return `export default \`${code}\`;`;
      },
    },
  ],
};

const indexBaseConfig = {
  input: ['./src/index.ts'],
  treeshake: 'smallest',
  external: ['./image-bitmap-data-url-worker'],
  plugins: [
    typescript({
      tsconfig: './tsconfig.json',
      inlineSourceMap: false,
      sourceMap: false,
      inlineSources: false,
    }),
    terser({
      mangle: {
        module: true,
      },
    }),
  ],
};

const config = defineConfig([
  {
    ...workerStrBaseConfig,
    output: {
      file: './dist/rrweb-worker/image-bitmap-data-url-worker.mjs',
      format: 'esm',
    },
  },
  {
    ...workerStrBaseConfig,
    output: {
      file: './dist/rrweb-worker/image-bitmap-data-url-worker.js',
      format: 'cjs',
    },
  },
  {
    ...indexBaseConfig,
    output: {
      file: './dist/rrweb-worker/index.mjs',
      format: 'esm',
    },
  },
  {
    ...indexBaseConfig,
    output: {
      file: './dist/rrweb-worker/index.js',
      format: 'cjs',
    },
  },
]);

export default config;
