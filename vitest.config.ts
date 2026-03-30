export default {
  test: {
    /**
     * Keeps old (pre-jest 29) snapshot format
     * its a bit ugly and harder to read than the new format,
     * so we might want to remove this in its own PR
     */
    snapshotFormat: {
      escapeString: true,
      printBasicPrototype: true,
    },
    // Vitest 2 defaults to worker threads, but Puppeteer browser instances
    // don't clean up reliably in threads, causing CI hangs. Use forks
    // (child processes) which match vitest 1 behavior.
    pool: 'forks',
    teardownTimeout: 5000,
  },
};
