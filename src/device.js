import { DeviceBase, openDeviceById } from './device-base';
import { Request } from './request';
import { Result, messageForResultCode } from './result';
import { fromProtobufEnum } from './protobuf-util';
import { RequestError, NotFoundError, TimeoutError } from './error';
import { globalOptions } from './config';

import proto from './protocol';

/**
 * Firmware module types.
 */
export const FirmwareModule = fromProtobufEnum(proto.FirmwareModuleType, {
	BOOTLOADER: 'BOOTLOADER',
	SYSTEM_PART: 'SYSTEM_PART',
	USER_PART: 'USER_PART',
	MONO_FIRMWARE: 'MONO_FIRMWARE'
});

/**
 * Device modes.
 */
export const DeviceMode = fromProtobufEnum(proto.DeviceMode, {
	NORMAL: 'NORMAL_MODE',
	LISTENING: 'LISTENING_MODE'
});

/**
 * Logging levels.
 */
export const LogLevel = fromProtobufEnum(proto.logging.LogLevel, {
	ALL: 'ALL',
	TRACE: 'TRACE',
	INFO: 'INFO',
	WARN: 'WARN',
	ERROR: 'ERROR',
	NONE: 'NONE'
});

// Helper class used by Device.timeout()
class RequestSender {
	constructor(device, timeout) {
		this.id = device.id;
		this.device = device;
		this._timeoutTime = Date.now() + timeout;
	}

	async open(options) {
		this.device = await openDeviceById(this.id, options);
	}

	async close() {
		await this.device.close();
	}

	async sendRequest(req, msg, opts) {
		if (!opts || !opts.timeout) {
			const t = this._timeoutTime - Date.now();
			if (t <= 0) {
				throw new TimeoutError();
			}
			opts = Object.assign({}, opts, { timeout: t });
		} else if (Date.now() + opts.timeout >= this._timeoutTime) {
			throw new TimeoutError();
		}
		return this.device.sendRequest(req, msg, opts);
	}

	async delay(ms) {
		if (Date.now() + ms >= this._timeoutTime) {
			throw new TimeoutError();
		}
		return new Promise((resolve) => {
			setTimeout(() => resolve(), ms);
		});
	}
}

/**
 * Basic functionality supported by all Particle devices.
 */
export class Device extends DeviceBase {
	/**
   * Get device serial number
   *
   * @return {Promise}
   */
	getSerialNumber() {
		return this.sendRequest(Request.GET_SERIAL_NUMBER);
	}

	/**
   * Perform the system reset.
   *
   * @return {Promise}
   */
	reset() {
		if (!this.isInDfuMode) {
			return this.sendRequest(Request.RESET);
		} else {
			return super.reset();
		}
	}

	/**
   * Perform the factory reset.
   *
   * @return {Promise}
   */
	factoryReset() {
		return this.sendRequest(Request.FACTORY_RESET);
	}

	/**
   * Reset and enter the DFU mode.
   *
   * @return {Promise}
   */
	enterDfuMode() {
		if (this.isInDfuMode) {
			return;
		}
		return this.timeout(async (s) => {
			await s.sendRequest(Request.DFU_MODE);
			await s.close();
			let isInDfuMode;

			while (!isInDfuMode) {
				try {
					await s.open({ includeDfu: true });
					isInDfuMode = s.device.isInDfuMode;
				} catch (error) {
					// device is reconnecting, ignore
				}
				await s.close();
				await s.delay(500);
			}
		});
	}

	/**
   * Reset and enter the safe mode.
   *
   * @return {Promise}
   */
	enterSafeMode() {
		return this.sendRequest(Request.SAFE_MODE);
	}

	/**
   * Enter the listening mode.
   *
   * @return {Promise}
   */
	async enterListeningMode() {
		return this.timeout(async (s) => {
			await s.sendRequest(Request.START_LISTENING);
			// Wait until the device enters the listening mode
			while (true) { // eslint-disable-line no-constant-condition
				const r = await s.sendRequest(Request.GET_DEVICE_MODE, null, {
					dontThrow: true // This request may not be supported by the device
				});
				if (r.result !== Result.OK || r.mode === proto.DeviceMode.LISTENING_MODE) {
					break;
				}
				await s.delay(500);
			}
		});
	}

	/**
   * Leave the listening mode.
   *
   * @return {Promise}
   */
	leaveListeningMode() {
		return this.sendRequest(Request.STOP_LISTENING);
	}

	/**
   * Get device mode.
   */
	async getDeviceMode() {
		const r = await this.sendRequest(Request.GET_DEVICE_MODE);
		return DeviceMode.fromProtobuf(r.mode);
	}

	/**
   * Start the Nyan LED indication.
   *
   * @return {Promise}
   */
	startNyanSignal() {
		return this.sendRequest(Request.START_NYAN_SIGNAL);
	}

	/**
   * Stop the Nyan LED indication.
   *
   * @return {Promise}
   */
	stopNyanSignal() {
		return this.sendRequest(Request.STOP_NYAN_SIGNAL);
	}

	/**
   * Perform the firmware update.
   *
   * @param {Buffer} data Firmware data.
   * @return {Promise}
   */
	updateFirmware(data) {
		return this.sendRequest(Request.START_FIRMWARE_UPDATE, {
			size: data.length
		}).then(rep => {
			let chunkSize = rep.chunkSize;
			let chunkOffs = 0;
			const writeChunk = () => {
				if (chunkOffs + chunkSize > data.length) {
					chunkSize = data.length - chunkOffs;
				}
				if (chunkSize === 0) {
					return Promise.resolve();
				}
				return this.sendRequest(Request.FIRMWARE_UPDATE_DATA, {
					data: data.slice(chunkOffs, chunkOffs + chunkSize)
				}).then(() => {
					chunkOffs += chunkSize;
					return writeChunk();
				});
			};
			return writeChunk();
		}).then(() => {
			return this.sendRequest(Request.FINISH_FIRMWARE_UPDATE, {
				validateOnly: false
			});
		});
	}

	/**
   * Get firmware module data.
   *
   * @param {String} module Module type.
   * @param {Number} [index] Module index.
   * @return {Promise<Buffer>}
   */
	getFirmwareModule(module, index) {
		return this._getStorageInfo().then(storage => {
			const section = storage.modules.find(section => {
				return (section.moduleType === module && section.moduleIndex === index);
			});
			if (!section) {
				throw new NotFoundError();
			}
			// Get size of the firmware module
			return this._getSectionDataSize(section).then(size => {
				// Read firmware data
				return this._readSectionData(section, 0, size);
			});
		});
	}

	/**
   * Check if the device runs a modular firmware.
   *
   * @return {Promise<Boolean>}
   */
	hasModularFirmware() {
		return this._getStorageInfo().then(storage => storage.hasModularFirmware);
	}

	/**
   * Set factory firmware.
   *
   * @param {Buffer} data Firmware data.
   * @return {Promise}
   */
	setFactoryFirmware(data) {
		return this._getStorageInfo().then(storage => {
			if (!storage.factory) {
				throw new NotFoundError();
			}
			return this._writeSectionData(storage.factory, 0, data);
		});
	}

	/**
   * Get factory firmware.
   *
   * @return {Promise<Buffer>}
   */
	getFactoryFirmware() {
		return this._getStorageInfo().then(storage => {
			if (!storage.factory) {
				throw new NotFoundError();
			}
			// Get size of the firmware module
			return this._getSectionDataSize(storage.factory).then(size => {
				// Read firmware data
				return this._readSectionData(storage.factory, 0, size);
			});
		});
	}

	/**
   * Read configuration data.
   *
   * @param {Number} address Address.
   * @param {Number} size Data size.
   * @return {Promise<Buffer>}
   */
	readConfigData(address, size) {
		return this._getStorageInfo().then(storage => {
			if (!storage.config) {
				throw new NotFoundError();
			}
			return this._readSectionData(storage.config, address, size);
		});
	}

	/**
   * Write configuration data.
   *
   * @param {Number} address Address.
   * @param {Buffer} data Data.
   * @return {Promise}
   */
	writeConfigData(address, data) {
		return this._getStorageInfo().then(storage => {
			if (!storage.config) {
				throw new NotFoundError();
			}
			return this._writeSectionData(storage.config, address, data);
		});
	}

	/**
   * Get size of the configuration data.
   *
   * @return {Promise<Number>}
   */
	getConfigDataSize() {
		return this._getStorageInfo().then(storage => {
			if (!storage.config) {
				throw new NotFoundError();
			}
			return storage.config.size;
		});
	}

	/**
   * Read from EEPROM.
   *
   * @param {Number} address Address.
   * @param {Number} size Data size.
   * @return {Promise<Buffer>}
   */
	readEeprom(address, size) {
		return this._getStorageInfo().then(storage => {
			if (!storage.eeprom) {
				throw new NotFoundError();
			}
			return this._readSectionData(storage.eeprom, address, size);
		});
	}

	/**
   * Write to EEPROM.
   *
   * @param {Number} address Address.
   * @param {Buffer} data Data.
   * @return {Promise}
   */
	writeEeprom(address, data) {
		return this._getStorageInfo().then(storage => {
			if (!storage.eeprom) {
				throw new NotFoundError();
			}
			return this._writeSectionData(storage.eeprom, address, data);
		});
	}

	/**
   * Clear EEPROM.
   *
   * @return {Promise}
   */
	clearEeprom() {
		return this._getStorageInfo().then(storage => {
			if (!storage.eeprom) {
				throw new NotFoundError();
			}
			return this._clearSectionData(storage.eeprom);
		});
	}

	/**
   * Get size of the EEPROM.
   *
   * @return {Promise<Number>}
   */
	getEepromSize() {
		return this._getStorageInfo().then(storage => {
			if (!storage.eeprom) {
				throw new NotFoundError();
			}
			return storage.eeprom.size;
		});
	}

	/**
   * Add a log handler.
   *
   * @param {Object} options Options.
   * @param {String} options.id Handler ID.
   * @param {String} options.stream Output stream: `Serial`, `Serial1`, `USBSerial1`, etc.
   * @param {String} [options.format] Message format: `default`, `json`.
   * @param {String} [options.level] Default logging level: `trace`, `info`, `warn`, `error`, `none`, `all`.
   * @param {Array} [options.filters] Category filters.
   * @param {Number} [options.baudRate] Baud rate.
   * @return {Promise}
   */
	async addLogHandler({ id, stream, format, level, filters, baudRate }) {
		const req = {
			id,
			level: LogLevel.toProtobuf(level || 'all')
		};
		switch ((format || 'default').toLowerCase()) {
			case 'default': {
				req.handlerType = proto.logging.LogHandlerType.DEFAULT_STREAM_HANDLER;
				break;
			}
			case 'json': {
				req.handlerType = proto.logging.LogHandlerType.JSON_STREAM_HANDLER;
				break;
			}
			default: {
				throw new RangeError(`Unknown message format: ${format}`);
			}
		}
		if (!stream) {
			throw new RangeError('Output stream is not specified');
		}
		switch (stream.toLowerCase()) {
			case 'serial': {
				req.streamType = proto.logging.StreamType.USB_SERIAL_STREAM;
				req.serial = {
					index: 0
				};
				break;
			}
			case 'usbserial1': {
				req.streamType = proto.logging.StreamType.USB_SERIAL_STREAM;
				req.serial = {
					index: 1
				};
				break;
			}
			case 'serial1': {
				req.streamType = proto.logging.StreamType.HW_SERIAL_STREAM;
				req.serial = {
					index: 1,
					baudRate
				};
				break;
			}
			default: {
				throw new RangeError(`Unknown output stream: ${stream}`);
			}
		}
		if (filters) {
			req.filters = filters.map(f => ({
				category: f.category,
				level: LogLevel.toProtobuf(f.level)
			}));
		}
		return this.sendRequest(Request.ADD_LOG_HANDLER, req);
	}

	/**
   * Remove a log handler.
   *
   * @param {Object} options Options.
   * @param {String} options.id Handler ID.
   * @return {Promise}
   */
	async removeLogHandler({ id }) {
		return this.sendRequest(Request.REMOVE_LOG_HANDLER, { id });
	}

	/**
   * Get the list of active log handlers.
   *
   * @return {Promise<Object>}
   */
	async getLogHandlers() {
		const rep = await this.sendRequest(Request.GET_LOG_HANDLERS);
		return rep.handlers.map(h => ({
			id: h.id
		}));
	}

	// Sends a Protobuf-encoded request
	sendRequest(req, msg, opts) {
		let buf = null;
		if (msg && req.request) {
			const m = req.request.create(msg); // Protobuf message object
			buf = req.request.encode(m).finish();
		}
		return this.sendControlRequest(req.id, buf, opts).then(rep => {
			let r = undefined;
			if (opts && opts.dontThrow) {
				r = { result: rep.result };
			} else if (rep.result !== Result.OK) {
				throw new RequestError(rep.result, messageForResultCode(rep.result));
			}
			if (req.reply) {
				if (rep.data) {
					r = Object.assign({}, r, req.reply.decode(rep.data));
				} else {
					// Return a message with default-initialized properties
					r = Object.assign({}, r, req.reply.create());
				}
			}
			return r;
		});
	}

	// This method is used to send multiple requests to the device. The overall execution time can be
	// limited via the `ms` argument (optional)
	async timeout(ms, fn) {
		if (typeof ms === 'function') {
			fn = ms;
			ms = globalOptions.requestTimeout; // Default timeout
		}
		const s = new RequestSender(this, ms);
		return fn(s);
	}

	_readSectionData(section, offset, size) {
		const data = Buffer.alloc(size);
		let chunkSize = 4096;
		let chunkOffs = 0;
		const readChunk = () => {
			if (chunkOffs + chunkSize > size) {
				chunkSize = size - chunkOffs;
			}
			if (chunkSize === 0) {
				return Promise.resolve(data);
			}
			return this.sendRequest(Request.READ_SECTION_DATA, {
				storage: section.storageIndex,
				section: section.sectionIndex,
				offset: offset + chunkOffs,
				size: chunkSize
			}).then(rep => {
				rep.data.copy(data, chunkOffs);
				chunkOffs += chunkSize;
				return readChunk();
			});
		};
		return readChunk();
	}

	_writeSectionData(section, offset, data) {
		return Promise.resolve().then(() => {
			if (section.needClear) {
				return this._clearSectionData(section);
			}
		}).then(() => {
			let chunkSize = 4096;
			let chunkOffs = 0;
			const writeChunk = () => {
				if (chunkOffs + chunkSize > data.length) {
					chunkSize = data.length - chunkOffs;
				}
				if (chunkSize === 0) {
					return Promise.resolve();
				}
				return this.sendRequest(Request.WRITE_SECTION_DATA, {
					storage: section.storageIndex,
					section: section.sectionIndex,
					offset: offset + chunkOffs,
					data: data.slice(chunkOffs, chunkOffs + chunkSize)
				}).then(() => {
					chunkOffs += chunkSize;
					return writeChunk();
				});
			};
			return writeChunk();
		});
	}

	_clearSectionData(section) {
		return this.sendRequest(Request.CLEAR_SECTION_DATA, {
			storage: section.storageIndex,
			section: section.sectionIndex
		});
	}

	_getSectionDataSize(section) {
		return this.sendRequest(Request.GET_SECTION_DATA_SIZE, {
			storage: section.storageIndex,
			section: section.sectionIndex
		}).then(rep => rep.size);
	}

	_getStorageInfo() {
		// Check if there's a cached storage info
		if (this._storageInfo) {
			return Promise.resolve(this._storageInfo);
		}
		// Request storage info from the device
		return this.sendRequest(Request.DESCRIBE_STORAGE).then(rep => {
			const storage = {
				modules: [],
				factory: null,
				config: null,
				eeprom: null,
				hasModularFirmware: true
			};
			for (let storageIndex = 0; storageIndex < rep.storage.length; ++storageIndex) {
				const pbStorage = rep.storage[storageIndex];
				for (let sectionIndex = 0; sectionIndex < pbStorage.sections.length; ++sectionIndex) {
					const pbSection = pbStorage.sections[sectionIndex];
					const section = {
						storageIndex: storageIndex,
						sectionIndex: sectionIndex,
						size: pbSection.size,
						needClear: !!(pbSection.flags & proto.SectionFlag.NEED_CLEAR)
					};
					switch (pbSection.type) {
						// Firmware module
						case proto.SectionType.FIRMWARE: {
							const pbFirmwareModule = pbSection.firmwareModule;
							if (pbFirmwareModule.type === proto.FirmwareModuleType.MONO_FIRMWARE) {
								storage.hasModularFirmware = false;
							}
							section.moduleType = FirmwareModule.fromProtobuf(pbFirmwareModule.type);
							if (pbFirmwareModule.index) {
								section.moduleIndex = pbFirmwareModule.index;
							}
							storage.modules.push(section);
							break;
						}
						// Factory firmware
						case proto.SectionType.FACTORY_BACKUP: {
							storage.factory = section;
							break;
						}
						// Device configuration
						case proto.SectionType.CONFIG: {
							storage.config = section;
							break;
						}
						// EEPROM
						case proto.SectionType.EEPROM: {
							storage.eeprom = section;
							break;
						}
					}
				}
			}
			this._storageInfo = storage;
			this.once('closed', () => {
				this._storageInfo = null;
			});
			return this._storageInfo;
		});
	}
}
