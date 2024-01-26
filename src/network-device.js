const { Request } = require('./request');
const { fromProtobufEnum } = require('./protobuf-util');
const { convertBufferToMacAddress } = require('./address-util.js');
const { globalOptions } = require('./config');
const proto = require('./protocol');
const { Address4, Address6 } = require('ip-address');
const { NotFoundError } = require('./error.js');

const DEFAULT_INTERFACE = 1;

/**
 * Network status.
 */
const NetworkStatus = fromProtobufEnum(proto.NetworkState, {
	DOWN: 'DOWN',
	UP: 'UP'
});

const InterfaceType = fromProtobufEnum(proto.InterfaceType, {
	INVALID : 'INVALID_INTERFACE_TYPE',
	LOOPBACK : 'LOOPBACK',
	THREAD : 'THREAD',
	ETHERNET : 'ETHERNET',
	WIFI : 'WIFI',
	PPP : 'PPP'
});

const InterfaceConfigurationSource = fromProtobufEnum(proto.InterfaceConfigurationSource, {
	NONE: 'NONE',
	DHCP: 'DHCP',
	STATIC: 'STATIC',
	SLAAC: 'SLAAC',
	DHCPV6: 'DHCPV6'
});

/**
* Converts a given interface IP address object with version into a dotted-decimal format.
*
* @param {object} ifaceAddr
* @param {string} version 'v4' or 'v6'
* @returns {string} address in dotted-decimal format
*/
function convertInterfaceAddress(ifaceAddr, version) {
	let res = null;
	let prefixLength = null;
	if (ifaceAddr && ifaceAddr.address && ifaceAddr.address[version]) {
		const addrObj = ifaceAddr.address[version];
		res = convertIPAddress(addrObj, version);
	}
	if (ifaceAddr && ifaceAddr.prefixLength) {
		prefixLength = ifaceAddr.prefixLength;
	}
	return res ? `${res}/${prefixLength}` : null;
}

/**
* Converts a given IP address object with version into a dotted-decimal address string.
*
* @param {object} addr addr.address sent as int32 for 'v4' and as a buffer for 'v6'
* @param {string} version 'v4' or 'v6'
* @returns {string} address in dotted-decimal format
*/
function convertIPAddress(addr, version) {
	if (addr && addr.address) {
		const val = addr.address;
		const res = version === 'v4' ? Address4.fromInteger(val) : Address6.fromByteArray(val);
		return res.address;
	}
	return null;
}

/**
 * Network device.
 *
 * This class is not meant to be instantiated directly. Use {@link getDevices} and
 * {@link openDeviceById} to create device instances.
 *
 * @mixin
 */
const NetworkDevice = base => class extends base {
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

	/**
	 * Gets the list of network interfaces
	 *
	 * Supported platforms:
	 * - Gen 3 (since Device OS 0.9.0)
	 * - Gen 2 (since Device OS 0.8.0)
	 *
	 * @param {Object} [options] Options.
	 * @param {Number} [options.timeout] Timeout (milliseconds).
	 * @return {Promise<Object>}
	 */
	async getNetworkInterfaceList({ timeout = globalOptions.requestTimeout } = {}) {
		const res = await this.sendRequest(Request.NETWORK_GET_INTERFACE_LIST, null, { timeout });
		return res.interfaces.map(entry => ({
			index: entry.index,
			name: entry.name,
			type: InterfaceType.fromProtobuf(entry.type)
		}));
	}

	/**
	 * Gets the network interface and its fields
	 *
	 * Supported platforms:
	 * - Gen 3 (since Device OS 0.9.0)
	 * - Gen 2 (since Device OS 0.8.0)
	 *
	 * @param {Object} [options] Options.
	 * @param {Number} [options.timeout] Timeout (milliseconds).
	 * @return {Promise<Object>}
	 */
	async getNetworkInterface({ index, timeout = globalOptions.requestTimeout } = {}) {
		const reply = await this.sendRequest(Request.NETWORK_GET_INTERFACE, { index, timeout });

		if (!reply.interface) {
			throw new NotFoundError();
		}

		const { index: ifaceIndex, name, type, ipv4Config, ipv6Config, hwAddress } = reply.interface;

		const result = {
			index: ifaceIndex,
			name,
			type: InterfaceType.fromProtobuf(type),
			hwAddress: convertBufferToMacAddress(hwAddress)
		};

		if (ipv4Config) {
			result.ipv4Config = {
				addresses: ipv4Config.addresses.map((addr) => convertInterfaceAddress(addr, 'v4')),
				gateway: convertIPAddress(ipv4Config.gateway, 'v4'),
				peer: convertIPAddress(ipv4Config.peer, 'v4'),
				dns: ipv4Config.dns.map((addr) => convertIPAddress(addr, 'v4')),
				source: InterfaceConfigurationSource.fromProtobuf(ipv4Config.source)
			};
		}

		if (ipv6Config) {
			result.ipv6Config = {
				addresses: ipv6Config.addresses.map((addr) => convertInterfaceAddress(addr, 'v6')),
				gateway: convertIPAddress(ipv6Config.gateway, 'v6'),
				dns: ipv6Config.dns.map((addr) => convertIPAddress(addr, 'v6')),
				source: InterfaceConfigurationSource.fromProtobuf(ipv6Config.source)
			};
		}

		return result;
	}
};

module.exports = {
	NetworkStatus,
	NetworkDevice
};
