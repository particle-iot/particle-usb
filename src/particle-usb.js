const { getDevices: getUsbDevices, openDeviceById: openUsbDeviceById } = require('./device-base');
const { PLATFORMS } = require('./platforms');
const { Device } = require('./device');
const { WifiDevice } = require('./wifi-device');
const { CellularDevice } = require('./cellular-device');
const { CloudDevice } = require('./cloud-device');
const { Gen3Device } = require('./gen3-device');
const { NetworkDevice } = require('./network-device');
const { PollingPolicy } = require('./device-base');
const { FirmwareModule } = require('./device');
const { NetworkStatus } = require('./network-device');
const { WifiAntenna, WifiSecurity, WifiCipher, EapMethod } = require('./wifi-device');
const { CloudConnectionStatus, ServerProtocol } = require('./cloud-device');
const { Result } = require('./result');
const { DeviceError, NotFoundError, NotAllowedError, StateError, TimeoutError, MemoryError, ProtocolError, UsbError,
	InternalError, RequestError } = require('./error');
const { config } = require('./config');

// Create a class for each platform by mixing in different capabilities
const DEVICE_PROTOTYPES = PLATFORMS.reduce((prototypes, platform) => {
	let klass = class extends NetworkDevice(Device) {};
	if (platform.generation === 3) {
		klass = class extends Gen3Device(klass) {};
	}
	if (platform.features.includes('cellular')) {
		klass = class extends CellularDevice(klass) {};
	}
	if (platform.features.includes('wifi')) {
		klass = class extends WifiDevice(klass) {};
	}
	klass = class extends CloudDevice(klass) {};

	prototypes[platform.name] = klass.prototype;

	return prototypes;
}, {});

function setDevicePrototype(dev) {
	const proto = DEVICE_PROTOTYPES[dev.type];
	if (!proto) {
		return dev;
	}
	return Object.setPrototypeOf(dev, proto);
}

/**
 * Enumerate Particle USB devices attached to the host.
 *
 * @param {Object} options Options.
 * @param {Array<String>} [options.types] Device types (photon, boron, tracker, etc). By default, this
 *        function enumerates devices of all platforms supported by the library.
 * @param {Boolean} [options.includeDfu=true] Whether to include devices in DFU mode.
 * @return {Promise<Array<Device>>}
 */
function getDevices(options) {
	return getUsbDevices(options).then(devs => devs.map(dev => setDevicePrototype(dev)));
}

/**
 * Open a Particle USB device with the specified ID.
 *
 * @param {String} id Device ID.
 * @param {Object} [options] Options (see {@link DeviceBase#open}).
 * @return {Promise<Device>}
 */
function openDeviceById(id, options) {
	return openUsbDeviceById(id, options).then(dev => setDevicePrototype(dev));
}

module.exports = {
	PollingPolicy,
	FirmwareModule,
	NetworkStatus,
	WifiAntenna,
	WifiSecurity,
	WifiCipher,
	EapMethod,
	CloudConnectionStatus,
	ServerProtocol,
	Result,
	DeviceError,
	NotFoundError,
	NotAllowedError,
	StateError,
	TimeoutError,
	MemoryError,
	ProtocolError,
	UsbError,
	InternalError,
	RequestError,
	getDevices,
	openDeviceById,
	config
};
