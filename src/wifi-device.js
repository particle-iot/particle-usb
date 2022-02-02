const DeviceOSProtobuf = require('@particle/device-os-protobuf');
const { TimeoutError } = require('./error');

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
	 * Perform WiFi scan
	 *
	 * Supported platforms:
	 * - Gen 4: On P2 since Device OS 3.x
	 * - Gen 3: On Argon
	 *
	 * @return {Promise[Object]} - Each object in array has these properties: ssid, bssid, security, channel, rssi. See Network protobuf message from https://github.com/particle-iot/device-os-protobuf for more details.
	 */
	async scanWifiNetworks() {
		const replyObject = await this.sendProtobufRequest('wifi.ScanNetworksRequest');
		const networks = replyObject.networks.map((network) => {
			return {
				ssid: network.ssid || null, // can be blank for hidden networks
				bssid: network.bssid.toString('hex'), // convert buffer to hex string
				security: this._mapSecurityValueToString(network.security),
				channel: network.channel,
				rssi: network.rssi
			};
		});
		return networks;
	}

	// Internal helper that transforms int or undefined into a string
	// for security field from scanWifiNetworks
	_mapSecurityValueToString(value) {
		if (value === undefined) {
			return 'UNKNOWN';
		}
		const wifiSecurityEnum = DeviceOSProtobuf.getDefinition('wifi.Security').message;
		const firstMatchingKey = Object.keys(wifiSecurityEnum).find(key => wifiSecurityEnum[key] === value);
		if (firstMatchingKey === undefined) {
			return 'UNKNOWN';
		} else {
			return firstMatchingKey;
		}
	}

	/**
	 * Join a new WiFi network. Note, there is a bug in Device OS (sc-96270)
	 * where P2's don't do anything with bssid or security fields, when this bug is fixed the fields will become available on this method
	 *
	 * Supported platforms:
	 * - Gen 4: Supported on P2 since Device OS 3.x
	 * @param {string} ssid - SSID of Wifi Network
	 * @param {string} password - Password of Wifi network, pass null to no password
	 * @param {string} timeout - how long to wait before calling the network attempt a failure
	 * @returns {Promise<Object>} - {pass: true} on success, otherwise {pass: false, error: msg}
	 */
	async joinNewWifiNetwork({ ssid, password, timeout = 20000 }) {
		const returnThis = {};
		let replyObject;

		try {
			replyObject = await this.sendProtobufRequest('wifi.JoinNewNetworkRequest', {
				ssid: ssid,
				// Bug: P2s ignore these right now, so we don't pass them
				bssid: null,
				security: null,
				credentials: {
					type: 1,
					password: password
				},
			},
			{ timeout }
			);
		} catch (error) {
			if (error instanceof TimeoutError) {
				returnThis.pass = false;
				returnThis.error = `Request timed out, exceeded ${timeout}ms`;
				return returnThis;
			}
			throw error;
		}

		if (replyObject && replyObject.constructor && replyObject.constructor.name === 'JoinNewNetworkReply') {
			returnThis.pass = true;
		} else {
			returnThis.pass = false;
			returnThis.error = `Device did not return a valid reply. expected=JoinNewNetworkReply actual=${JSON.stringify(replyObject)}`;
		}
		return returnThis;
	}

	/**
	 * Clear Wifi networks
	 *
	 * @return {Boolean} - TODO
	 */
	async clearWifiNetworks() {
		return 'TODO';
	}
};

module.exports = {
	WifiDevice
};
