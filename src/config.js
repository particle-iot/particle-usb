// Global configuration
export let globalOptions = {
  log: { // Dummy logger
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
