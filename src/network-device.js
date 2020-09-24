import { Request } from './request';
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
 * Network device.
 *
 * This class is not meant to be instantiated directly. Use {@link getDevices} and
 * {@link openDeviceById} to create device instances.
 *
 * @mixin
 */
export const NetworkDevice = base => class extends base {
	/**
	 * Get network status.
	 *
	 * @deprecated This method is not guaranteed to work with recent versions of Device OS and it will
	 *             be removed in future versions of this library.
	 *
	 * Supported platforms:
	 * - Gen 2 (since Device OS 0.8.0, deprecated in 2.0.0)
	 *
	 * @return {Promise<String>}
	 */
	getNetworkStatus() {
		return this.sendRequest(Request.NETWORK_GET_STATUS, {
			interface: DEFAULT_INTERFACE
		}).then(rep => NetworkStatus.fromProtobuf(rep.config.state));
	}

	/**
	 * Get network configuration.
	 *
	 * @deprecated This method is not guaranteed to work with recent versions of Device OS and it will
	 *             be removed in future versions of this library.
	 *
	 * Supported platforms:
	 * - Gen 2 (since Device OS 0.8.0, deprecated in 2.0.0)
	 *
	 * @return {Promise<Object>}
	 */
	getNetworkConfig() {
		return this.sendRequest(Request.NETWORK_GET_CONFIGURATION, { // TODO
			interface: DEFAULT_INTERFACE
		});
	}

	/**
	 * Set network configuration.
	 *
	 * @deprecated This method is not guaranteed to work with recent versions of Device OS and it will
	 *             be removed in future versions of this library.
	 *
	 * Supported platforms:
	 * - Gen 2 (since Device OS 0.8.0, deprecated in 2.0.0)
	 *
	 * @param {Object} config Network configuration.
	 * @return {Promise}
	 */
	setNetworkConfig(config) {
		return this.sendRequest(Request.NETWORK_SET_CONFIGURATION, config); // TODO
	}
};
