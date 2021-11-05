import { getDevices as getUsbDevices, openDeviceById as openUsbDeviceById } from './device-base';
import { PLATFORMS } from './platforms';
import { Device } from './device';
import { WifiDevice } from './wifi-device';
import { CellularDevice } from './cellular-device';
import { CloudDevice } from './cloud-device';
import { NetworkDevice } from './network-device';

export { PollingPolicy } from './device-base';
export { FirmwareModule } from './device';
export { NetworkStatus } from './network-device';
export { WifiAntenna, WifiSecurity, WifiCipher, EapMethod } from './wifi-device';
export { CloudConnectionStatus, ServerProtocol } from './cloud-device';
export { Result } from './result';
export { DeviceError, NotFoundError, NotAllowedError, StateError, TimeoutError, MemoryError, ProtocolError, UsbError,
	InternalError, RequestError } from './error';
export { config } from './config';

// Create a class for each platform by mixing in different capabilities
const DEVICE_PROTOTYPES = PLATFORMS.reduce((prototypes, platform) => {
	let klass = class extends NetworkDevice(Device) {};
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
export function getDevices(options) {
	return getUsbDevices(options).then(devs => devs.map(dev => setDevicePrototype(dev)));
}

/**
 * Open a Particle USB device with the specified ID.
 *
 * @param {String} id Device ID.
 * @param {Object} [options] Options (see {@link DeviceBase#open}).
 * @return {Promise<Device>}
 */
export function openDeviceById(id, options) {
	return openUsbDeviceById(id, options).then(dev => setDevicePrototype(dev));
}
