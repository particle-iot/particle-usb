import { Request } from './request';
import { globalOptions } from './config';

/**
 * Cellular device.
 *
 * This class is not meant to be instantiated directly. Use {@link getDevices} and
 * {@link openDeviceById} to create device instances.
 *
 * @mixin
 */
export const CellularDevice = base => class extends base {
	/**
	 * Get ICCID of the active SIM card.
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
	 * Set to `true` if this is a cellular device.
	 */
	get isCellularDevice() {
		return true;
	}
};
