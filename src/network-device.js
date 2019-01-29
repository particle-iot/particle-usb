import { RequestType } from './request-type';
import { fromProtobufEnum } from './protobuf-util';

import proto from './protocol';

const DEFAULT_INTERFACE = 1;

/**
 * Network status.
 */
export const NetworkStatus = fromProtobufEnum(proto.NetworkState, {
  DOWN: 'DOWN',
  UP: 'UP'
});

/**
 * Mixin class for a network device.
 */
export const NetworkDevice = base => class extends base {
  /**
   * Get network status.
   *
   * @return {Promise<String>}
   */
  getNetworkStatus() {
    return this.sendRequest(RequestType.NETWORK_GET_STATUS, {
      interface: DEFAULT_INTERFACE
    }).then(rep => NetworkStatus.fromProtobuf(rep.config.state));
  }

  /**
   * Get network configuration.
   *
   * @return {Promise<Object>}
   */
  getNetworkConfig() {
    return this.sendRequest(RequestType.NETWORK_GET_CONFIGURATION, { // TODO
      interface: DEFAULT_INTERFACE
    });
  }

  /**
   * Set network configuration.
   *
   * @param {Object} config Network configuration.
   * @return {Promise}
   */
  setNetworkConfig(config) {
    return this.sendRequest(RequestType.NETWORK_SET_CONFIGURATION, config); // TODO
  }
}
