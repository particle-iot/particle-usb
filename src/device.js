const { DeviceBase, openDeviceById } = require('./device-base');
const { Request } = require('./request');
const { Result, errorForRequest } = require('./result');
const { fromProtobufEnum, extractBits } = require('./protobuf-util');
const usbProto = require('./usb-protocol');
const { RequestError, NotFoundError, TimeoutError, StateError } = require('./error');
const { globalOptions } = require('./config');
const DeviceOSProtobuf = require('@particle/device-os-protobuf');
const { definitions: proto, cloudDefinitions: protoCloud } = DeviceOSProtobuf;

const FirmwareModuleDeprecated = fromProtobufEnum(proto.FirmwareModuleType, {
	/** Bootloader module. */
	BOOTLOADER: 'BOOTLOADER',
	/** System part module. */
	SYSTEM_PART: 'SYSTEM_PART',
	/** User part module. */
	USER_PART: 'USER_PART',
	/** Monolithic firmware module. */
	MONO_FIRMWARE: 'MONO_FIRMWARE',
	/** Network co-processor firmware module */
	NCP_FIRMWARE: 'NCP_FIRMWARE',
	/** Radio stack module */
	RADIO_STACK: 'RADIO_STACK'
});

/**
 * Firmware module types.
 *
 * @enum {String}
 */
const FirmwareModule = fromProtobufEnum(protoCloud.FirmwareModuleType, {
	INVALID: 'INVALID_MODULE',
	RESOURCE: 'RESOURCE_MODULE',
	BOOTLOADER: 'BOOTLOADER_MODULE',
	MONO_FIRMWARE: 'MONO_FIRMWARE_MODULE',
	SYSTEM_PART: 'SYSTEM_PART_MODULE',
	USER_PART: 'USER_PART_MODULE',
	SETTINGS: 'SETTINGS_MODULE',
	NCP_FIRMWARE: 'NCP_FIRMWARE_MODULE',
	RADIO_STACK: 'RADIO_STACK_MODULE',
	ASSET: 'ASSET_MODULE',
});

/**
 * Firmware module store.
 *
 * @enum {String}
 */
const FirmwareModuleStore = fromProtobufEnum(protoCloud.FirmwareModuleStore, {
	MAIN: 'MAIN_MODULE_STORE',
	FACTORY: 'FACTORY_MODULE_STORE',
	BACKUP: 'BACKUP_MODULE_STORE',
	SCRATCHPAD: 'SCRATCHPAD_MODULE_STORE',
});

const LegacyFirmwareModuleValidityFlag = fromProtobufEnum(proto.FirmwareModuleValidityFlag, {
	INTEGRITY_CHECK_FAILED: 'INTEGRITY_CHECK_FAILED',
	DEPENDENCY_CHECK_FAILED: 'DEPENDENCY_CHECK_FAILED'
});

const FirmwareModuleValidityFlag = fromProtobufEnum(protoCloud.FirmwareModuleValidityFlag, {
	INTEGRITY_CHECK_FAILED: 'MODULE_INTEGRITY_VALID_FLAG',
	DEPENDENCY_CHECK_FAILED: 'MODULE_DEPENDENCIES_VALID_FLAG',
	RANGE_CHECK_FAILED: 'MODULE_RANGE_VALID_FLAG',
	PLATFORM_CHECK_FAILED: 'MODULE_PLATFORM_VALID_FLAG'
});

/**
 * Firmware module readable names
 *
 * @enum {String}
 */
const FirmwareModuleDisplayNames = {
	[FirmwareModule.INVALID]: 'Invalid',
	[FirmwareModule.RESOURCE]: 'Resource',
	[FirmwareModule.BOOTLOADER]: 'Bootloader',
	[FirmwareModule.MONO_FIRMWARE]: 'Monolithic Firmware',
	[FirmwareModule.SYSTEM_PART]: 'System Part',
	[FirmwareModule.USER_PART]: 'User Part',
	[FirmwareModule.SETTINGS]: 'Settings',
	[FirmwareModule.NCP_FIRMWARE]: 'Network Co-processor Firmware',
	[FirmwareModule.RADIO_STACK]: 'Radio Stack Module',
	[FirmwareModule.ASSET]: 'Asset'
};

/**
 * Device modes.
 *
 * @enum {String}
 */
const DeviceMode = fromProtobufEnum(proto.DeviceMode, {
	/** Device is in normal mode. */
	NORMAL: 'NORMAL_MODE',
	/** Device is in listening mode. */
	LISTENING: 'LISTENING_MODE'
});

/**
 * Logging levels.
 *
 * @enum {String}
 */
const LogLevel = fromProtobufEnum(proto.logging.LogLevel, {
	/** Enables logging of all messages. */
	ALL: 'ALL',
	/** Enables logging of trace messages. */
	TRACE: 'TRACE',
	/** Enables logging of info messages. */
	INFO: 'INFO',
	/** Enables logging of warning messages. */
	WARN: 'WARN',
	/** Enables logging of error messages. */
	ERROR: 'ERROR',
	/** Disables logging of any messages. */
	NONE: 'NONE'
});

const DEFAULT_FIRMWARE_UPDATE_TIMEOUT = 120000;

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
 * Basic functionality supported by most of Particle devices.
 *
 * This class is not meant to be instantiated directly. Use {@link getDevices} and
 * {@link openDeviceById} to create device instances.
 */
class Device extends DeviceBase {
	/**
	 * Get the device's serial number.
	 *
	 * Supported platforms:
	 * - Gen 3 (since Device OS 0.9.0)
	 * - Gen 2 (since Device OS 1.5.0)
	 *
	 * @param {Object} [options] Options.
	 * @param {Number} [options.timeout] Timeout (milliseconds).
	 * @return {Promise<String>}
	 */
	async getSerialNumber({ timeout = globalOptions.requestTimeout } = {}) {
		const r = await this.sendProtobufRequest(
			'GetSerialNumberRequest',
			null,
			{ timeout }
		);
		return r.serial;
	}

	/**
	 * Perform the system reset.
	 *
	 * Note: The only safe operation that can be performed on the device instance after the device
	 * resets is closing it via {@link DeviceBase#close}.
	 *
	 * Supported platforms:
	 * - Gen 3 (since Device OS 0.9.0)
	 * - Gen 2 (since Device OS 0.8.0)
	 *
	 * The `force` option is supported since Device OS 2.0.0.
	 *
	 * @param {Object} [options] Options.
	 * @param {Boolean} [options.force] Reset the device immediately, even if it is busy performing
	 *        some blocking operation, such as writing to flash.
	 * @param {Number} [options.timeout] Timeout (milliseconds).
	 * @return {Promise}
	 */
	async reset({ force = false, timeout = globalOptions.requestTimeout } = {}) {
		if (this.isInDfuMode) {
			return super.reset();
		}
		if (!force) {
			return this.sendRequest(Request.RESET, null /* msg */, { timeout });
		}
		const setup = {
			bmRequestType: usbProto.BmRequestType.HOST_TO_DEVICE,
			bRequest: usbProto.PARTICLE_BREQUEST,
			wIndex: Request.RESET.id,
			wValue: 0
		};
		return this.usbDevice.transferOut(setup);
	}

	/**
	 * Perform the factory reset.
	 *
	 * Note: The only safe operation that can be performed on the device instance after the device
	 * resets is closing it via {@link DeviceBase#close}.
	 *
	 * Supported platforms:
	 * - Gen 3 (since Device OS 0.9.0)
	 * - Gen 2 (since Device OS 0.8.0)
	 *
	 * @param {Object} [options] Options.
	 * @param {Number} [options.timeout] Timeout (milliseconds).
	 * @return {Promise}
	 */
	factoryReset({ timeout = globalOptions.requestTimeout } = {}) {
		return this.sendRequest(Request.FACTORY_RESET, null /* msg */, { timeout });
	}

	/**
	 * Reset and enter the DFU mode.
	 *
	 * Note: The only safe operation that can be performed on the device instance after the device
	 * resets is closing it via {@link DeviceBase#close}.
	 *
	 * Supported platforms:
	 * - Gen 3 (since Device OS 0.9.0)
	 * - Gen 2 (since Device OS 0.8.0)
	 *
	 * @param {Object} [options] Options.
	 * @param {Boolean} [options.noReconnectWait] After entering DFU mode, do not attempt to connect to the device to make sure it's in DFU mode.
	 *     This can be useful in a web browser because connecting to the device in DFU mode may prompt the user to authorize
	 *     access to the device.
	 * @param {Number} [options.timeout] Timeout (milliseconds).
	 * @return {Promise}
	 */
	enterDfuMode({ noReconnectWait = false, timeout = globalOptions.requestTimeout } = {}) {
		if (this.isInDfuMode) {
			return;
		}
		return this.timeout(timeout, async (s) => {
			await s.sendRequest(Request.DFU_MODE);
			await s.close();
			let isInDfuMode;

			if (!noReconnectWait) {
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
			}
		});
	}


	/**
	 * Reset and enter the safe mode.
	 *
	 * Note: The only safe operation that can be performed on the device instance after the device
	 * resets is closing it via {@link DeviceBase#close}.
	 *
	 * Supported platforms:
	 * - Gen 3 (since Device OS 0.9.0)
	 * - Gen 2 (since Device OS 0.8.0)
	 *
	 * @param {Object} [options] Options.
	 * @param {Number} [options.timeout] Timeout (milliseconds).
	 * @return {Promise}
	 */
	enterSafeMode({ timeout = globalOptions.requestTimeout } = {}) {
		return this.sendRequest(Request.SAFE_MODE, null /* msg */, { timeout });
	}

	/**
	 * Enter listening mode.
	 *
	 * Supported platforms:
	 * - Gen 3 (since Device OS 0.9.0)
	 * - Gen 2 (since Device OS 0.8.0)
	 *
	 * @param {Object} [options] Options.
	 * @param {Number} [options.timeout] Timeout (milliseconds).
	 * @return {Promise} Resolves when either device is confirmed to be in listening mode, throws an error, or timeout exceeded.
	 */
	async enterListeningMode({ timeout = globalOptions.requestTimeout } = {}) {
		return this.timeout(timeout, async (s) => {
			await this.sendProtobufRequest('StartListeningModeRequest', {}, { timeout });

			// Wait until the device enters the listening mode
			while (true) { // eslint-disable-line no-constant-condition
				// GetDeviceModeRequest may not be supported by the device even if start listening mode does work, hence try/catch
				try {
					const getDeviceModeReply = await this.sendProtobufRequest('GetDeviceModeRequest', {}, { timeout });

					const deviceModeEnum = DeviceOSProtobuf.getDefinition('DeviceMode').message;
					// break if in listening mode
					if (getDeviceModeReply.mode === deviceModeEnum.LISTENING_MODE) {
						break;
					}
				} catch (e) {
					if (e instanceof RequestError) {
						break;
					}
				}

				await s.delay(500);
			}
		});
	}

	/**
	 * Leave the listening mode.
	 *
	 * Supported platforms:
	 * - Gen 3 (since Device OS 0.9.0)
	 * - Gen 2 (since Device OS 0.8.0)
	 *
	 * @param {Object} [options] Options.
	 * @param {Number} [options.timeout] Timeout (milliseconds).
	 * @return {Promise}
	 */
	leaveListeningMode({ timeout = globalOptions.requestTimeout } = {}) {
		return this.sendRequest(Request.STOP_LISTENING, null /* msg */, { timeout });
	}

	/**
	 * Get the device mode.
	 *
	 * Supported platforms:
	 * - Gen 3 (since Device OS 0.9.0)
	 * - Gen 2 (since Device OS 1.1.0)
	 *
	 * @param {Object} [options] Options.
	 * @param {Number} [options.timeout] Timeout (milliseconds).
	 * @return {Promise<DeviceMode>}
	 */
	async getDeviceMode({ timeout = globalOptions.requestTimeout } = {}) {
		const r = await this.sendRequest(Request.GET_DEVICE_MODE, null /* msg */, { timeout });
		return DeviceMode.fromProtobuf(r.mode);
	}

	/**
	 * Start the Nyan LED indication.
	 *
	 * Supported platforms:
	 * - Gen 3 (since Device OS 0.9.0)
	 * - Gen 2 (since Device OS 0.8.0)
	 *
	 * @param {Object} [options] Options.
	 * @param {Number} [options.timeout] Timeout (milliseconds).
	 * @return {Promise}
	 */
	startNyanSignal({ timeout = globalOptions.requestTimeout } = {}) {
		return this.sendRequest(Request.START_NYAN_SIGNAL, null /* msg */, { timeout });
	}

	/**
	 * Stop the Nyan LED indication.
	 *
	 * Supported platforms:
	 * - Gen 3 (since Device OS 0.9.0)
	 * - Gen 2 (since Device OS 0.8.0)
	 *
	 * @param {Object} [options] Options.
	 * @param {Number} [options.timeout] Timeout (milliseconds).
	 * @return {Promise}
	 */
	stopNyanSignal({ timeout = globalOptions.requestTimeout } = {}) {
		return this.sendRequest(Request.STOP_NYAN_SIGNAL, null /* msg */, { timeout });
	}

	/**
	 * Perform the firmware update.
	 *
	 * Supported platforms:
	 * - Gen 3 (since Device OS 0.9.0)
	 * - Gen 2 (since Device OS 0.8.0)
	 *
	 * @param {Buffer} data Firmware data.
	 * @param {Object} [options] Options.
	 * @param {Number} [options.timeout] Timeout (milliseconds).
	 * @param {Function} [options.progress] User's callback function to log progress of the flashing process.
	 * @return {Promise}
	 */
	async updateFirmware(data, { timeout = DEFAULT_FIRMWARE_UPDATE_TIMEOUT, progress } = {}) {
		if (!data.length) {
			throw new RangeError('Invalid firmware size');
		}
		return this.timeout(timeout, async (s) => {
			if (progress) {
				progress({ event: 'start-erase', bytes: data.length });
			}
			const { chunkSize } = await s.sendRequest(Request.START_FIRMWARE_UPDATE, { size: data.length });
			if (progress) {
				progress({ event: 'erased', bytes: data.length });
				progress({ event: 'start-download', bytes: data.length });
			}
			let offs = 0;
			while (offs < data.length) {
				const n = Math.min(chunkSize, data.length - offs);
				await s.sendRequest(Request.FIRMWARE_UPDATE_DATA, { data: data.slice(offs, offs + n) });
				if (progress) {
					progress({ event: 'downloaded', bytes: n });
				}
				offs += n;
			}
			await s.sendRequest(Request.FINISH_FIRMWARE_UPDATE, { validateOnly: false });
			if (progress) {
				progress({ event: 'complete-download', bytes: data.length });
			}
		});
	}

	/**
	 * Get firmware module data.
	 *
	 * @deprecated This method is not guaranteed to work with recent versions of Device OS and it will
	 *             be removed in future versions of this library.
	 *
	 * Supported platforms:
	 * - Gen 2 (since Device OS 0.8.0, deprecated in 2.0.0)
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
	 * Get asset info.
	 *
	 *
	 * Supported platforms:
	 * - Gen 3+ (since Device OS 5.6.0)
	 *
	 * @return {Promise<Array>} List of asssets available on the device.
	 */
	async getAssetInfo({ timeout = globalOptions.timeout } = {}) {
		if (this.isInDfuMode) {
			throw new StateError('Cannot get information when the device is in DFU mode');
		}

		const assetInfoResponse = await this.sendProtobufRequest('GetAssetInfoRequest', null, { timeout });
		const available = assetInfoResponse.available.map(asset => {
			const { name, size, storageSize } = asset;
			const hash = asset.hash.toString('hex');
			return {
				name,
				hash,
				size,
				storageSize
			};
		});
		const required = assetInfoResponse.required.map(asset => {
			const { name } = asset;
			const hash = asset.hash.toString('hex');
			return {
				name,
				hash,
			};
		});
		return { available, required };
	}

	/**
	 * Get firmware module info.
	 *
	 *
	 * Supported platforms:
	 * - Gen 3 (since Device OS 0.9.0)
	 * - Gen 2 (since Device OS 0.8.0)
	 * - New format since 5.6.0 (old format in 'modules_deprecated')
	 * @param {Number} [options.timeout] Timeout (milliseconds).
	 * @return {Promise<Array>} List of modules installed into the device and their dependencies
	 */
	async getFirmwareModuleInfo({ timeout = globalOptions.requestTimeout } = {}) {
		if (this.isInDfuMode) {
			throw new StateError('Cannot get information when the device is in DFU mode');
		}

		const moduleInfoResponse = await this.sendProtobufRequest('GetModuleInfoRequest', null, { timeout });
		const { modulesDeprecated, modules } = moduleInfoResponse;

		if (modulesDeprecated && modulesDeprecated.length > 0) {
			return modulesDeprecated.map(module => {
				const { index, type, dependencies, size, validity, version } = module;
				const validityErrors = extractBits(validity, LegacyFirmwareModuleValidityFlag);

				return {
					type: FirmwareModuleDeprecated.fromProtobuf(type),
					index,
					version,
					size,
					validity,
					validityErrors,
					dependencies: dependencies.map(dependency => {
						return {
							index: dependency.index,
							version: dependency.version,
							type: FirmwareModuleDeprecated.fromProtobuf(dependency.type)
						};
					}),
				};
			});
		}

		return modules.map(module => {
			const { index, type, dependencies, size, version, assetDependencies, maxSize, store, hash } = module;
			const failedFlags = module.checkedFlags ^ module.passedFlags;
			const validityErrors = extractBits(failedFlags, FirmwareModuleValidityFlag);

			return {
				type: FirmwareModule.fromProtobuf(type),
				store: FirmwareModuleStore.fromProtobuf(store),
				index,
				version,
				size,
				maxSize,
				hash: hash.toString('hex'),
				failedFlags,
				validityErrors,
				dependencies: dependencies.map(dependency => {
					return {
						index: dependency.index,
						version: dependency.version,
						type: FirmwareModule.fromProtobuf(dependency.type)
					};
				}),
				assetDependencies: assetDependencies.map(asset => {
					return {
						name: asset.name,
						hash: asset.hash.toString('hex')
					};
				})
			};
		});
	}

	/**
	 * Check if the device runs a modular firmware.
	 *
	 * @deprecated This method is not guaranteed to work with recent versions of Device OS and it will
	 *             be removed in future versions of this library.
	 *
	 * Supported platforms:
	 * - Gen 2 (since Device OS 0.8.0, deprecated in 2.0.0)
	 *
	 * @return {Promise<Boolean>}
	 */
	hasModularFirmware() {
		return this._getStorageInfo().then(storage => storage.hasModularFirmware);
	}

	/**
	 * Set factory firmware.
	 *
	 * @deprecated This method is not guaranteed to work with recent versions of Device OS and it will
	 *             be removed in future versions of this library.
	 *
	 * Supported platforms:
	 * - Gen 2 (since Device OS 0.8.0, deprecated in 2.0.0)
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
	 * @deprecated This method is not guaranteed to work with recent versions of Device OS and it will
	 *             be removed in future versions of this library.
	 *
	 * Supported platforms:
	 * - Gen 2 (since Device OS 0.8.0, deprecated in 2.0.0)
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
	 * @deprecated This method is not guaranteed to work with recent versions of Device OS and it will
	 *             be removed in future versions of this library.
	 *
	 * Supported platforms:
	 * - Gen 2 (since Device OS 0.8.0, deprecated in 2.0.0)
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
	 * @deprecated This method is not guaranteed to work with recent versions of Device OS and it will
	 *             be removed in future versions of this library.
	 *
	 * Supported platforms:
	 * - Gen 2 (since Device OS 0.8.0, deprecated in 2.0.0)
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
	 * @deprecated This method is not guaranteed to work with recent versions of Device OS and it will
	 *             be removed in future versions of this library.
	 *
	 * Supported platforms:
	 * - Gen 2 (since Device OS 0.8.0, deprecated in 2.0.0)
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
	 * @deprecated This method is not guaranteed to work with recent versions of Device OS and it will
	 *             be removed in future versions of this library.
	 *
	 * Supported platforms:
	 * - Gen 2 (since Device OS 0.8.0, deprecated in 2.0.0)
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
	 * @deprecated This method is not guaranteed to work with recent versions of Device OS and it will
	 *             be removed in future versions of this library.
	 *
	 * Supported platforms:
	 * - Gen 2 (since Device OS 0.8.0, deprecated in 2.0.0)
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
	 * @deprecated This method is not guaranteed to work with recent versions of Device OS and it will
	 *             be removed in future versions of this library.
	 *
	 * Supported platforms:
	 * - Gen 2 (since Device OS 0.8.0, deprecated in 2.0.0)
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
	 * @deprecated This method is not guaranteed to work with recent versions of Device OS and it will
	 *             be removed in future versions of this library.
	 *
	 * Supported platforms:
	 * - Gen 2 (since Device OS 0.8.0, deprecated in 2.0.0)
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
	 * @deprecated This method is not guaranteed to work with recent versions of Device OS and it will
	 *             be removed in future versions of this library.
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
	 * @deprecated This method is not guaranteed to work with recent versions of Device OS and it will
	 *             be removed in future versions of this library.
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
	 * @deprecated This method is not guaranteed to work with recent versions of Device OS and it will
	 *             be removed in future versions of this library.
	 *
	 * @return {Promise<Array<Object>>}
	 */
	async getLogHandlers() {
		const rep = await this.sendRequest(Request.GET_LOG_HANDLERS);
		return rep.handlers.map(h => ({
			id: h.id
		}));
	}

	/**
	 * Sends a protobuf encoded request to Device and decodes response. Use higher level methods like getSerialNumber() than this if possible.
	 * @param {String} protobufMessageName - The protobuf message name, see DeviceOSProtobuf.getDefinitions() for valid values.
	 * @param {Object} protobufMessageData data that will be encoded into the protobuf request before sending to device
	 * @param {*} opts See sendControlRequest(), same options are here.
	 * @returns {Object} Depends on schema defined by `req.reply`
	 * @throws {RequestError} thrown when message isn't supported by device or other USB related failures
	 */
	async sendProtobufRequest(protobufMessageName, protobufMessageData = {}, opts) {
		const protobufDefinition = DeviceOSProtobuf.getDefinition(protobufMessageName);
		const encodedProtobufBuffer = DeviceOSProtobuf.encode(protobufMessageName, protobufMessageData);
		const rep = await this.sendControlRequest(
			protobufDefinition.id,
			encodedProtobufBuffer,
			opts
		);

		if (rep.result !== Result.OK) {
			throw errorForRequest(rep.result);
		}

		if (rep.data) {
			// Parse the response message
			return DeviceOSProtobuf.decode(
				protobufDefinition.replyMessage,
				rep.data
			);
		} else {
			// Create a message with default-initialized properties
			return protobufDefinition.replyMessage.create();
		}
	}

	sendRequest(req, msg, opts) {
		let buf = null;
		if (msg && req.request) {
			const m = req.request.create(msg); // Protobuf message object
			buf = req.request.encode(m).finish();
		}
		return this.sendControlRequest(req.id, buf, opts).then(rep => {
			let r = undefined;
			// Note: Nothing depends on opts.dontThrow anymore
			if (opts && opts.dontThrow) {
				r = { result: rep.result };
			} else if (rep.result !== Result.OK) {
				throw errorForRequest(rep.result);
			}
			if (req.reply) {
				if (rep.data) {
					// Parse the response message
					r = Object.assign(req.reply.decode(rep.data), r);
				} else {
					// Create a message with default-initialized properties
					r = Object.assign(req.reply.create(), r);
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
			ms = undefined;
		}
		if (!ms) {
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

module.exports = {
	FirmwareModule,
	FirmwareModuleDisplayNames,
	FirmwareModuleStore,
	DeviceMode,
	LogLevel,
	Device
};
