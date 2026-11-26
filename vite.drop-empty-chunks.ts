import type { Plugin } from 'vite';

/**
 * Removes chunks that tree-shaking left empty, such as the `postcss` chunk of
 * a package that only records.
 */
export function dropEmptyChunksPlugin(): Plugin {
  return {
    name: 'drop-empty-chunks',
    generateBundle(_, bundle) {
      const files = Object.values(bundle);
      for (const file of files) {
        if (
          file.type === 'chunk' &&
          !file.isEntry &&
          Object.values(file.modules).every((m) => m.renderedLength === 0) &&
          !files.some(
            (f) => f.type === 'chunk' && f.imports.includes(file.fileName),
          )
        ) {
          delete bundle[file.fileName];
          delete bundle[`${file.fileName}.map`];
        }
      }
    },
  };
}
