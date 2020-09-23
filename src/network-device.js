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
 * @deprecated Methods provided by this class are not guaranteed to work with recent versions of
 *             Device OS and will be removed in future versions of this library.
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
	 * @param {Object} config Network configuration.
	 * @return {Promise}
	 */
	setNetworkConfig(config) {
		return this.sendRequest(Request.NETWORK_SET_CONFIGURATION, config); // TODO
	}
};
