/* istanbul ignore file */
/* eslint-disable */
/* dfu.js must be included before dfuse.js */

const DfuDevice = (base) => class extends base {
    /**
     * Flashes the firmware over DFU interface.
     *
     * @param {Number} iface DFU interface number.
     * @param {Buffer} buffer The binary firmware data to be flashed.
     * @param {Number} addr The starting address where the firmware will be written.
     * @param {Object} options Optional options for the flashing process.
     * @returns {Promise<void>} A Promise that resolves when the firmware is successfully flashed.
     */
	async flashWithDfu(iface, buffer, addr, options) {
		try {
			await this._dfu.setIfaceForDfu(iface);
			await this._dfu.do_download(addr, buffer, options);
		} catch (err) {
			throw new Error(err);
		}
	}
};

module.exports = {
    DfuDevice
};
