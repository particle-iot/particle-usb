/* eslint new-cap: 'off' */
'use strict';
const { PLATFORMS } = require('./platforms');
const { Device } = require('./device');
const { WifiDevice } = require('./wifi-device');
const { WifiDeviceLegacy } = require('./wifi-device-legacy');
const { CellularDevice } = require('./cellular-device');
const { CloudDevice } = require('./cloud-device');
const { Gen3Device } = require('./gen3-device');
const { NetworkDevice } = require('./network-device');
const { DfuDevice } = require('./dfu-device');
const { LinuxDevice } = require('./linux-device');

/**
 * This constant has a structure like this:
//   photon: klass {},
//   electron: klass {},
//   p2: klass {},
//   ...
// }
 */
const DEVICE_CLASSES = PLATFORMS.reduce((classes, platform) => {
	let klass;
	if (platform.features.includes('linux')) {
		klass = LinuxDevice;
	} else {
		klass = class extends NetworkDevice(Device) {};
		if (platform.generation === 3) {
			klass = class extends Gen3Device(klass) {};
		}
		if (platform.features.includes('cellular')) {
			klass = class extends CellularDevice(klass) {};
		}
		if (platform.features.includes('wifi')) {
			if (platform.generation === 2 || platform.generation === 1) {
				klass = class extends WifiDeviceLegacy(klass) {};
			} else {
				klass = class extends WifiDevice(klass) {};
			}
		}
		klass = class extends CloudDevice(klass) {};
	}

	classes[platform.name] = klass;

	return classes;
}, {});



/**
 * Determines the the class and inheritance hierarchy
 * of a Particle USB device based on it's platform characteristics *
 * @param {*} usbDevice - An object with a .type field that is a string like "p1", "argon", "p2", etc
 * 						  representing the short name of the device platform.
 * @returns {*} an instance of a class like WifiDevice, CellularDevice with the correct inheritance hierachy
 */
function setDevicePrototype(usbDevice) {
	let klass = DEVICE_CLASSES[usbDevice.type];
	if (!klass) {
		return usbDevice;
	}
	// if usb device is in dfu mode, we could also add the prototype for the dfu device
	if (usbDevice.isInDfuMode) {
		klass = class extends DfuDevice(klass){};
		return Object.setPrototypeOf(usbDevice, klass.prototype);
	} else {
		return Object.setPrototypeOf(usbDevice, klass.prototype);
	}
}

module.exports = {
	setDevicePrototype
};
