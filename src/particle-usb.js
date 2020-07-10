import { DeviceType } from './device-type';
import { DeviceBase, getDevices as getUsbDevices, openDeviceById as openUsbDeviceById } from './device-base';
import { Device } from './device';
import { WifiDevice } from './wifi-device';
import { CellularDevice } from './cellular-device';
import { CloudDevice } from './cloud-device';
import { MeshDevice } from './mesh-device';
import { NetworkDevice } from './network-device';

export { DeviceType } from './device-type';
export { PollingPolicy } from './device-base';
export { FirmwareModule } from './device';
export { NetworkStatus } from './network-device';
export { WifiAntenna, WifiSecurity, WifiCipher, EapMethod } from './wifi-device';
export { CloudConnectionStatus, ServerProtocol } from './cloud-device';
export { Result } from './result';
export { DeviceError, NotFoundError, NotAllowedError, StateError, TimeoutError, MemoryError, ProtocolError, UsbError,
	InternalError, RequestError } from './error';
export { config } from './config';

export class Core extends DeviceBase {
}

export class Photon extends CloudDevice(WifiDevice(NetworkDevice(Device))) {
}

export class P1 extends CloudDevice(WifiDevice(NetworkDevice(Device))) {
}

export class Electron extends CloudDevice(CellularDevice(NetworkDevice(Device))) {
}

export class Argon extends CloudDevice(WifiDevice(MeshDevice(NetworkDevice(Device)))) {
}

export class Boron extends CloudDevice(CellularDevice(MeshDevice(NetworkDevice(Device)))) {
}

export class Xenon extends CloudDevice(MeshDevice(NetworkDevice(Device))) {
}

export class ArgonSom extends CloudDevice(WifiDevice(MeshDevice(NetworkDevice(Device)))) {
}

export class BoronSom extends CloudDevice(CellularDevice(MeshDevice(NetworkDevice(Device)))) {
}

export class XenonSom extends CloudDevice(MeshDevice(NetworkDevice(Device))) {
}

export class B5Som extends CloudDevice(CellularDevice(MeshDevice(NetworkDevice(Device)))) {
}

export class AssetTracker extends CloudDevice(CellularDevice(NetworkDevice(Device))) {
}

const DEVICE_PROTOTYPES = {
	[DeviceType.CORE]: Core.prototype,
	[DeviceType.PHOTON]: Photon.prototype,
	[DeviceType.P1]: P1.prototype,
	[DeviceType.ELECTRON]: Electron.prototype,
	[DeviceType.ARGON]: Argon.prototype,
	[DeviceType.BORON]: Boron.prototype,
	[DeviceType.XENON]: Xenon.prototype,
	[DeviceType.ARGON_SOM]: ArgonSom.prototype,
	[DeviceType.BORON_SOM]: BoronSom.prototype,
	[DeviceType.XENON_SOM]: XenonSom.prototype,
	[DeviceType.B5_SOM]: B5Som.prototype,
	[DeviceType.ASSET_TRACKER]: AssetTracker.prototype
};

function setDevicePrototype(dev) {
	const proto = DEVICE_PROTOTYPES[dev.type];
	if (!proto) {
		return dev;
	}
	return Object.setPrototypeOf(dev, proto);
}

export function getDevices(options) {
	return getUsbDevices(options).then(devs => devs.map(dev => setDevicePrototype(dev)));
}

export function openDeviceById(id, options) {
	return openUsbDeviceById(id, options).then(dev => setDevicePrototype(dev));
}
