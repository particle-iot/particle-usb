const { getDevices: getUsbDevices, openDeviceById: openUsbDeviceById, openNativeUsbDevice: openUsbNativeUsbDevice } = require('./device-base');
const { PollingPolicy } = require('./device-base');
const { FirmwareModule, FirmwareModuleDisplayNames } = require('./device');
const { NetworkStatus } = require('./network-device');
const { WifiAntenna, WifiCipher, EapMethod, WifiSecurityEnum } = require('./wifi-device');
const { WifiSecurity } = require('./wifi-device-legacy');
const { CloudConnectionStatus, ServerProtocol } = require('./cloud-device');
const { Result } = require('./result');
const { DeviceError, NotFoundError, NotAllowedError, StateError, TimeoutError, MemoryError, ProtocolError, UsbError, InternalError, RequestError, DeviceProtectionError } = require('./error');
const { config } = require('./config');
const { setDevicePrototype } = require('./set-device-prototype');

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

/**
 * Open a Particle USB device from a native browser or node USB device handle
 *
 * @param {Object} nativeUsbDevice A WebUSB (browser) or node-usb USB device
 * @param {Object} [options] Options (see {@link DeviceBase#open}).
 * @return {Promise<Device>}
 */
function openNativeUsbDevice(nativeUsbDevice, options) {
	return openUsbNativeUsbDevice(nativeUsbDevice, options).then(dev => setDevicePrototype(dev));
}

module.exports = {
	PollingPolicy,
	FirmwareModule,
	FirmwareModuleDisplayNames,
	NetworkStatus,
	WifiAntenna,
	WifiSecurity,
	WifiSecurityEnum,
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
	DeviceProtectionError,
	getDevices,
	openDeviceById,
	openNativeUsbDevice,
	config
};
