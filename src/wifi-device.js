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
	 * Perform WiFi scan for Gen 3+ devices
	 * @param {Object} options See sendControlRequest(), same options are here.
	 * @return {Promise[Object]} - Each object in array has these properties: ssid, bssid, security, channel, rssi. See Network protobuf message from https://github.com/particle-iot/device-os-protobuf for more details.
	 */
	async scanWifiNetworks(options) {
		const result = await this._sendAndHandleProtobufRequest(
			'wifi.ScanNetworksRequest',
			{},
			options
		);

		let returnThis;
		if (result.pass) {
			returnThis = result.replyObject.networks.map((network) => {
				return {
					ssid: network.ssid || null, // can be blank for hidden networks
					bssid: network.bssid.toString('hex'), // convert buffer to hex string
					security: this._mapSecurityValueToString(network.security),
					channel: network.channel,
					rssi: network.rssi
				};
			});
		} else {
			returnThis = [];
		}
		return returnThis;
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
	 * Join a new WiFi network for Gen 3+ devices.
	 *
	 * Note, there are known bugs with this method/Device OS:
	 *   - sc-96270: where P2's don't do anything with bssid or security fields; so cannot connect to hidden networks
	 *   - sc-96826: Connecting to open network without passsword does not work
	 *
	 * Supported platforms:
	 * - Gen 4: Supported on P2 since Device OS 3.x
	 * @param {string} ssid - SSID of Wifi Network
	 * @param {string} password - Password of Wifi network, if not set will not use security
	 * @param {Object} options See sendControlRequest(), same options are here.
	 * @return {ProtobufInteraction} -
	 */
	async joinNewWifiNetwork({ ssid, password = null }, options) {
		let dataPayload;
		if (password === null) {
			dataPayload = {
				ssid,
				bssid: null,
				security: 0 // Security.NO_SECURITY
			};
			throw new Error('joinNewWifiNetwork() does not currently support connecting to networks without a password/security, sc-TODO');
		} else {
			dataPayload = {
				ssid,
				bssid: null,
				security: null,
				credentials: {
					type: 1, // CredentialsType.PASSWORD
					password
				},
			};
		}
		return await this._sendAndHandleProtobufRequest(
			'wifi.JoinNewNetworkRequest',
			dataPayload,
			options
		);
	}

	/**
	 * Clear Wifi networks for Gen 3+ devices
	 *
	 * @param {Object} options See sendControlRequest(), same options are here.
	 * @return {ProtobufInteraction} -
	 */

	async clearWifiNetworks(options) {
		return await this._sendAndHandleProtobufRequest(
			'wifi.ClearKnownNetworksRequest',
			{},
			options
		);
	}

	/**
	 * Returned by _sendAndHandleProtobufRequest
	 * @typedef {Object} ProtobufInteraction
	 * @property {boolean} pass - Indicates whether the request/reply succeeded
	 * @property {undefined|*} replyObject - An instance created via the protobuf replyMessage constructor
	 * @property {undefined|string} error - If pass is false, will be a string explaining failure reason
	 */

	/**
	 * Wraps .sendProtobufRequest, handles validation and error handling in opinionated way
	 * to DRY up code in higher level methods
	 *
	 * @private could conceivably be added to public api in device.js later.
	 *
	 * @param {String} protobufMessageName - name of protobuf message see DeviceOSProtobuf.getDefinitions() to possible values
	 * @param {Object} protobufMessageData - An object of key/values to encode into the protobuf message
	 * @param {Object} options See sendControlRequest(), same options are here.
	 * @return {ProtobufInteraction} - Summary of request/reply object
	 * @throws {*} - Throws errors considered abnormal, catches TimeoutError which is considered normal type of
	 *               failure/did-not-suceed for many Device OS requests
	 */
	async _sendAndHandleProtobufRequest(protobufMessageName, protobufMessageData = {}, options) {
		const protobufDefinition = DeviceOSProtobuf.getDefinition(protobufMessageName);
		const returnThis = {};

		let replyObject;
		try {
			replyObject = await this.sendProtobufRequest(
				protobufMessageName,
				protobufMessageData,
				options
			);
		} catch (error) {
			if (error instanceof TimeoutError) {
				returnThis.pass = false;
				if (options && options.timeout) {
					returnThis.error = `Request timed out, exceeded ${options.timeout}ms`;
				} else {
					returnThis.error = `Request timed out, exceeded default timeout`;
				}
				return returnThis;
			}
			throw error;
		}

		// Example:
		//   replyObject.constructor.name might be 'JoinNewNetworkReply'
		//   for a protobufMessageName to 'wifi.JoinNewNetworkRequest'
		if (replyObject && replyObject.constructor &&
			replyObject.constructor.name === protobufDefinition.replyMessage.name) {
			returnThis.pass = true;
			returnThis.replyObject = replyObject;
		} else {
			returnThis.pass = false;
			returnThis.error = `Device did not return a valid reply. expected=${protobufDefinition.replyMessage.name} actual=${JSON.stringify(replyObject)}`;
		}
		return returnThis;
	}
};

module.exports = {
	WifiDevice
};
