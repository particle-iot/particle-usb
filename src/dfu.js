const { DeviceError } = require('./error');

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
	DFUSE_COMMAND_READ_UNPROTECT: 0x92
};

const DfuBmRequestType = {
	HOST_TO_DEVICE: 0x21,
	DEVICE_TO_HOST: 0xA1
};

const DFU_STATUS_SIZE = 6;
// FIXME:
const DEFAULT_INTERFACE = 0;
const DEFAULT_ALTERNATE = 0;

class Dfu {
	constructor(dev, logger) {
		this._dev = dev;
		this._log = logger;
		this._interface = DEFAULT_INTERFACE;
		this._alternate = DEFAULT_ALTERNATE;
		this._claimed = false;
		this.memoryInfo = null;
		this.transferSize = 0;
	}

	/**
	 * Open DFU interface.
	 *
	 * @return {Promise}
	 */
	async open() {
		await this._dev.claimInterface(this._interface);
		await this._dev.setAltSetting(this._interface, this._alternate);
		this._claimed = true;
	}

	async getInterfaces() {
		// loop through all alt settings for dfu until we get an error
		const interfaces = {};
		for (let altSettingIdx = this._alternate; ; altSettingIdx++) {
			try {
				await this._dev.setAltSetting(this._interface, altSettingIdx);
				const res = this._dev._dev.interface(0);
				// get the transfer size for the extra buffer that starts with 09 21
				let transferSize = 0;
				const bufferData = res.descriptor.extra;
				if (bufferData[0] === 0x09 && bufferData[1] === 0x21) {
					transferSize = bufferData.readUint16LE(5);
				}

				interfaces[altSettingIdx] = {
					name: await this._dev.getDescriptorString(res.descriptor.iInterface),
					transferSize: transferSize
				};
			} catch (err) {
				// ignore the error - this means we got past all the alt settings
				break;
			}
		}
		// set it back to the original alt setting
		await this._dev.setAltSetting(this._interface, this._alternate);
		return interfaces;
	}

	async setAltInterface(intrfaceIdx) {
		await this._dev.setAltSetting(this._interface, intrfaceIdx);
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
		await this._goIntoDfuIdleOrDfuDnloadIdle();

		// FIXME: _sendDnloadRequest changed
		await this._sendDnloadRequest(0, 2);

		await this.poll_until(
			state => (state === DfuDeviceState.dfuMANIFEST || state === DfuDeviceState.dfuDNLOAD_IDLE));
	}

	async _goIntoDfuIdleOrDfuDnloadIdle() {
		try {
			const state = await this._getStatus();
			if (state.state === DfuDeviceState.dfuERROR) {
				// If we are in dfuERROR state, simply issue DFU_CLRSTATUS and we'll go into dfuIDLE
				await this._clearStatus();
			}

			if (state.state !== DfuDeviceState.dfuIDLE && state.state !== DfuDeviceState.dfuDNLOAD_IDLE) {
				// If we are in some kind of an unknown state, issue DFU_CLRSTATUS, which may fail,
				// but the device will go into dfuERROR state, so a subsequent DFU_CLRSTATUS will get us
				// into dfuIDLE
				await this._clearStatus();
			}
		} catch (err) {
			// DFU_GETSTATUS or DFU_CLRSTATUS failed, we are most likely in dfuERROR state, clear it
			await this._clearStatus();
		}

		// Confirm we are in dfuIDLE or dfuDNLOAD_IDLE
		const state = await this._getStatus();
		if (state.state !== DfuDeviceState.dfuIDLE && state.state !== DfuDeviceState.dfuDNLOAD_IDLE) {
			throw new DfuError('Invalid state');
		}
		return state;
	}

	async _sendDnloadRequest(req, wValue) {
		const setup = {
			bmRequestType: DfuBmRequestType.HOST_TO_DEVICE,
			bRequest: DfuRequestType.DFU_DNLOAD,
			wIndex: this._interface,
			wValue: wValue
		};
		return this._dev.transferOut(setup, req);
	}

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
		bStatusWithPollTimeout &= ~(0xff);
		const bState = data.readUInt8(4);

		if (bStatus < 0 || bStatus > 255 || !bState) {
			throw new DfuError('Could not parse DFU result or state');
		}

		return {
			status: bStatus,
			pollTimeout: bStatusWithPollTimeout,
			state: bState
		};
	}

	async poll_until(statePredicate) {
		let dfuStatus = await this._getStatus();

		function asyncSleep(durationMs) {
			return new Promise((resolve) => {
				console.log('Sleeping for ' + durationMs + 'ms');
				setTimeout(resolve, durationMs);
			});
		}

		while (!statePredicate(dfuStatus.state) && dfuStatus.state !== DfuDeviceState.dfuERROR) {
			await asyncSleep(dfuStatus.pollTimeout);
			dfuStatus = await this._getStatus();
		}

		return dfuStatus;
	}

	poll_until_idle() {
		return this.poll_until(state => (state === DfuDeviceState.dfuDNLOAD_IDLE));
	}

	async _clearStatus() {
		const setup = {
			bmRequestType: DfuBmRequestType.HOST_TO_DEVICE,
			bRequest: DfuRequestType.DFU_CLRSTATUS,
			wIndex: this._interface,
			wValue: 0
		};
		return this._dev.transferOut(setup, Buffer.alloc(0));
	}

	parseMemoryDescriptor(desc) {
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

	async dfuseCommand(command, param, len) { // TODO: add test
		if (typeof param === 'undefined' && typeof len === 'undefined') {
			param = 0x00;
			len = 1;
		}

		const commandNames = {
			0x00: 'GET_COMMANDS',
			0x21: 'SET_ADDRESS',
			0x41: 'ERASE_SECTOR'
		};

		const payload = Buffer.alloc(5);
		payload[0] = command;
		payload[1] = param & 0xff;
		payload[2] = (param >> 8) & 0xff;
		payload[3] = (param >> 16) & 0xff;
		payload[4] = (param >> 24) & 0xff;

		for (let triesLeft = 4; triesLeft >= 0; triesLeft--) {
			try {
				await this._sendDnloadRequest(payload, 0);
				break;
			} catch (error) {
				if (triesLeft === 0 || error !== 'stall') {
					throw new Error('Error during special DfuSe command ' + commandNames[command] + ':' + error);
				}
				console.log('dfuse error, retrying', error);

				await new Promise(resolve => setTimeout(resolve, 1000));

			}
		}

		const status = await this.poll_until(state => (state !== DfuDeviceState.dfuDNBUSY));
		if (status.status !== DfuDeviceStatus.OK) {
			throw new Error('Special DfuSe command failed');
		}
	}

	getSegment(addr) {
		if (!this.memoryInfo || !this.memoryInfo.segments) {
			throw new Error('No memory map information available');
		}

		for (const segment of this.memoryInfo.segments) {
			if (segment.start <= addr && addr < segment.end) {
				return segment;
			}
		}

		return null;
	}

	getSectorStart(addr, segment) {
		if (typeof segment === 'undefined') {
			segment = this.getSegment(addr);
		}

		if (!segment) {
			throw new Error(`Address ${addr.toString(16)} outside of memory map`);
		}

		const sectorIndex = Math.floor((addr - segment.start) / segment.sectorSize);
		return segment.start + sectorIndex * segment.sectorSize;
	}

	getSectorEnd(addr, segment) {
		if (typeof segment === 'undefined') {
			segment = this.getSegment(addr);
		}

		if (!segment) {
			throw new Error(`Address ${addr.toString(16)} outside of memory map`);
		}

		const sectorIndex = Math.floor((addr - segment.start) / segment.sectorSize);
		return segment.start + (sectorIndex + 1) * segment.sectorSize;
	}

	getFirstWritableSegment() {
		if (!this.memoryInfo || !this.memoryInfo.segments) {
			throw new Error('No memory map information available');
		}

		for (const segment of this.memoryInfo.segments) {
			if (segment.writable) {
				return segment;
			}
		}

		return null;
	}

	getMaxReadSize(startAddr) {
		if (!this.memoryInfo || !this.memoryInfo.segments) {
			throw new Error('No memory map information available');
		}

		let numBytes = 0;
		for (const segment of this.memoryInfo.segments) {
			if (segment.start <= startAddr && startAddr < segment.end) {
				// Found the first segment the read starts in
				if (segment.readable) {
					numBytes += segment.end - startAddr;
				} else {
					return 0;
				}
			} else if (segment.start === startAddr + numBytes) {
				// Include a contiguous segment
				if (segment.readable) {
					numBytes += (segment.end - segment.start);
				} else {
					break;
				}
			}
		}

		return numBytes;
	}

	async erase(startAddr, length) {
		let segment = this.getSegment(startAddr);
		let addr = this.getSectorStart(startAddr, segment);
		const endAddr = this.getSectorEnd(startAddr + length - 1);

		let bytesErased = 0;
		const bytesToErase = endAddr - addr;
		if (bytesToErase > 0) {
			console.log(bytesErased, bytesToErase, 'erase');
		}

		while (addr < endAddr) {
			if (segment.end <= addr) {
				segment = this.getSegment(addr);
			}
			if (!segment.erasable) {
				// Skip over the non-erasable section
				// misleading comment?
				bytesErased = Math.min(bytesErased + segment.end - addr, bytesToErase);
				addr = segment.end;
				console.log(bytesErased, bytesToErase, 'erase');
				continue;
			}
			const sectorIndex = Math.floor((addr - segment.start) / segment.sectorSize);
			const sectorAddr = segment.start + sectorIndex * segment.sectorSize;
			console.log(`Erasing ${segment.sectorSize}B at 0x${sectorAddr.toString(16)}`);
			await this.dfuseCommand(DfuseCommand.DFUSE_COMMAND_ERASE, sectorAddr, 4);
			addr = sectorAddr + segment.sectorSize;
			bytesErased += segment.sectorSize;
			console.log(bytesErased, bytesToErase, 'erase');
		}
	}

	async setIfaceForDfu(ifaceIdx) {
		if (!this.memoryInfo || !this.memoryInfo.segments) {
			const intrfaces = await this.getInterfaces();
			this.transferSize = this._getTransferSizeFromIfaces(intrfaces);
			await this.setAltInterface(ifaceIdx);
			this._setMemoryInfo(intrfaces[ifaceIdx].name);
		}
	}

	_getTransferSizeFromIfaces(ifaces) {
	// Each interface has a transferSize property, get the first one with a value
		for (const iface in ifaces) {
			if (ifaces[iface].transferSize) {
				return ifaces[iface].transferSize;
			}
		}
	}

	_setMemoryInfo(desc) {
		this.memoryInfo = this.parseMemoryDescriptor(desc);
	}

	async do_download(startAddr, data, options) {
		if (!this.memoryInfo || !this.memoryInfo.segments) {
			throw new Error('No memory map available');
		}

		let startAddress = startAddr;
		if (isNaN(startAddress)) {
			startAddress = this.memoryInfo.segments[0].start;
			console.log('Using inferred start address 0x' + startAddress.toString(16));
		} else if (this.getSegment(startAddress) === null) {
			console.log(`Start address 0x${startAddress.toString(16)} outside of memory map bounds`);
		}
		const expectedSize = data.byteLength;

		if (!options.noErase) {
			console.log('Erasing DFU device memory');
			await this.erase(startAddress, expectedSize);
		}

		console.log('Copying binary data to DFU device startAddress=' + startAddress + ' total_expected_size=' + expectedSize);

		let bytesSent = 0;
		let address = startAddress;
		while (bytesSent < expectedSize) {
			const bytesLeft = expectedSize - bytesSent;
			const chunkSize = Math.min(bytesLeft, this.transferSize);

			let bytesWritten = 0;
			let dfuStatus;
			try {
				await this.dfuseCommand(DfuseCommand.DFUSE_COMMAND_SET_ADDRESS_POINTER, address, 4);
				console.log(`Set address to 0x${address.toString(16)}`);
				bytesWritten = await this._sendDnloadRequest(data.slice(bytesSent, bytesSent + chunkSize), 2);
				dfuStatus = await this.poll_until_idle(DfuDeviceState.dfuDNLOAD_SYNC);
				console.log('Sent ' + bytesWritten + ' bytes');
				dfuStatus = await this._goIntoDfuIdleOrDfuDnloadIdle();
				address += chunkSize;
			} catch (error) {
				throw new Error('Error during DfuSe download: ' + error);
			}

			if (dfuStatus.status !== DfuDeviceStatus.OK) {
				throw new Error(`DFU DOWNLOAD failed state=${dfuStatus.state}, status=${dfuStatus.status}`);
			}

			console.log('Wrote ' + bytesWritten + ' bytes');
			bytesSent += bytesWritten;

			console.log(bytesSent, expectedSize, 'program');
		}
		console.log(`Wrote ${bytesSent} bytes`);

		if (options.doManifestation) {
			console.log('Manifesting new firmware');
			await this._goIntoDfuIdleOrDfuDnloadIdle();
			try {
				await this.dfuseCommand(DfuseCommand.DFUSE_COMMAND_SET_ADDRESS_POINTER, startAddress, 4);
				await this.leave();
			} catch (error) {
				throw new Error('Error during Dfu manifestation: ' + error);
			}
		}
	}

	// async do_upload(memoryInfo, startAddr, max_size) {
	//     let startAddress = startAddr;
	//     if (isNaN(startAddress)) {
	//         startAddress = memoryInfo.segments[0].start;
	//         console.log("Using inferred start address 0x" + startAddress.toString(16));
	//     } else if (this.getSegment(memoryInfo, startAddress) === null) {
	//         console.log(`Start address 0x${startAddress.toString(16)} outside of memory map bounds`);
	//     }
	//
	//     console.log(`Reading up to 0x${max_size.toString(16)} bytes starting at 0x${startAddress.toString(16)}`);
	//     let state = await this.getState();
	//     if (state != DfuDeviceState.dfuIDLE) {
	//         await this.abortToIdle();
	//     }
	//     await this.dfuseCommand(DfuseCommand.DFUSE_COMMAND_SET_ADDRESS_POINTER, startAddress, 4);
	//     await this.abortToIdle();
	//
	//     // DfuSe encodes the read address based on the transfer size,
	//     // the block number - 2, and the SET_ADDRESS pointer.
	//     return await dfu.Device.prototype.do_upload.call(this, this.transferSize, max_size, 2);
	// }
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
