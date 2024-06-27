const DfuDevice = (base) => class extends base {
	/**
	 * Flashes the firmware over DFU interface.
	 *
	 * @param {Buffer} data The binary firmware data to be flashed.
	 * @param {Object} options Options.
	 * @param {Number} options.altSetting The interface alternate setting.
	 * @param {Number} options.startAddr The starting address where the firmware will be written.
	 * @param {boolean} [options.noErase] - Skip erasing the device memory.
	 * @param {boolean} [options.leave] - Leave DFU mode after download.
	 * @param {Function} [options.progress] User's callback function to log progress of the flashing process.
	 * @returns {Promise<void>} A Promise that resolves when the firmware is successfully flashed.
	 */
	async writeOverDfu(data, { altSetting, startAddr, noErase, leave, progress }) {
		await this._dfu.setAltSetting(altSetting);
		await this._dfu.doDownload({ startAddr, data, noErase, leave, progress });
	}

	async readOverDfu({ altSetting, startAddr, size, progress }) {
		await this._dfu.setAltSetting(altSetting);
		const buffer = await this._dfu.doUpload({ startAddr, maxSize: size, progress });
		return buffer;
	}

	async getSegment(altSetting) {
		const seg = await this._dfu.getSegment(altSetting);
		return seg;
	}
};

module.exports = {
	DfuDevice
};
