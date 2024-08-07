/*
 * dfu.js
 * Copyright (c) 2023, Particle
 *
 * Some functions are extracted from the web-dfu project:
 * Copyright (c) 2016, Devan Lai
 *
 * Permission to use, copy, modify, and/or distribute this software for any
 * purpose with or without fee is hereby granted, provided that the above
 * copyright notice and this permission notice appear in all copies.
 *
 * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
 * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
 * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
 * ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
 * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
 * ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
 * OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
 */

const { DeviceError, UsbStallError, DeviceProtectionError, UnsupportedDfuseCommandError } = require('./error');

/**
 * A generic DFU error.
 */
class DfuError extends DeviceError {
	constructor(...args) {
		super(...args);
		Error.captureStackTrace(this, this.constructor);
	}
}

// 3. Requests, USB Device Firmware Upgrade Specification, Revision 1.1
const DfuRequestType = {
	// | wValue    | wIndex    | wLength | Data     |
	// +-----------+-----------+---------+----------+
	DFU_DETACH: 0, // | wTimeout  | Interface | Zero    | None     |
	DFU_DNLOAD: 1, // | wBlockNum | Interface | Length  | Firmware |
	DFU_UPLOAD: 2, // | Zero      | Interface | Length  | Firmware |
	DFU_GETSTATUS: 3, // | Zero      | Interface | 6       | Status   |
	DFU_CLRSTATUS: 4, // | Zero      | Interface | Zero    | None     |
	DFU_GETSTATE: 5, // | Zero      | Interface | 1       | State    |
	DFU_ABORT: 6 // | Zero      | Interface | Zero    | None     |
};

// 6.1.2 DFU_GETSTATUS Request, USB Device Firmware Upgrade Specification, Revision 1.1
const DfuDeviceStatus = {
	// No error condition is present.
	OK: 0x00,
	// File is not targeted for use by this device.
	errTARGET: 0x01,
	// File is for this device but fails some vendor-specific verification test.
	errFILE: 0x02,
	// Device is unable to write memory.
	errWRITE: 0x03,
	// Memory erase function failed.
	errERASE: 0x04,
	// Memory erase check failed.
	errCHECK_ERASED: 0x05,
	// Program memory function failed.
	errPROG: 0x06,
	// Programmed memory failed verification.
	errVERIFY: 0x07,
	// Cannot program memory due to received address that is out of range.
	errADDRESS: 0x08,
	// Received DFU_DNLOAD with wLength = 0, but device does not think it has all of the data yet.
	errNOTDONE: 0x09,
	// Device’s firmware is corrupt. It cannot return to run-time (non-DFU) operations.
	errFIRMWARE: 0x0A,
	// iString indicates a vendor-specific error.
	errVENDOR: 0x0B,
	// Device detected unexpected USB reset signaling.
	errUSBR: 0x0C,
	// Device detected unexpected power on reset.
	errPOR: 0x0D,
	// Something went wrong, but the device does not know what it was.
	errUNKNOWN: 0x0E,
	// Device stalled an unexpected request.
	errSTALLEDPKT: 0x0F,
};

const DfuDeviceStatusMap = Object.keys(DfuDeviceStatus).reduce((obj, key) => {
	obj[DfuDeviceStatus[key]] = key;
	return obj;
}, {});

// 6.1.2 DFU_GETSTATUS Request, USB Device Firmware Upgrade Specification, Revision 1.1
const DfuDeviceState = {
	// Device is running its normal application.
	appIDLE: 0,
	// Device is running its normal application, has received the DFU_DETACH request, and is waiting
	// for a USB reset.
	appDETACH: 1,
	// Device is operating in the DFU mode and is waiting for requests.
	dfuIDLE: 2,
	// Device has received a block and is waiting for the host to solicit the status via DFU_GETSTATUS.
	dfuDNLOAD_SYNC: 3,
	// Device is programming a control-write block into its nonvolatile memories.
	dfuDNBUSY: 4,
	// Device is processing a download operation. Expecting DFU_DNLOAD requests.
	dfuDNLOAD_IDLE: 5,
	// Device has received the final block of firmware from the host and is waiting for receipt of
	// DFU_GETSTATUS to begin the Manifestation phase; or device has completed the Manifestation
	// phase and is waiting for receipt of DFU_GETSTATUS. (Devices that can enter this state after
	// the Manifestation phase set bmAttributes bit bitManifestationTolerant to 1.)
	dfuMANIFEST_SYNC: 6,
	// Device is in the Manifestation phase. (Not all devices will be able to respond to DFU_GETSTATUS
	// when in this state.)
	dfuMANIFEST: 7,
	// Device has programmed its memories and is waiting for a USB reset or a power on reset. (Devices
	// that must enter this state clear bitManifestationTolerant to 0.)
	dfuMANIFEST_WAIT_RESET: 8,
	// The device is processing an upload operation. Expecting DFU_UPLOAD requests.
	dfuUPLOAD_IDLE: 9,
	// An error has occurred. Awaiting the DFU_CLRSTATUS request.
	dfuERROR: 10
};

const DfuDeviceStateMap = Object.keys(DfuDeviceState).reduce((obj, key) => {
	obj[DfuDeviceState[key]] = key;
	return obj;
}, {});

/**
 * DFU with ST Microsystems extensions.
 *
 * AN3156: USB DFU protocol used in the STM32 bootloader.
 */
const DfuseCommand = {
	DFUSE_COMMAND_NONE: 0xff,
	DFUSE_COMMAND_GET_COMMAND: 0x00,
	DFUSE_COMMAND_SET_ADDRESS_POINTER: 0x21,
	DFUSE_COMMAND_ERASE: 0x41,
	DFUSE_COMMAND_READ_UNPROTECT: 0x92,
	DFUSE_COMMAND_ENTER_SAFE_MODE: 0xfa, // Particle's extension
	DFUSE_COMMAND_CLEAR_SECURITY_MODE_OVERRIDE: 0xfb // ditto
};

const DfuBmRequestType = {
	HOST_TO_DEVICE: 0x21,
	DEVICE_TO_HOST: 0xA1
};

const DFU_STATUS_SIZE = 6;
// FIXME:
const DEFAULT_INTERFACE = 0;
const DEFAULT_ALTERNATE = 0;

const DEFAULT_TRANSFER_SIZE = 1024;

class Dfu {
	constructor(dev, logger) {
		this._dev = dev;
		this._log = logger;
		this._interface = DEFAULT_INTERFACE;
		this._alternate = DEFAULT_ALTERNATE;
		this._claimed = false;
		this._memoryInfo = null;
		this._transferSize = DEFAULT_TRANSFER_SIZE;
		this._allInterfaces = [];
	}

	/**
	 * Open DFU interface.
	 *
	 * @return {Promise}
	 */
	async open() {
		await this._dev.claimInterface(this._interface);
		this._claimed = true;
		await this._dev.setAltSetting(this._interface, this._alternate);
		let desc = await this._getConfigDescriptor(0); // Use the default config
		desc = this._parseConfigDescriptor(desc);
		this._allInterfaces = desc.interfaces;
		this._supportedDfuseCommands = [];
	}

	/**
	 * Close DFU interface.
	 *
	 * @return {Promise}
	 */
	async close() {
		if (this._claimed) {
			return this._dev.releaseInterface(this._interface);
		}
	}

	/**
	 * Leave DFU mode.
	 *
	 * @return {Promise}
	 */
	async leave() {
		await this._goIntoIdleState({ dnloadIdle: true });

		await this._sendDnloadRequest(Buffer.alloc(0), 2);

		await this._pollUntil(
			// Wait for dfuDNLOAD_IDLE in case of Gen2 and for dfuMANIFEST in case of Gen3 and above.
			// This is a workaround for Gen 2 DFU implementation where in order to please dfu-util
			// for some reason we are going off-standard and instead of reporting the actual dfuMANIFEST state
			// report dfuDNLOAD_IDLE :|
			state => (state === DfuDeviceState.dfuMANIFEST || state === DfuDeviceState.dfuDNLOAD_IDLE));
	}

	/**
	 * Enter safe mode.
	 *
	 * @returns {Promise}
	 */
	async enterSafeMode() {
		await this._checkDfuseCommandSupported(DfuseCommand.DFUSE_COMMAND_ENTER_SAFE_MODE);
		await this._goIntoIdleState({ dnloadIdle: true });
		const data = Buffer.alloc(1);
		data[0] = DfuseCommand.DFUSE_COMMAND_ENTER_SAFE_MODE;
		await this._sendDnloadRequest(data, 0 /* wValue */);
		await this._pollUntil((state) => state === DfuDeviceState.dfuMANIFEST);
	}

	/**
	 * Re-enable device protection.
	 *
	 * @returns {Promise}
	 */
	async clearSecurityModeOverride() {
		await this._checkDfuseCommandSupported(DfuseCommand.DFUSE_COMMAND_CLEAR_SECURITY_MODE_OVERRIDE);
		await this._goIntoIdleState({ dnloadIdle: true });
		await this._dfuseCommand(DfuseCommand.DFUSE_COMMAND_CLEAR_SECURITY_MODE_OVERRIDE);
	}

	/**
	 * Get the protection state of the device.
	 * A device with protection enabled will have all segments not readable and not writeable.
	 *
	 * @return {Promise} Object with property 'protected'
	 */
	async getProtectionState() {
		try {
			const res = await this._getStringDescriptor(0xfa);
			const state = res.split(';').find(kv => kv.startsWith('sm=')).split('=')[1].trim().charAt(0);
			switch (state) {
				case 'o': return { protected: false, overridden: false };
				case 'p': return { protected: true };
				case 's': return { protected: false, overridden: true };
				default: throw new Error('Unknown device state');
			}
		} catch (error) {
			// Fallback for devices with Device-OS < 6.1.2
			await this.setAltSetting(0); // setting 0 is for Internal Flash

			const allSegmentsProtected = this._memoryInfo.segments.every(s =>
				s.erasable === true && s.writable === false && s.readable === false
			);

			// Use `null` for `overridden` since we cannot distinguish between Open and Service Mode
			return { protected: allSegmentsProtected, overridden: null };
		}
	}

	/**
	 * Set the alternate interface for DFU and initialize memory information.
	 *
	 * @param {number} setting - The alternate interface index to set.
	 * @return {Promise}
	 */
	async setAltSetting(setting) {
		let iface = null;
		let xferSize = null;
		for (const i of this._allInterfaces) {
			if (i.bInterfaceNumber === this._interface) {
				if (!iface && i.bAlternateSetting === setting) {
					iface = i;
					if (i.dfuFunctional) {
						xferSize = i.dfuFunctional.wTransferSize;
					}
					if (xferSize) {
						break;
					}
				}
				// DFU_FUNCTIONAL descriptor may not be available for each interface with the given number
				if (!xferSize && i.dfuFunctional) {
					xferSize = i.dfuFunctional.wTransferSize;
					if (iface) {
						break;
					}
				}
			}
		}
		if (!iface) {
			throw new Error('Invalid alternate setting');
		}
		if (!iface.iInterface) {
			throw new Error('Missing string descriptor');
		}
		const ifaceName = await this._getStringDescriptor(iface.iInterface);
		const memInfo = this._parseMemoryDescriptor(ifaceName);
		await this._dev.setAltSetting(this._interface, setting);
		this._transferSize = xferSize || DEFAULT_TRANSFER_SIZE;
		this._memoryInfo = memInfo;
		this._alternate = setting;
	}

	/**
	 * Perform DFU download of binary data to the device.
	 *
	 * @param {Object} options Options.
	 * @param {number} options.startAddr - The starting address to write the data.
	 * @param {Buffer} options.data - The binary data to write.
	 * @param {boolean} [options.noErase] - Skip erasing the device memory.
	 * @param {boolean} [options.leave] - Leave DFU mode after download.
	 * @param {function} [options.progress] - Callback function used to log progress.
	 * @return {Promise}
	 */
	async doDownload({ startAddr, data, noErase, leave, progress }) {
		if (!this._memoryInfo || !this._memoryInfo.segments) {
			throw new Error('No memory map available');
		}

		const startAddress = startAddr;
		const segment = this._getSegment(startAddr);

		if (segment === null) {
			this._log.error(`Start address 0x${startAddress.toString(16)} outside of memory map bounds`);
		}
		if (segment && !segment.writable) {
			throw new DeviceProtectionError('Segment is not writable');
		}

		const expectedSize = data.byteLength;

		if (!noErase) {
			this._log.info('Erasing DFU device memory');
			await this._erase(startAddress, expectedSize, progress);
		}

		this._log.info('Copying binary data to DFU device startAddress=' + startAddress + ' total_expected_size=' + expectedSize);

		if (progress) {
			progress({ event: 'start-download', bytes: expectedSize });
		}
		let bytesSent = 0;
		let address = startAddress;
		while (bytesSent < expectedSize) {
			const bytesLeft = expectedSize - bytesSent;
			const chunkSize = Math.min(bytesLeft, this._transferSize);

			let dfuStatus;
			try {
				await this._dfuseCommand(DfuseCommand.DFUSE_COMMAND_SET_ADDRESS_POINTER, address);
				this._log.trace(`Set address to 0x${address.toString(16)}`);
				await this._sendDnloadRequest(data.slice(bytesSent, bytesSent + chunkSize), 2);
				dfuStatus = await this._pollUntil(state => (state === DfuDeviceState.dfuDNLOAD_IDLE));
				this._log.trace('Sent ' + chunkSize + ' bytes');
				address += chunkSize;
			} catch (error) {
				throw new Error('Error during DfuSe download: ' + error);
			}

			if (dfuStatus.status !== DfuDeviceStatus.OK) {
				if (progress) {
					progress({ event: 'failed-download' });
				}
				throw new Error(`DFU DOWNLOAD failed state=${dfuStatus.state}, status=${dfuStatus.status}`);
			}

			this._log.trace('Wrote ' + chunkSize + ' bytes');
			bytesSent += chunkSize;
			if (progress) {
				progress({ event: 'downloaded', bytes: chunkSize });
			}
		}
		this._log.info(`Wrote ${bytesSent} bytes total`);
		if (progress) {
			progress({ event: 'complete-download', bytes: bytesSent });
		}

		if (leave) {
			this._log.info('Manifesting new firmware');
			try {
				await this.leave();
			} catch (error) {
				throw new Error('Error during Dfu manifestation: ' + error);
			}
		}
	}

	async _goIntoIdleState({ dnloadIdle = false, uploadIdle = false } = {}) {
		try {
			const state = await this._getStatus();
			if (state.state === DfuDeviceState.dfuERROR) {
				// If we are in dfuERROR state, simply issue DFU_CLRSTATUS and we'll go into dfuIDLE
				await this._clearStatus();
			}

			if (state.state !== DfuDeviceState.dfuIDLE &&
					!(dnloadIdle && state.state === DfuDeviceState.dfuDNLOAD_IDLE) &&
					!(uploadIdle && state.state === DfuDeviceState.dfuUPLOAD_IDLE)) {
				// If we are in some kind of an unknown state, issue DFU_CLRSTATUS, which may fail,
				// but the device will go into dfuERROR state, so a subsequent DFU_CLRSTATUS will get us
				// into dfuIDLE
				await this._clearStatus();
			}
		} catch (err) {
			// DFU_GETSTATUS or DFU_CLRSTATUS failed, we are most likely in dfuERROR state, clear it
			await this._clearStatus();
		}

		// Confirm we are in dfuIDLE or, optionally, in dfuDNLOAD_IDLE or dfuUPLOAD_IDLE
		const state = await this._getStatus();
		if (state.state !== DfuDeviceState.dfuIDLE &&
				!(dnloadIdle && state.state === DfuDeviceState.dfuDNLOAD_IDLE) &&
				!(uploadIdle && state.state === DfuDeviceState.dfuUPLOAD_IDLE)) {
			throw new DfuError('Invalid state');
		}
		return state;
	}

	/**
	 * Sends a download request to the DFU device with the specified request and value.
	 * This request is sent via nodeusb or webusb
	 *
	 * @param {Buffer} req The request data buffer to be sent to the device.
	 * @param {number} wValue The value to be sent as part of the request.
	 */
	async _sendDnloadRequest(data, wValue) {
		const setup = {
			bmRequestType: DfuBmRequestType.HOST_TO_DEVICE,
			bRequest: DfuRequestType.DFU_DNLOAD,
			wIndex: this._interface,
			wValue: wValue
		};
		return this._dev.transferOut(setup, data);
	}

	async _sendUploadReqest(length, value) {
		const setup = {
			bmRequestType: DfuBmRequestType.DEVICE_TO_HOST,
			bRequest: DfuRequestType.DFU_UPLOAD,
			wIndex: this._interface,
			wValue: value,
			wLength: length
		};
		return this._dev.transferIn(setup);
	}

	async _sendAbortRequest() {
		const setup = {
			bmRequestType: DfuBmRequestType.HOST_TO_DEVICE,
			bRequest: DfuRequestType.DFU_ABORT,
			wIndex: this._interface,
			wValue: 0
		};
		return this._dev.transferOut(setup, Buffer.alloc(0));
	}

	/**
	 * Retrieves the status from the DFU (Device Firmware Upgrade) device.
	 *
	 * @returns {Promise<object>} A Promise that resolves with the status object containing status, pollTimeout, and state.
	 * @throws {DfuError} If parsing the DFU_GETSTATUS response fails or the status/state is invalid.
	 */
	async _getStatus() {
		const setup = {
			bmRequestType: DfuBmRequestType.DEVICE_TO_HOST,
			bRequest: DfuRequestType.DFU_GETSTATUS,
			wIndex: this._interface,
			wValue: 0,
			wLength: DFU_STATUS_SIZE
		};
		const data = await this._dev.transferIn(setup);
		if (!data || data.length !== DFU_STATUS_SIZE) {
			throw new DfuError('Could not parse DFU_GETSTATUS response');
		}
		let bStatusWithPollTimeout = data.readUInt32LE(0);

		const bStatus = (bStatusWithPollTimeout & 0xff);
		bStatusWithPollTimeout >>= 8;
		const bState = data.readUInt8(4);
		const iString = data.readUInt8(5);

		const stat = {
			status: bStatus,
			pollTimeout: bStatusWithPollTimeout,
			state: bState
		};
		if (iString) {
			// decode the vendor specific string descriptor
			try {
				const description = await this._getStringDescriptor(iString);
				if (description && description.length) {
					stat.description = description;
				}
			} catch (e) {
				// ignore
			}
		}
		return stat;
	}

	/**
	 * Poll until the given statePredicate is true or the device goes into dfuERROR state.
	 *
	 * @param {function} statePredicate - The function to check the device state.
	 * @return {object} - The DFU status object after polling.
	 */
	async _pollUntil(statePredicate) {
		let dfuStatus = await this._getStatus();

		function asyncSleep(durationMs) {
			return new Promise((resolve) => {
				// this._log.trace('Sleeping for ' + durationMs + 'ms');
				setTimeout(resolve, durationMs);
			});
		}

		while (!statePredicate(dfuStatus.state) && dfuStatus.state !== DfuDeviceState.dfuERROR) {
			await asyncSleep(dfuStatus.pollTimeout);
			dfuStatus = await this._getStatus();
		}

		return dfuStatus;
	}

	/**
	 * Sends the DFU_CLRSTATUS request to the DFU device to clear any error status.
	 */
	async _clearStatus() {
		const setup = {
			bmRequestType: DfuBmRequestType.HOST_TO_DEVICE,
			bRequest: DfuRequestType.DFU_CLRSTATUS,
			wIndex: this._interface,
			wValue: 0
		};
		return this._dev.transferOut(setup, Buffer.alloc(0));
	}

	/**
	 * Parse the memory descriptor string and create a memory map.
	 *
	 * @param {string} desc - The memory descriptor string.
	 * @return {object} - Memory map information.
	 */
	_parseMemoryDescriptor(desc) {
		const nameEndIndex = desc.indexOf('/');
		if (!desc.startsWith('@') || nameEndIndex === -1) {
			throw new Error(`Not a DfuSe memory descriptor: "${desc}"`);
		}

		const name = desc.substring(1, nameEndIndex).trim();
		const segmentString = desc.substring(nameEndIndex);

		const segments = [];

		const sectorMultipliers = {
			' ': 1,
			'B': 1,
			'K': 1024,
			'M': 1048576
		};

		const rgx = /\/\s*(0x[0-9a-fA-F]{1,8})\s*\/(\s*[0-9]+\s*\*\s*[0-9]+\s?[ BKM]\s*[abcdefg]\s*,?\s*)+/g;
		let contiguousSegmentMatch;
		while ((contiguousSegmentMatch = rgx.exec(segmentString)) !== null) {
			const segmentRegex = /([0-9]+)\s*\*\s*([0-9]+)\s?([ BKM])\s*([abcdefg])\s*,?\s*/g;
			let startAddress = parseInt(contiguousSegmentMatch[1], 16);
			let segmentMatch;
			while ((segmentMatch = segmentRegex.exec(contiguousSegmentMatch[0])) !== null) {
				const segment = {};
				const sectorCount = parseInt(segmentMatch[1], 10);
				const sectorSize = parseInt(segmentMatch[2]) * sectorMultipliers[segmentMatch[3]];
				const properties = segmentMatch[4].charCodeAt(0) - 'a'.charCodeAt(0) + 1;
				segment.start = startAddress;
				segment.sectorSize = sectorSize;
				segment.end = startAddress + sectorSize * sectorCount;
				segment.readable = (properties & 0x1) !== 0;
				segment.erasable = (properties & 0x2) !== 0;
				segment.writable = (properties & 0x4) !== 0;
				segments.push(segment);

				startAddress += sectorSize * sectorCount;
			}
		}

		return { 'name': name, 'segments': segments };
	}

	/**
	 * Send a DfuSe command to the DFU device.
	 *
	 * @param {number} command - The DfuSe command to send.
	 * @param {number} param - Optional. The parameter for the command.
	 * @param {number} len - Optional. The length of the command payload.
	 * @return {Promise}
	 */
	async _dfuseCommand(command, param) {
		if (typeof param === 'undefined') {
			param = 0x00;
		}

		const commandNames = {
			[DfuseCommand.DFUSE_COMMAND_GET_COMMAND]: 'GET_COMMANDS',
			[DfuseCommand.DFUSE_COMMAND_SET_ADDRESS_POINTER]: 'SET_ADDRESS',
			[DfuseCommand.DFUSE_COMMAND_ERASE]: 'ERASE_SECTOR',
			[DfuseCommand.DFUSE_COMMAND_READ_UNPROTECT]: 'READ_UNPROTECT',
			[DfuseCommand.DFUSE_COMMAND_ENTER_SAFE_MODE]: 'ENTER_SAFE_MODE',
			[DfuseCommand.DFUSE_COMMAND_CLEAR_SECURITY_MODE_OVERRIDE]: 'CLEAR_SECURITY_MODE_OVERRIDE'
		};

		const payload = Buffer.alloc(5);
		payload.writeUInt8(command, 0);
		payload.writeUInt32LE(param, 1);

		for (let triesLeft = 4; triesLeft >= 0; triesLeft--) {
			try {
				await this._sendDnloadRequest(payload, 0);
				break;
			} catch (error) {
				if (triesLeft === 0 || !(error instanceof UsbStallError)) {
					throw new Error('Error during special DfuSe command ' + commandNames[command] + ':' + error);
				}
				this._log.trace('dfuse error, retrying', error);

				await new Promise(resolve => setTimeout(resolve, 1000));

			}
		}

		const status = await this._pollUntil(state => (state !== DfuDeviceState.dfuDNBUSY));
		if (status.status !== DfuDeviceStatus.OK) {
			throw new Error('Special DfuSe command failed');
		}
	}

	/**
	 * Get the memory segment that contains the given address.
	 *
	 * @param {number} addr - The address to find the corresponding memory segment.
	 * @return {object|null} - The memory segment containing the address, or null if not found.
	 */
	_getSegment(addr) {
		if (!this._memoryInfo || !this._memoryInfo.segments) {
			throw new Error('No memory map information available');
		}

		for (const segment of this._memoryInfo.segments) {
			if (segment.start <= addr && addr < segment.end) {
				return segment;
			}
		}

		return null;
	}

	/**
	 * Get the start address of the sector containing the given address.
	 *
	 * @param {number} addr - The address to find the corresponding sector start address.
	 * @param {object} segment - Optional. The memory segment containing the address. If not provided, it will be looked up.
	 * @return {number} - The start address of the sector.
	 */
	_getSectorStart(addr, segment) {
		if (typeof segment === 'undefined') {
			segment = this._getSegment(addr);
		}

		if (!segment) {
			throw new Error(`Address ${addr.toString(16)} outside of memory map`);
		}

		const sectorIndex = Math.floor((addr - segment.start) / segment.sectorSize);
		return segment.start + sectorIndex * segment.sectorSize;
	}

	/**
	 * Get the end address of the sector containing the given address.
	 *
	 * @param {number} addr - The address to find the corresponding sector end address.
	 * @param {object} segment - Optional. The memory segment containing the address. If not provided, it will be looked up.
	 * @return {number} - The end address of the sector.
	 */
	_getSectorEnd(addr, segment) {
		if (typeof segment === 'undefined') {
			segment = this._getSegment(addr);
		}

		if (!segment) {
			throw new Error(`Address ${addr.toString(16)} outside of memory map`);
		}

		const sectorIndex = Math.floor((addr - segment.start) / segment.sectorSize);
		return segment.start + (sectorIndex + 1) * segment.sectorSize;
	}

	/**
	 * Erases the memory of the DFU device starting from the specified address and for the given length.
	 * This method erases memory sectors that are marked as erasable in the memory map.
	 *
	 * @param {number} startAddr The starting address of the memory range to be erased.
	 * @param {number} length The length of the memory range to be erased in bytes.
	 * @throws {Error} If the start address or the length is outside the memory map bounds, or if erasing fails.
	 */
	async _erase(startAddr, length, progress) {
		let segment = this._getSegment(startAddr);
		if (segment && !segment.erasable) {
			throw new DeviceProtectionError('Segment is not erasable');
		}
		let addr = this._getSectorStart(startAddr, segment);
		const endAddr = this._getSectorEnd(startAddr + length - 1);

		let bytesErased = 0;
		const bytesToErase = endAddr - addr;

		if (progress) {
			progress({ event: 'start-erase', bytes: bytesToErase });
		}
		while (addr < endAddr) {
			if (segment.end <= addr) {
				segment = this._getSegment(addr);
			}
			if (!segment.erasable) {
				// Skip over the non-erasable section
				bytesErased = Math.min(bytesErased + segment.end - addr, bytesToErase);
				if (progress) {
					// include a progress event for the skipped section to ensure total matches
					progress({ event: 'erased', bytes: segment.end - addr });
				}
				addr = segment.end;
				continue;
			}
			const sectorIndex = Math.floor((addr - segment.start) / segment.sectorSize);
			const sectorAddr = segment.start + sectorIndex * segment.sectorSize;
			this._log.trace(`Erasing ${segment.sectorSize}B at 0x${sectorAddr.toString(16)}`);
			await this._dfuseCommand(DfuseCommand.DFUSE_COMMAND_ERASE, sectorAddr);
			addr = sectorAddr + segment.sectorSize;
			bytesErased += segment.sectorSize;
			if (progress) {
				progress({ event: 'erased', bytes: segment.sectorSize });
			}
		}
	}

	async _getStringDescriptor(index) {
		// Read the size of the descriptor
		let d = await this._dev.transferIn({
			bmRequestType: 0x80, // Direction: device-to-host; type: standard; recipient: device
			bRequest: 0x06, // GET_DESCRIPTOR
			wValue: (0x03 /* STRING */ << 8) | (index & 0xff),
			wIndex: 0x0409, // English (US)
			wLength: 1
		});
		const len = d.readUInt8(0); // bLength
		// Read the descriptor
		d = await this._dev.transferIn({
			bmRequestType: 0x80, // Direction: device-to-host; type: standard; recipient: device
			bRequest: 0x06,
			wValue: (0x03 << 8) | (index & 0xff),
			wIndex: 0x0409,
			wLength: len
		});
		// Decode the UTF-16 data
		const utf16 = [];
		let offs = 2; // Skip bLength and bDescriptorType
		while (offs < d.length) {
			utf16.push(d.readUInt16LE(offs));
			offs += 2;
		}
		return String.fromCharCode(...utf16);
	}

	async _getConfigDescriptor(index) {
		// Read the total size of the descriptors
		const d = await this._dev.transferIn({
			bmRequestType: 0x80, // Direction: device-to-host; type: standard; recipient: device
			bRequest: 0x06, // GET_DESCRIPTOR
			wValue: (0x02 /* CONFIGURATION */ << 8) | (index & 0xff),
			wIndex: 0,
			wLength: 4
		});
		const len = d.readUInt16LE(2); // wTotalLength
		// Read the descriptors
		return await this._dev.transferIn({
			bmRequestType: 0x80, // Direction: device-to-host; type: standard; recipient: device
			bRequest: 0x06,
			wValue: (0x02 << 8) | (index & 0xff),
			wIndex: 0,
			wLength: len
		});
	}

	_parseConfigDescriptor(data) {
		// https://www.beyondlogic.org/usbnutshell/usb5.shtml#ConfigurationDescriptors
		if (data.length < 9) {
			throw new Error('Invalid descriptor size');
		}
		const type = data.readUInt8(1); // bDescriptorType
		if (type !== 0x02) { // CONFIGURATION
			throw new Error('Invalid descriptor type');
		}
		const desc = {
			interfaces: []
		};
		let curIface = null;
		let dfuExpected = false;
		let offs = 9;
		while (offs < data.length) {
			const len = data.readUInt8(offs); // bLength
			const type = data.readUInt8(offs + 1); // bDescriptorType
			// Only parse the interface descriptors for now
			switch (type) {
				case 0x04: { // INTERFACE
					const cls = data.readUInt8(offs + 5); // bInterfaceClass
					const subclass = data.readUInt8(offs + 6); // bInterfaceSubClass
					curIface = {
						bLength: len,
						bDescriptorType: type,
						bInterfaceNumber: data.readUInt8(offs + 2),
						bAlternateSetting: data.readUInt8(offs + 3),
						bNumEndpoints: data.readUInt8(offs + 4),
						bInterfaceClass: cls,
						bInterfaceSubClass: subclass,
						bInterfaceProtocol: data.readUInt8(offs + 7),
						iInterface: data.readUInt8(offs + 8)
					};
					desc.interfaces.push(curIface);
					dfuExpected = cls === 0xfe && subclass === 0x01; // 4.1.2 Run-Time DFU Interface Descriptor
					break;
				}
				case 0x21: { // DFU_FUNCTIONAL
					if (!dfuExpected) {
						throw new Error('Unexpected descriptor');
					}
					curIface.dfuFunctional = {
						bLength: len,
						bDescriptorType: type,
						bmAttributes: data.readUInt8(offs + 2),
						wDetachTimeOut: data.readUInt16LE(offs + 3),
						wTransferSize: data.readUInt16LE(offs + 5),
						bcdDFUVersion: data.readUInt16LE(offs + 7)
					};
					dfuExpected = false; // 4.1 Run-Time Descriptor Set
					break;
				}
			}
			offs += len;
		}
		return desc;
	}

	async doUpload({ startAddr, maxSize, progress }) {
		const segment = this._getSegment(startAddr);
		if (segment && !segment.readable) {
			throw new DeviceProtectionError('Segment is not readable');
		}

		const state = await this._getStatus();
		if (state.state !== DfuDeviceState.dfuIDLE) {
			await this._clearStatus(); // suggested by dfu-util
			await this.abortToIdle();
		}
		await this._dfuseCommand(DfuseCommand.DFUSE_COMMAND_SET_ADDRESS_POINTER, startAddr);
		await this.abortToIdle();

		// DfuSe encodes the read address based on the transfer size,
		// the block number - 2, and the SET_ADDRESS pointer.
		const data = await this._doUploadImpl(maxSize, 2, progress);
		return data;
	}

	async _doUploadImpl(maxSize = Infinity, firstBlock = 0, progress) {
		let transaction = firstBlock;
		const blocks = [];
		let bytesRead = 0;

		this._log.trace('Copying data from DFU device to browser');
		if (progress) {
			progress({ event: 'start-upload', bytes: maxSize });
		}

		let result;
		let bytesToRead;
		do {
			bytesToRead = Math.min(this._transferSize, maxSize - bytesRead);
			result = await this._sendUploadReqest(bytesToRead, transaction++);
			this._log.trace('Read ' + result.byteLength + ' bytes');
			if (result.byteLength > 0) {
				blocks.push(Buffer.from(result));
				bytesRead += result.byteLength;
			}
			if (progress) {
				progress({ event: 'uploaded', bytes: bytesRead });
			}
		} while ((bytesRead < maxSize) && (result.byteLength === bytesToRead));

		if (bytesRead === maxSize) {
			await this.abortToIdle();
		}

		this._log.trace(`Read ${bytesRead} bytes`);
		if (progress) {
			progress({ event: 'complete-upload', bytes: bytesRead });
		}

		return Buffer.concat(blocks);
	}

	async abortToIdle() {
		await this._sendAbortRequest();
		let state = await this._getStatus();
		if (state.state === DfuDeviceState.dfuERROR) {
			await this._clearStatus();
			state = await this._getStatus();
		}
		if (state.state !== DfuDeviceState.dfuIDLE) {
			throw new Error('Failed to return to idle state after abort: state ' + state.state);
		}
	}

	async _checkDfuseCommandSupported(cmd) {
		if (!this._supportedDfuseCommands.length) {
			await this._goIntoIdleState({ uploadIdle: true });
			const data = await this._sendUploadReqest(DEFAULT_TRANSFER_SIZE, 0 /* value */); // Get command
			this._supportedDfuseCommands = [...data];
		}
		if (!this._supportedDfuseCommands.includes(cmd)) {
			throw new UnsupportedDfuseCommandError('Unsupported DfuSe command');
		}
	}
}

module.exports = {
	DfuError,
	DfuRequestType,
	DfuDeviceStatus,
	DfuDeviceStatusMap,
	DfuDeviceState,
	DfuDeviceStateMap,
	DfuseCommand,
	DfuBmRequestType,
	DFU_STATUS_SIZE,
	Dfu
};
