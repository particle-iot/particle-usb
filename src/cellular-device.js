import { NetworkDevice } from './network-device';

/**
 * Mixin class for a cellular network device.
 */
export const CellularDevice = Base => class extends NetworkDevice(Base) {
}
