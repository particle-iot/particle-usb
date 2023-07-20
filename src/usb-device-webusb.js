const { UsbError } = require('./error');

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
		try {
			const res = await this._dev.controlTransferIn({
				requestType: bmRequestTypeToString(setup.bmRequestType),
				recipient: bmRequestTypeToRecipientString(setup.bmRequestType),
				request: setup.bRequest,
				value: setup.wValue,
				index: setup.wIndex
			}, setup.wLength);
			return Buffer.from(res.data.buffer);
		} catch (err) {
			throw new UsbError('IN control transfer failed', { cause: err });
		}
	}

	async transferOut(setup, data) {
		try {
			if (!data && this._quirks.controlOutTransfersRequireDataStage) {
				data = Buffer.alloc(1);
			}
			await this._dev.controlTransferOut({
				requestType: bmRequestTypeToString(setup.bmRequestType),
				recipient: bmRequestTypeToRecipientString(setup.bmRequestType),
				request: setup.bRequest,
				value: setup.wValue,
				index: setup.wIndex
			}, data); // data is optional
		} catch (err) {
			throw new UsbError('OUT control transfer failed', { cause: err });
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

	getDescriptorString(intrface) {
		return new Promise((resolve) => {
			try {
				this._dev.getStringDescriptor(intrface, (err, intrfaceName) => {
					if (err) {
						try {
							this._dev.close();
						} catch (err) {
							console.log(`Unable to close device: ${err.message}`);
							// Ignore error
						}
						throw new Error('Unable to get serial number descriptor');
					}
					this._dev.particle.isOpen = true;
					resolve(intrfaceName);
				});
			} catch (err) {
				throw new Error('Failed to claim interface');
			}
		});
	}

	get vendorId() {
		return this._dev.vendorId;
	}

	get productId() {
		return this._dev.productId;
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

async function getUsbDevices(filters) {
	if (filters) {
		// Validate filtering options
		filters.forEach(f => {
			if (f.productId && !f.vendorId) {
				throw new RangeError('Vendor ID is missing');
			}
		});
	} else {
		filters = [];
	}
	let devs = [];
	try {
		// Fow now, always ask the user to grant access to the device, even if we already have a
		// permission to access it. The permissions API for USB is not yet implemented in Chrome,
		// and calling requestDevice() after getDevices() causes a SecurityError.
		// TODO: Implement a separate API to request a permission from the user
		let newDev = null;
		try {
			newDev = await navigator.usb.requestDevice({ filters });
		} catch (e) {
			// Ignore NotFoundError which means that the user has cancelled the request
			if (e.name !== 'NotFoundError') {
				throw e;
			}
		}
		// Get the list of known devices and filter them according to the provided options
		devs = await navigator.usb.getDevices();
		if (filters.length > 0) {
			devs = devs.filter(dev => filters.some(f => ((!f.vendorId || dev.vendorId === f.vendorId) &&
					(!f.productId || dev.productId === f.productId) &&
					(!f.serialNumber || dev.serialNumber === f.serialNumber))));
		}
		if (newDev) {
			// Avoid listing the same device twice
			const hasNewDev = devs.some(dev => dev.vendorId === newDev.vendorId && dev.productId === newDev.productId &&
					dev.serialNumber === newDev.serialNumber);
			if (!hasNewDev) {
				devs.push(newDev);
			}
		}
	} catch (err) {
		throw new UsbError('Unable to enumerate USB devices', { cause: err });
	}
	devs = devs.map(dev => new UsbDevice(dev));
	return devs;
}

module.exports = {
	MAX_CONTROL_TRANSFER_DATA_SIZE,
	UsbDevice,
	getUsbDevices
};
