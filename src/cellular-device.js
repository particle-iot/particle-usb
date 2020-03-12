import { Request } from './request';

/**
 * Mixin class for a cellular network device.
 */
export const CellularDevice = base => class extends base {
	/**
   * Get ICCID of the active SIM card.
   *
   * @return {Promise<String>}
   */
	async getIccid() {
		const r = await this.sendRequest(Request.CELLULAR_GET_ICCID);
		return r.iccid;
	}

	/**
   * Set to `true` if this is a cellular device.
   */
	get isCellularDevice() {
		return true;
	}
};
