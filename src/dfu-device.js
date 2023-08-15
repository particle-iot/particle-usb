const DfuDevice = (base) => class extends base {
	/**
	 * Flashes the firmware over DFU interface.
	 *
	 * @param {Number} altSetting The interface alternate setting.
	 * @param {Buffer} buffer The binary firmware data to be flashed.
	 * @param {Number} addr The starting address where the firmware will be written.
	 * @param {Function} progress User's callback function to log progress of the flashing process.
	 * @param {Object} options Optional options for the flashing process (noErase, leave).
	 * @returns {Promise<void>} A Promise that resolves when the firmware is successfully flashed.
	 */
	async writeOverDfu({ altSetting, buffer, addr, options, progress }) {
		await this._dfu.setAltSetting(altSetting);
		await this._dfu.doDownload(addr, buffer, options, progress);
	}
};

module.exports = {
	DfuDevice
};
