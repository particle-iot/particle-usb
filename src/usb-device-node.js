const { UsbError, NotAllowedError } = require('./error');
const { globalOptions } = require('./config');

let usb = null;

try {
	usb = require('usb');
} catch (err) {
	// Ignore USB initialization errors when running in the Travis environment
	if (!process.env.TRAVIS) {
		throw err;
	}
}

// Maximum size of a control transfer's data stage
const MAX_CONTROL_TRANSFER_DATA_SIZE = 4096;

function wrapUsbError(err, message) {
	if (err.message === 'LIBUSB_ERROR_ACCESS') {
		return new NotAllowedError(message, { cause: err });
	}
	return new UsbError(message, { cause: err });
}

class UsbDevice {
	constructor(dev) {
		this._dev = dev;
		this._dev.timeout = 5000; // Use longer timeout for control transfers
		this._log = globalOptions.log;
		// node-usb doesn't provide a way to check if a device is open, so we're storing the state in
		// an additional property of the node-usb device object. Device objects are cached, so this
		// property persists between calls to getDeviceList()
		if (!this._dev.particle) {
			this._dev.particle = {
				isOpen: false,
				serialNumber: null
			};
		}
		this._quirks = {};
	}

	open() {
		return new Promise((resolve, reject) => {
			try {
				this._dev.open();
			} catch (err) {
				return reject(wrapUsbError(err, 'Unable to open USB device'));
			}
			// Get serial number string
			const descr = this._dev.deviceDescriptor;
			this._dev.getStringDescriptor(descr.iSerialNumber, (err, serialNum) => {
				if (err) {
					try {
						this._dev.close();
					} catch (err) {
						this._log.error(`Unable to close device: ${err.message}`);
						// Ignore error
					}
					return reject(wrapUsbError(err, 'Unable to get serial number descriptor'));
				}
				this._dev.particle.serialNumber = serialNum;
				this._dev.particle.isOpen = true;
				resolve();
			});
		});
	}

	close() {
		return new Promise((resolve, reject) => {
			try {
				this._dev.close();
				this._dev.particle.isOpen = false;
			} catch (err) {
				return reject(wrapUsbError(err, 'Unable to close USB device'));
			}
			resolve();
		});
	}

	transferIn(setup) {
		return new Promise((resolve, reject) => {
			this._dev.controlTransfer(setup.bmRequestType, setup.bRequest, setup.wValue, setup.wIndex, setup.wLength,
				(err, data) => {
					if (err) {
						return reject(wrapUsbError(err, 'IN control transfer failed'));
					}
					resolve(data);
				});
		});
	}

	transferOut(setup, reqData) {
		return new Promise((resolve, reject) => {
			if (!reqData) {
				// NOTE: this is a quirk of some USB device-side implementations
				// where zero-length (no data stage) OUT control requests are not
				// completed and cause a timeout.
				// The workaround is always including a data stage.
				if (!this._quirks.controlOutTransfersRequireDataStage) {
					reqData = Buffer.alloc(0);
				} else {
					reqData = Buffer.alloc(1);
				}
			}
			this._dev.controlTransfer(
				setup.bmRequestType,
				setup.bRequest,
				setup.wValue,
				setup.wIndex,
				reqData, (err, bytes) => {
					if (err) {
						return reject(wrapUsbError(err, 'OUT control transfer failed'));
					}
					resolve(bytes);
				});
		});
	}

	getDescriptorString(intrface) {
		return new Promise((resolve, reject) => {
			this._dev.getStringDescriptor(intrface, (err, intrfaceName) => {
				if (err) {
					this._log.error(`Unable to get interface name: ${err.message}`);
					return reject(wrapUsbError(err, 'Unable to get interface name'));
				}
				resolve(intrfaceName);
			});
		});
	}

	claimInterface(intrface) {
		return new Promise((resolve, reject) => {
			try {
				const iface = this._dev.interface(intrface);
				if (!iface) {
					return reject(new UsbError('Unknown interface'));
				}
				iface.claim();
			} catch (err) {
				return reject(wrapUsbError(err, 'Failed to claim interface'));
			}
			resolve();
		});
	}

	releaseInterface(intrface) {
		return new Promise((resolve, reject) => {
			try {
				const iface = this._dev.interface(intrface);
				if (!iface) {
					return reject(new UsbError('Unknown interface'));
				}
				iface.release(err => {
					if (err) {
						return reject(wrapUsbError(err, 'Failed to release interface'));
					}
					resolve();
				});
			} catch (err) {
				return reject(wrapUsbError(err, 'Unknown interface'));
			}
		});
	}

	setAltSetting(intrface, setting) {
		return new Promise((resolve, reject) => {
			try {
				const iface = this._dev.interface(intrface);
				if (!iface) {
					return reject(new UsbError('Unknown interface'));
				}
				iface.setAltSetting(setting, err => {
					if (err) {
						return reject(wrapUsbError(err, 'Failed to set alt setting'));
					}
					resolve();
				});
			} catch (err) {
				return reject(wrapUsbError(err, 'Unknown interface'));
			}
		});
	}

	getInterfaceInfo(intrface) {
		return this._dev.interface();
	}

	get vendorId() {
		return this._dev.deviceDescriptor.idVendor;
	}

	get productId() {
		return this._dev.deviceDescriptor.idProduct;
	}

	get serialNumber() {
		return this._dev.particle.serialNumber;
	}

	get isOpen() {
		return this._dev.particle.isOpen;
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
	// Validate the filtering options
	if (filters) {
		filters = filters.map(f => {
			if (f.productId && !f.vendorId) {
				throw new RangeError('Vendor ID is missing');
			}
			if (f.serialNumber) {
				// Filtering by serial number works in a case-insensitive manner. This is not necessarily
				// true for other backends
				f = Object.assign({}, f);
				f.serialNumber = f.serialNumber.toLowerCase();
			}
			return f;
		});
	} else {
		filters = [];
	}
	let devs = null;
	try {
		devs = usb.getDeviceList().map(dev => new UsbDevice(dev));
	} catch (err) {
		throw wrapUsbError(err, 'Unable to enumerate USB devices');
	}
	if (filters.length > 0) {
		// Filter the list of devices
		const filtDevs = [];
		for (const dev of devs) {
			let serialNum = null;
			for (const f of filters) {
				if (f.vendorId && dev.vendorId !== f.vendorId) {
					continue;
				}
				if (f.productId && dev.productId !== f.productId) {
					continue;
				}
				if (f.serialNumber) {
					if (!serialNum) {
						// Open the device and get its serial number
						const wasOpen = dev.isOpen;
						if (!wasOpen) {
							await dev.open();
						}
						serialNum = dev.serialNumber.toLowerCase();
						// Don't close the device if it was opened elsewhere
						if (!wasOpen) {
							await dev.close();
						}
					}
					if (serialNum !== f.serialNumber) {
						continue;
					}
				}
				filtDevs.push(dev);
				break;
			}
		}
		devs = filtDevs;
	}
	return devs;
}

module.exports = {
	MAX_CONTROL_TRANSFER_DATA_SIZE,
	UsbDevice,
	getUsbDevices
};
