// Global configuration
export let globalOptions = {
  // Request timeout
  requestTimeout: 30000,
  // Logger instance
  log: {
    trace: () => {},
    info: () => {},
    warn: () => {},
    error: () => {}
  }
};

/**
 * Set global options.
 *
 * @param {Object} options Options.
 */
export function config(options) {
  Object.assign(globalOptions, options);
}
