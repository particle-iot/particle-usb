const { PLATFORMS } = require('./platforms');
const { Device } = require('./device');
const { WifiDevice } = require('./wifi-device');
const { WifiDeviceLegacy } = require('./wifi-device-legacy');
const { CellularDevice } = require('./cellular-device');
const { CloudDevice } = require('./cloud-device');
const { Gen3Device } = require('./gen3-device');
const { NetworkDevice } = require('./network-device');

/**
 * This constant has a structure like this:
//   photon: klass {},
//   electron: klass {},
//   p2: klass {},
//   ...
// }
 */
const DEVICE_PROTOTYPES = PLATFORMS.reduce((prototypes, platform) => {
	let klass = class extends NetworkDevice(Device) {};
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

	prototypes[platform.name] = klass.prototype;

	return prototypes;
}, {});

/**
 * Determines the the class and inheritance hierarchy
 * of a Particle USB device based on it's platform characteristics *
 * @param {*} usbDevice - An object with a .type field that is a string like "p1", "argon", "p2", etc
 * 						  representing the short name of the device platform.
 * @returns {*} an instance of a class like WifiDevice, CellularDevice with the correct inheritance hierachy
 */
function setDevicePrototype(usbDevice) {
	const proto = DEVICE_PROTOTYPES[usbDevice.type];
	if (!proto) {
		return usbDevice;
	}
	return Object.setPrototypeOf(usbDevice, proto);
}

module.exports = {
	setDevicePrototype
};
