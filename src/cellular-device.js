'use strict';
const { Request } = require('./request');
const { globalOptions } = require('./config');

/**
 * Cellular device.
 *
 * This class is not meant to be instantiated directly. Use {@link getDevices} and
 * {@link openDeviceById} to create device instances.
 *
 * @mixin
 */
const CellularDevice = base => class extends base {
	/**
	 * Get ICCID of the active SIM card, and the IMEI of the cell radio.
	 *
	 * Supported platforms:
	 * - Gen 3 (since Device OS 5.8.0)
	 * - Gen 2 (since Device OS 1.1.0)
	 *
	 * @param {Object} [options] Options.
	 * @param {Number} [options.timeout] Timeout (milliseconds).
	 * @return {Promise<Object>}
	 */
	async getCellularInfo({ timeout = globalOptions.requestTimeout } = {}) {
		const r = await this.sendRequest(Request.CELLULAR_GET_ICCID, null /* msg */, { timeout });
		return {
			iccid: r.iccid,
			imei: r.imei
		};
	}

	/**
	 * Get ICCID of the active SIM card
	 *
	 * Supported platforms:
	 * - Gen 3 (since Device OS 0.9.0)
	 * - Gen 2 (since Device OS 1.1.0)
	 *
	 * @param {Object} [options] Options.
	 * @param {Number} [options.timeout] Timeout (milliseconds).
	 * @return {Promise<String>}
	 */
	async getIccid({ timeout = globalOptions.requestTimeout } = {}) {
		const r = await this.sendRequest(Request.CELLULAR_GET_ICCID, null /* msg */, { timeout });
		return r.iccid;
	}

	/**
	 * Send a command APDU to the UICC and receive a response.
	 *
	 * Supported platforms:
	 * - Gen 3 (since Device OS 6.4.1)
	 * - Gen 4 (since Device OS 6.4.1)
	 *
	 * @param {Buffer} cmd Command APDU.
	 * @param {Object} [opts] Options (see `sendControlRequest()`).
	 * @returns {Promise<Buffer>} Response APDU.
	 */
	async sendApdu(cmd, opts) {
		const { data } = await this.sendProtobufRequest('cellular.ApduRequest', { data: cmd }, opts);
		return data;
	}

	/**
	 * Set to `true` if this is a cellular device.
	 */
	get isCellularDevice() {
		return true;
	}
};

module.exports = {
	CellularDevice
};
