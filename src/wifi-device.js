'use strict';
const DeviceOSProtobuf = require('@particle/device-os-protobuf');
const { definitions: proto } = require('@particle/device-os-protobuf');
const { fromProtobufEnum } = require('./protobuf-util');
const { convertBufferToMacAddress } = require('./address-util');

/**
 * Wi-Fi security types.
 *
 * @enum {String}
 */
const WiFiSecurity = fromProtobufEnum(proto.wifi.Security, {
	NONE : 'NO_SECURITY',
	WEP : 'WEP',
	WPA_PSK : 'WPA_PSK',
	WPA2_PSK : 'WPA2_PSK',
	WPA_WPA2_PSK : 'WPA_WPA2_PSK',
	WPA3_PSK : 'WPA3_PSK',
	WPA2_WPA3_PSK : 'WPA2_WPA3_PSK',
});

/**
 * Wi-Fi device.
 *
 * This class is not meant to be instantiated directly. Use {@link getDevices} and
 * {@link openDeviceById} to create device instances.
 *
 * @mixin
 */
const WifiDevice = base => class extends base {
	/**
	 * Perform WiFi scan for Gen 3+ devices
	 *
	 * Supported platforms:
	 * - Gen 3
	 * - Gen 4
	 *
	 * @param {Object} options See sendControlRequest(), same options are here.
	 * @return {Promise[Object]} - Each object in array has these properties: ssid, bssid, security, channel, rssi. See Network protobuf message from https://github.com/particle-iot/device-os-protobuf for more details.
	 */
	async scanWifiNetworks(options) {
		const result = await this.sendProtobufRequest(
			'wifi.ScanNetworksRequest',
			{},
			options
		);

		return result.networks.map((network) => {
			return {
				ssid: network.ssid || null, // can be blank for hidden networks
				bssid: convertBufferToMacAddress(network.bssid), // convert buffer to hex string
				security: WiFiSecurity.fromProtobuf(network.security),
				channel: network.channel,
				rssi: network.rssi
			};
		});
	}

	/**
	 * Join a new WiFi network for Gen 3+ devices.
	 *
	 * Warning: May not work for hidden networks due to certain bugs in the device-os.
	 *
	 * Supported platforms:
	 * - Gen 3
	 * - Gen 4
	 *
	 * @param {string} ssid - SSID of Wifi Network
	 * @param {string} security - Security of Wifi network
	 * @param {string} password - Password of Wifi network, if not set will not use security
	 * @param {Object} options See sendControlRequest(), same options are here.
	 * @return {ProtobufInteraction} - empty response
	 */
	async joinNewWifiNetwork({ ssid, security, password = null, hidden }, options) {
		let dataPayload;
		if (password === null) {
			dataPayload = {
				ssid,
				bssid: null,
				security: 0 // Security.NO_SECURITY
			};
		} else {
			dataPayload = {
				ssid,
				bssid: null,
				hidden: hidden === true,
				security: security ? WiFiSecurity.toProtobuf(security) : null,
				credentials: {
					type: 1, // CredentialsType.PASSWORD
					password
				},
			};
		}
		return await this.sendProtobufRequest(
			'wifi.JoinNewNetworkRequest',
			dataPayload,
			options
		);
	}

	/**
	 * Join a known WiFi network for Gen 3+ devices.
	 *
	 * Supported platforms:
	 * - Gen 3
	 * - Gen 4
	 *
	 * @param {string} ssid - SSID of Wifi Network
	 * @param {Object} options See sendControlRequest(), same options are here.
	 * @return {ProtobufInteraction} - empty response
	 */
	async joinKnownWifiNetwork({ ssid }, options) {
		return await this.sendProtobufRequest(
			'wifi.JoinKnownNetworkRequest',
			{ ssid },
			options
		);
	}

	/**
	 * Gets the list of networks for Gen 3+ devices.
	 *
	 * Supported platforms:
	 * - Gen 3
	 * - Gen 4
	 *
	 * @param {Object} options See sendControlRequest(), same options are here.
	 * @return {ProtobufInteraction} - An array of known networks (ssid, security, credentialsType). See GetKnownNetworksReply from https://github.com/particle-iot/device-os-protobuf/blob/main/control/wifi_new.proto
	 */
	async listWifiNetworks(options) {
		return await this.sendProtobufRequest(
			'wifi.GetKnownNetworksRequest',
			options
		);
	}

	/**
	 * Removes a Wi-Fi network
	 *
	 * Supported platforms:
	 * - Gen 3
	 * - Gen 4
	 *
	 * @param {string} ssid - SSID of Wifi Network
	 * @param {Object} options See sendControlRequest(), same options are here.
	 * @return {ProtobufInteraction} - empty response
	 */
	async removeWifiNetwork({ ssid }, options) {
		const dataPayload = {
			ssid
		};
		return await this.sendProtobufRequest(
			'wifi.RemoveKnownNetworkRequest',
			dataPayload,
			options
		);
	}

	/**
	 * Gets the currently connected Wi-Fi network for Gen 3+ devices.
	 *
	 * Supported platforms:
	 * - Gen 3
	 * - Gen 4
	 *
	 * @param {Object} options See sendControlRequest(), same options are here.
	 * @return {Promise[Object]} - ssid, bssid, channel, rssi. See GetCurrentNetworkReply from https://github.com/particle-iot/device-os-protobuf/blob/main/control/wifi_new.proto
	 */
	async getCurrentWifiNetwork(options) {
		const res = await this.sendProtobufRequest(
			'wifi.GetCurrentNetworkRequest',
			{},
			options
		);
		const bssidStr = convertBufferToMacAddress(res.bssid);
		res.bssid = bssidStr;
		return res;
	}

	/**
	 * Set a new WiFi network for Gen 3+ devices.
	 *
	 * Supported platforms:
	 * - Gen 4: Supported on P2 since Device OS 5.8.2
	 *
	 * @param {string} ssid - SSID of Wifi Network
	 * @param {string} security - Security of Wifi network
	 * @param {string} password - Password of Wifi network, if not set will not use security
	 * @param {Object} options See sendControlRequest(), same options are here.
	 * @return {ProtobufInteraction} - empty response
	 */
	async setWifiCredentials({ ssid, security, password = null, hidden }, options) {
		let dataPayload;
		if (password === null) {
			dataPayload = {
				ssid,
				bssid: null,
				security: 0 // Security.NO_SECURITY
			};
		} else {
			dataPayload = {
				ssid,
				bssid: null,
				hidden: hidden === true,
				security : security ? WiFiSecurity.toProtobuf(security) : null,
				credentials: {
					type: 1, // CredentialsType.PASSWORD
					password
				},
			};
		}
		return await this.sendProtobufRequest(
			'wifi.SetNetworkCredentialsRequest',
			dataPayload,
			options
		);
	}

	/**
	 * Clear Wifi networks for Gen 3+ devices
	 *
	 * @param {Object} options See sendControlRequest(), same options are here.
	 * @return {ProtobufInteraction} - empty response
	 */

	async clearWifiNetworks(options) {
		return await this.sendProtobufRequest(
			'wifi.ClearKnownNetworksRequest',
			{},
			options
		);
	}


};

const WifiSecurityEnum = DeviceOSProtobuf.getDefinition('wifi.Security').message;

module.exports = {
	WifiDevice,
	WifiSecurityEnum
};
