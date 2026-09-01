'use strict';
const { UsbError, UsbStallError, NotFoundError } = require('./error');

// Maximum size of a control transfer's data stage
const MAX_CONTROL_TRANSFER_DATA_SIZE = 4096;

function bmRequestTypeToString(type) {
	type = (type >> 5) & 0x03;
	switch (type) {
		case 0: {
			return 'standard';
		}
		case 1: {
			return 'class';
		}
		case 2: {
			return 'vendor';
		}
		default: {
			return 'unknown';
		}
	}
}

function bmRequestTypeToRecipientString(type) {
	type = type & 0x0f;
	switch (type) {
		case 0: {
			return 'device';
		}
		case 1: {
			return 'interface';
		}
		case 2: {
			return 'endpoint';
		}
		case 3:
		default: {
			return 'other';
		}
	}
}

class UsbDevice {
	constructor(dev) {
		this._dev = dev;
		this._dev.timeout = 5000; // Use longer timeout for control transfers
		this._quirks = {};
	}

	async open() {
		try {
			await this._dev.open();
		} catch (err) {
			throw new UsbError('Unable to open USB device', { cause: err });
		}
	}

	async close() {
		try {
			await this._dev.close();
		} catch (err) {
			throw new UsbError('Unable to close USB device', { cause: err });
		}
	}
	async transferIn(setup) {
		let res;
		try {
			res = await this._dev.controlTransferIn({
				requestType: bmRequestTypeToString(setup.bmRequestType),
				recipient: bmRequestTypeToRecipientString(setup.bmRequestType),
				request: setup.bRequest,
				value: setup.wValue,
				index: setup.wIndex
			}, setup.wLength);
		} catch (err) {
			throw new UsbError('IN control transfer failed', { cause: err });
		}
		if (res.status !== 'ok') {
			if (res.status === 'stall') {
				throw new UsbStallError('Transfer stalled');
			}
			throw new Error(`Status: ${res.status}`);
		}
		return Buffer.from(res.data.buffer);
	}

	async transferOut(setup, data) {
		let res;
		try {
			if (!data && this._quirks.controlOutTransfersRequireDataStage) {
				data = Buffer.alloc(1);
			}
			res = await this._dev.controlTransferOut({
				requestType: bmRequestTypeToString(setup.bmRequestType),
				recipient: bmRequestTypeToRecipientString(setup.bmRequestType),
				request: setup.bRequest,
				value: setup.wValue,
				index: setup.wIndex
			}, data); // data is optional
		} catch (err) {
			throw new UsbError('OUT control transfer failed', { cause: err });
		}
		if (res.status !== 'ok') {
			if (res.status === 'stall') {
				throw new UsbStallError('Transfer stalled');
			}
			throw new Error(`Status: ${res.status}`);
		}
	}

	async claimInterface(intrface) {
		try {
			await this._dev.claimInterface(intrface);
		} catch (err) {
			throw new UsbError('Failed to claim interface', { cause: err });
		}
	}

	async releaseInterface(intrface) {
		try {
			await this._dev.releaseInterface(intrface);
		} catch (err) {
			throw new UsbError('Failed to release interface', { cause: err });
		}
	}

	async setAltSetting(intrface, setting) {
		try {
			await this._dev.selectAlternateInterface(intrface, setting);
		} catch (err) {
			throw new UsbError('Failed to set alt setting', { cause: err });
		}
	}

	get vendorId() {
		return this._dev.vendorId;
	}

	get productId() {
		return this._dev.productId;
	}

	get productName() {
		return this._dev.productName;
	}

	get serialNumber() {
		return this._dev.serialNumber;
	}

	get isOpen() {
		return this._dev.opened;
	}

	get internalObject() {
		return this._dev;
	}

	get quirks() {
		return this._quirks;
	}

	set quirks(qs) {
		this._quirks = qs;
	}
}

function validateFilters(filters) {
	if (!filters) {
		return [];
	}
	// Validate filtering options
	filters.forEach(f => {
		if (f.productId && !f.vendorId) {
			throw new RangeError('Vendor ID is missing');
		}
	});
	return filters;
}

function matchesFilters(dev, filters) {
	return filters.length === 0 || filters.some(f => ((!f.vendorId || dev.vendorId === f.vendorId) &&
			(!f.productId || dev.productId === f.productId) &&
			(!f.serialNumber || dev.serialNumber === f.serialNumber)));
}

// Set prompt to false to enumerate only the devices the user has already granted access to
async function getUsbDevices(filters, { prompt = true } = {}) {
	filters = validateFilters(filters);
	let devs = [];
	try {
		devs = await navigator.usb.getDevices();
		devs = devs.filter(dev => matchesFilters(dev, filters));
		if (prompt) {
			let newDev = null;
			try {
				newDev = await navigator.usb.requestDevice({ filters });
			} catch (e) {
				// Ignore NotFoundError which means that the user has cancelled the request
				if (e.name !== 'NotFoundError') {
					throw e;
				}
			}
			if (newDev) {
				// Avoid listing the same device twice
				const hasNewDev = devs.some(dev => dev.vendorId === newDev.vendorId && dev.productId === newDev.productId &&
						dev.serialNumber === newDev.serialNumber);
				if (!hasNewDev) {
					devs.push(newDev);
				}
			}
		}
	} catch (err) {
		throw new UsbError('Unable to enumerate USB devices', { cause: err });
	}
	return devs.map(dev => new UsbDevice(dev));
}

async function requestUsbDevice(filters){
	try {
		const dev = await navigator.usb.requestDevice({ filters });
		return new UsbDevice(dev);
	} catch (err) {
		if (err.name === 'NotFoundError') {
			throw new NotFoundError('No device selected', { cause: err });
		}
		throw new UsbError('Unable to request a USB device', { cause: err });
	}
}


module.exports = {
	MAX_CONTROL_TRANSFER_DATA_SIZE,
	UsbDevice,
	getUsbDevices,
	requestUsbDevice
};
