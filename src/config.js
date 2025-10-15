'use strict';
// Global configuration
const globalOptions = {
	// Request timeout
	requestTimeout: 60000,
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
 * @param {Object} [options] Options.
 * @param {Number} [options.requestTimeout=60000] Default request timeout (milliseconds).
 * @param {Object} [options.log] Logger instance. The logger is expected to have the following methods:
 *                 `trace(String)`, `info(String)`, `warn(String)`, `error(String)`.
 * @return {Object} Current options.
 */
function config(options) {
	return Object.assign(globalOptions, options);
}

module.exports = {
	globalOptions,
	config
};
