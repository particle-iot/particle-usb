import { Request } from './request';
import { globalOptions } from './config';

/**
 * Mixin class for a cellular network device.
 */
export const CellularDevice = base => class extends base {
	/**
	 * Get ICCID of the active SIM card.
	 *
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
