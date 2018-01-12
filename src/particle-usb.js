import { DeviceType } from './device-type';
import { DeviceBase, getDevices as getUsbDevices, openDeviceById as openUsbDeviceById } from './device-base';
import { Device } from './device';
import { WifiDevice } from './wifi-device';
import { CellularDevice } from './cellular-device';
import { CloudDevice } from './cloud-device';

export { DeviceType } from './device-type';
export { PollingPolicy } from './device-base';
export { FirmwareModule } from './device';
export { NetworkStatus } from './network-device';
export { WifiAntenna, WifiSecurity, WifiCipher, EapMethod } from './wifi-device';
export { ServerProtocol } from './cloud-device';
export { RequestResult } from './request-result';
export { DeviceError, NotFoundError, StateError, TimeoutError, MemoryError, ProtocolError, UsbError, InternalError,
    RequestError } from './error';
export { config } from './config';

export class Core extends DeviceBase {
}

export class Photon extends CloudDevice(WifiDevice(Device)) {
}

export class P1 extends CloudDevice(WifiDevice(Device)) {
}

export class Electron extends CloudDevice(CellularDevice(Device)) {
}

export class Duo extends CloudDevice(WifiDevice(Device)) {
}

const DEVICE_PROTOTYPES = {
  [DeviceType.CORE]: Core.prototype,
  [DeviceType.PHOTON]: Photon.prototype,
  [DeviceType.P1]: P1.prototype,
  [DeviceType.ELECTRON]: Electron.prototype,
  [DeviceType.DUO]: Duo.prototype
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
