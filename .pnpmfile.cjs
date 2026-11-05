/**
 * Tools that use the TypeScript JS API, which the native TypeScript 7 compiler doesn't ship.
 * They peer on `typescript`, so they would get the workspace's TypeScript 7.
 * This gives each of them its own JS-based TypeScript instead.
 */
const TS_API_CONSUMERS = new Set([
  '@rollup/plugin-typescript',
  'vite-plugin-dts',
  'svelte-check',
  'svelte2tsx',
  '@sveltejs/package',
]);

/**
 * The TypeScript version these tools get.
 */
const TS_API_VERSION = '~5.9.3';

module.exports = {
  hooks: {
    readPackage(pkg) {
      if (!TS_API_CONSUMERS.has(pkg.name)) return pkg;

      if (pkg.peerDependencies) delete pkg.peerDependencies.typescript;
      if (pkg.peerDependenciesMeta) delete pkg.peerDependenciesMeta.typescript;
      pkg.dependencies = { ...pkg.dependencies, typescript: TS_API_VERSION };

      return pkg;
    },
  },
};
