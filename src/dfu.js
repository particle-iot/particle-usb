const { DeviceError } = require('./error');

// webDfu's dfu.js layer

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
	}

	/**
	 * Open DFU interface.
	 *
	 * @return {Promise}
	 */
	async open() { // this open === webdfu/dfu.js open
		await this._dev.claimInterface(this._interface);
		await this._dev.setAltSetting(this._interface, this._alternate);
		// check device-constants - may be that's why it's always set to 0.

		// console.log('Dumping dev interface 0', this._dev._dev.interface(0));
		// await this._dev.setAltSetting(this._interface, altSettingIdx);
		// // await this._dev.getStringDescriptor();
		// console.log('Dumping dev interface 0', this._dev._dev.interface(0));
		// 1. first check .interfaces. see if it's only size == 1
		// this is weird behavior blah - do a forced loop
			// iterate 0,1... until we get an error
		this._claimed = true;
	}

	async claimInterfaceImpl(intrface) {
		console.log('claiming interface', intrface);
		await this._dev.claimInterface(intrface);
		await this._dev.setAltSetting(intrface, 0);
		this._claimed = true;
	}

	async relInterfaceImpl(intrface) {
		console.log('release interface', intrface);
		await this._dev.releaseInterface(this._interface);
	}

	async getInterfaces() {
		let altSettingIdx = this._alternate;
		// loop through all alt settings for dfu and come out if you have an error
		const interfaces = {};
		while(true) {
			try {
				await this._dev.setAltSetting(this._interface, altSettingIdx);
				const res = this._dev._dev.interface(0);
				let transferSize = 0;
				// get the transfer size for 09 21 buffer
				const bufferData = res.descriptor.extra;
				if (bufferData[0] == 0x09 && bufferData[1] == 0x21) {
					transferSize = bufferData.readUint16LE(5);
				}
				interfaces[altSettingIdx] = {};
				interfaces[altSettingIdx].name = await this._dev.getStringDescriptorA(res.descriptor.iInterface);;
				interfaces[altSettingIdx].transferSize = transferSize;
				altSettingIdx++;
			} catch (err) {
				// ignore the error - this means we got past all the alt settings
				break;
			}
		}
		await this._dev.setAltSetting(this._interface, this._alternate);
		return interfaces;
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

		await this._sendDnloadRequest({
			// Dummy non-zero block number
			blockNum: 1
			// No data
		});

		// Check if the leave command was executed without an error
		const state = await this._getStatus();
		if (state.state !== 'dfuMANIFEST') {
			// This is a workaround for Gen 2 DFU implementation where in order to please dfu-util
			// for some reason we are going off-standard and instead of reporting the actual dfuMANIFEST state
			// report dfuDNLOAD_IDLE :|
			if (state.status === 'OK' && state.state !== 'dfuDNLOAD_IDLE') {
				throw new DfuError('Invalid DFU state');
			}
		}

		// After this, the device will go into dfuMANIFSET_WAIT_RESET state
		// and eventually should reset
	}

	async _goIntoDfuIdleOrDfuDnloadIdle() {
		try {
			const state = await this._getStatus();
			if (state.state === 'dfuERROR') {
				// If we are in dfuERROR state, simply issue DFU_CLRSTATUS and we'll go into dfuIDLE
				await this._clearStatus();
			}

			if (state.state !== 'dfuIDLE' && state.state !== 'dfuDNLOAD_IDLE') {
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
		if (state.state !== 'dfuIDLE' && state.state !== 'dfuDNLOAD_IDLE') {
			throw new DfuError('Invalid state');
		}
		return state;
	}

	async _sendEraseReq(req) {
		const state = await this._getStatus();
		console.log('DfuState: ', state);
		if ((!req.cmd || req.cmd === DfuseCommand.DFUSE_COMMAND_NONE)) {
			// Send data
			const setup = {
				bmRequestType: DfuBmRequestType.HOST_TO_DEVICE,
				bRequest: DfuRequestType.DFU_DNLOAD,
				wIndex: this._interface,
				wValue: this._alternate
			};
			return this._dev.transferOut(setup, req.data ? req.data : Buffer.alloc(0));
		}

		throw new DfuError('Unknown DFU_DNLOAD command');
	}

	async _sendDnloadRequest(req, wValue) {	// requestOut
		const setup = {
			bmRequestType: DfuBmRequestType.HOST_TO_DEVICE,
			bRequest: DfuRequestType.DFU_DNLOAD,
			wIndex: this._interface,
			wValue: wValue
		};
		return this._dev.transferOut(setup, req ? req : Buffer.alloc(0));
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
		const bStatus = DfuDeviceStatusMap[(bStatusWithPollTimeout & 0xff)];
		bStatusWithPollTimeout &= ~(0xff);
		const bState = DfuDeviceStateMap[data.readUInt8(4)];

		if (!bStatus || !bState) {
			throw new DfuError('Could not parse DFU result or state');
		}

		return {
			status: bStatus,
			pollTimeout: bStatusWithPollTimeout,
			state: bState
		};
	}

	async poll_until(state_predicate) {
        let dfu_status = await this._getStatus();

        function async_sleep(duration_ms) {
            return new Promise(function(resolve, reject) {
                // console.log("Sleeping for " + duration_ms + "ms");
                setTimeout(resolve, duration_ms);
            });
        }

		// What does this do???
        while (!state_predicate(dfu_status.state) && dfu_status.state != 'dfuERROR') {
		// while(dfu_status.state != 'dfuERROR' && dfu_status.state != state_predicate) {
            await async_sleep(dfu_status.pollTimeout);
            dfu_status = await this._getStatus();
        }

        return dfu_status;
    }

    poll_until_idle(idle_state) {
        return this.poll_until(state => (state == 'dfuDNLOAD_IDLE'));
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
