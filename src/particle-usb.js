'use strict';
const { getDevices: getUsbDevices, openDeviceById: openUsbDeviceById, openNativeUsbDevice: openUsbNativeUsbDevice, requestDevice: requestUsbDevice } = require('./device-base');
const { PollingPolicy } = require('./device-base');
const { FirmwareModule, FirmwareModuleDisplayNames } = require('./device');
const { NetworkStatus } = require('./network-device');
const { WifiAntenna, WifiCipher, EapMethod, WifiSecurityEnum } = require('./wifi-device');
const { WifiSecurity } = require('./wifi-device-legacy');
const { CloudConnectionStatus, ServerProtocol } = require('./cloud-device');
const { Result } = require('./result');
const { DeviceError, NotFoundError, NotAllowedError, StateError, TimeoutError, MemoryError, ProtocolError, UsbError, InternalError, RequestError, DeviceProtectionError, UnsupportedDfuseCommandError } = require('./error');
const { config } = require('./config');
const { setDevicePrototype } = require('./set-device-prototype');
const { EdlDevice } = require('./edl-device');

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

/**
 * Prompt the user to grant access to a Particle USB device. (Web Browser only)
 * NOTE: This method must be called from a user gesture (click) in other case the browser will reject the call
 * @param {Object} [options] Options.
 * @param {Array<String>} [options.types] Device types (photon, boron, tracker, etc). By default,
 *        the user can pick a device of any platform supported by the library.
 * @param {Boolean} [options.includeDfu=true] Whether to include devices in DFU mode.
 * @return {Promise<Device>} The device the user has selected.
 * @throws {NotFoundError} The user dismissed the prompt without selecting a device.
 * @throws {NotAllowedError} Called outside of a browser environment.
 */
function requestDevice(options) {
	return requestUsbDevice(options).then(dev => setDevicePrototype(dev));
}

/**
 * Get devices in Qualcomm EDL mode.
 *
 * @return {Promise<Array<EdlDevice>>}
 */
function getEdlDevices() {
	return EdlDevice.getEdlDevices();
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
	UnsupportedDfuseCommandError,
	getDevices,
	openDeviceById,
	openNativeUsbDevice,
	getEdlDevices,
	requestDevice,
	config
};
