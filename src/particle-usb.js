import { DeviceType } from './device-type';
import { getDevices as getUsbDevices, openDeviceById as openUsbDeviceById } from './device-base';
import { Device } from './device';
import { WifiDevice } from './wifi-device';

export { DeviceType } from './device-type';
export { PollingPolicy } from './device-base';
export { Device, ServerProtocol } from './device';
export { WifiDevice, WifiAntenna, WifiSecurity, WifiCipher, EapMethod } from './wifi-device';
export { RequestResult } from './request-result';
export { DeviceError, NotFoundError, StateError, TimeoutError, MemoryError, ProtocolError, UsbError, InternalError,
    RequestError } from './error';
export { config } from './config';

export class Photon extends WifiDevice(Device) {
}

export class P1 extends WifiDevice(Device) {
}

const DEVICE_PROTOTYPES = {
  [DeviceType.PHOTON]: Photon.prototype,
  [DeviceType.P1]: P1.prototype
};

function setDevicePrototype(dev) {
  const proto = DEVICE_PROTOTYPES[dev.type];
  return Object.setPrototypeOf(dev, proto ? proto : Device.prototype);
}

export function getDevices(options) {
  return getUsbDevices(options).then(devs => devs.map(dev => setDevicePrototype(dev)));
}

export function openDeviceById(id, options) {
  return openUsbDeviceById(id, options).then(dev => setDevicePrototype(dev));
}
