const { Request } = require('./request');
const { fromProtobufEnum } = require('./protobuf-util');
const { convertBufferToMacAddress } = require('./address-util.js');
const { globalOptions } = require('./config');
const { definitions: proto } = require('@particle/device-os-protobuf');
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

const InterfaceFlag = fromProtobufEnum(proto.InterfaceFlag, {
	NONE: 'IFF_NONE',
	UP: 'IFF_UP',
	BROADCAST: 'IFF_BROADCAST',
	DEBUG: 'IFF_DEBUG',
	LOOPBACK: 'IFF_LOOPBACK',
	POINTOPOINT: 'IFF_POINTTOPOINT',
	RUNNING : 'IFF_RUNNING',
	LOWER_UP : 'IFF_LOWER_UP',
	NOARP : 'IFF_NOARP',
	PROMISC : 'IFF_PROMISC',
	ALLMULTI : 'IFF_ALLMULTI',
	MULTICAST : 'IFF_MULTICAST',
	NOND6 : 'IFF_NOND6'
});

/**
* Converts a given interface IP address into a string
*
* @param {object} ifaceAddr Object with address and prefixLength keys
* @returns {string} address in ${ip}/${prefixLength} format
*/
function convertInterfaceAddress(ifaceAddr) {
	if (!ifaceAddr || !ifaceAddr.address) {
		return ifaceAddr;
	}

	const ip = convertIpv4Address(ifaceAddr.address.v4) || convertIpv6Address(ifaceAddr.address.v6);
	return `${ip}/${ifaceAddr.prefixLength}`;
}

/**
 * Converts an IPv4 to a string
 *
 * @param {object} addr Object with the IP encoded as int32 in the address key
 * @returns {string} address in dotted-decimal format
 */
function convertIpv4Address(addr) {
	if (!addr) {
		return addr;
	}

	return Address4.fromInteger(addr.address).address;
}

/**
 * Converts an IPv6 to a string
 *
 * @param {object} addr Object with the IP encoded as a buffer in the address key
 * @returns {string} address in colon-separated format
 */
function convertIpv6Address(addr) {
	if (!addr) {
		return addr;
	}

	return Address6.fromByteArray(addr.address).address;
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

	// Helper function to get active flags of a network interface
	_getActiveFlags(flags, flagDefinitions) {
		const activeFlags = [];
		for (const [key, value] of Object.entries(flagDefinitions)) {
			if (value !== 0 && (flags & value)) {
				activeFlags.push(value);
			}
		}
		return activeFlags;
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

		const {
			index: ifaceIndex,
			name,
			type,
			flags,
			extFlags,
			ipv4Config,
			ipv6Config,
			hwAddress,
			mtu,
			metric,
			profile
		} = reply.interface;

		const activeFlags = this._getActiveFlags(flags, proto.InterfaceFlag);
		const flagsStrings = activeFlags.map(flag => InterfaceFlag.fromProtobuf(flag));
		
		const result = {
			index: ifaceIndex,
			name,
			type: InterfaceType.fromProtobuf(type),
			hwAddress: convertBufferToMacAddress(hwAddress),
			mtu,
			flagsVal: flags,
			extFlags,
			flagsStrings,
			metric,
			profile
		};

		if (ipv4Config) {
			result.ipv4Config = {
				addresses: ipv4Config.addresses.map(convertInterfaceAddress),
				gateway: convertIpv4Address(ipv4Config.gateway),
				peer: convertIpv4Address(ipv4Config.peer),
				dns: ipv4Config.dns.map(convertIpv4Address),
				source: InterfaceConfigurationSource.fromProtobuf(ipv4Config.source)
			};
		}

		if (ipv6Config) {
			result.ipv6Config = {
				addresses: ipv6Config.addresses.map(convertInterfaceAddress),
				gateway: convertIpv6Address(ipv6Config.gateway),
				dns: ipv6Config.dns.map(convertIpv6Address),
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
