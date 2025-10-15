'use strict';
const { Request } = require('./request');

/**
 * Gen 3 device.
 *
 * This class is not meant to be instantiated directly. Use {@link getDevices} and
 * {@link openDeviceById} to create device instances.
 *
 * @mixin
 */
const Gen3Device = (base) => class extends base {
	/**
	 * Set the setup done flag.
	 *
	 * @param {Boolean} [done] Flag value.
	 * @return {Promise}
	 */
	async setSetupDone(done) {
		if (done === undefined) {
			done = true;
		}
		await this.sendRequest(Request.SET_DEVICE_SETUP_DONE, { done });
	}

	/**
	 * Set to `true` if this is a Gen 3 device.
	 */
	get isGen3Device() {
		return true;
	}
};

module.exports = {
	Gen3Device
};
