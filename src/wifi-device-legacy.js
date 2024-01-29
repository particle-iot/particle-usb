/**
 * All of the functionality in this class is deprecated.
 * However, it can still be used on Paticle Photon devices running
 * Device OS systems firmware from 0.8.0 to pre 2.0.0.
 */
const { Request } = require('./request');
const { fromProtobufEnum, fromProtobufMessage, toProtobufMessage } = require('./protobuf-util');
const { definitions: proto } = require('@particle/device-os-protobuf');

/**
 * WiFi antenna types.
 */
const WifiAntenna = fromProtobufEnum(proto.WiFiAntenna, {
	INTERNAL: 'INTERNAL',
	EXTERNAL: 'EXTERNAL',
	AUTO: 'AUTO'
});

/**
 * WiFi security types.
 */
const WifiSecurity = fromProtobufEnum(proto.WiFiSecurityType, {
	NONE: 'UNSEC',
	WEP: 'WEP',
	WPA: 'WPA',
	WPA2: 'WPA2',
	WPA_ENTERPRISE: 'WPA_ENTERPRISE',
	WPA2_ENTERPRISE: 'WPA2_ENTERPRISE',
	UNKNOWN: 'UNKNOWN'
});

/**
 * WiFi cipher types.
 */
const WifiCipher = fromProtobufEnum(proto.WiFiSecurityCipher, {
	AES: 'AES',
	TKIP: 'TKIP',
	AES_TKIP: 'AES_TKIP'
});

/**
 * EAP methods.
 */
const EapMethod = fromProtobufEnum(proto.EapType, {
	TLS: 'TLS',
	PEAP: 'PEAP'
});

function bssidFromProtobuf(bssid) {
	return [...bssid].map(b => b.toString(16).padStart(2, '0')).join(':');
}

function bssidToProtobuf(bssid) {
	return Buffer.from(bssid.replace(/:/g, ''), 'hex');
}

const accessPointCommonProperties = ['ssid', 'channel', 'maxDataRate', 'rssi', 'password', 'innerIdentity',
	'outerIdentity', 'privateKey', 'clientCertificate', 'caCertificate'];

const accessPointFromProtobuf = fromProtobufMessage(proto.WiFiAccessPoint, accessPointCommonProperties, {
	bssid: bssidFromProtobuf,
	security: WifiSecurity.fromProtobuf,
	cipher: WifiCipher.fromProtobuf,
	eapType: {
		name: 'eapMethod',
		value: EapMethod.fromProtobuf
	}
});

const accessPointToProtobuf = toProtobufMessage(proto.WiFiAccessPoint, accessPointCommonProperties, {
	bssid: bssidToProtobuf,
	security: WifiSecurity.toProtobuf,
	cipher: WifiCipher.toProtobuf,
	eapMethod: {
		name: 'eapType',
		value: EapMethod.toProtobuf
	}
});

/**
 * Wi-Fi device.
 *
 * This class is not meant to be instantiated directly. Use {@link getDevices} and
 * {@link openDeviceById} to create device instances.
 *
 * @mixin
 */
const WifiDeviceLegacy = base => class extends base {
	/**
	 * Set the WiFi antenna to use.
	 *
	 * @deprecated This method is not guaranteed to work with recent versions of Device OS and it will
	 *             be removed in future versions of this library.
	 *
	 * Supported platforms:
	 * - Gen 2 (since Device OS 0.8.0, deprecated in 2.0.0)
	 *
	 * @param {String} antenna Antenna type.
	 * @return {Promise}
	 */
	setWifiAntenna(antenna) {
		return this.sendRequest(Request.WIFI_SET_ANTENNA, {
			antenna: WifiAntenna.toProtobuf(antenna)
		});
	}

	/**
	 * Get the currently used WiFi antenna.
	 *
	 * @deprecated This method is not guaranteed to work with recent versions of Device OS and it will
	 *             be removed in future versions of this library.
	 *
	 * Supported platforms:
	 * - Gen 2 (since Device OS 0.8.0, deprecated in 2.0.0)
	 *
	 * @return {Promise<String>}
	 */
	getWifiAntenna(/* antenna */) {
		return this.sendRequest(Request.WIFI_GET_ANTENNA).then(rep => {
			return WifiAntenna.fromProtobuf(rep.antenna);
		});
	}

	/**
	 * Perform the WiFi scan.
	 *
	 * @deprecated This method is not guaranteed to work with recent versions of Device OS and it will
	 *             be removed in future versions of this library.
	 *
	 * Supported platforms:
	 * - Gen 2 (since Device OS 0.8.0, deprecated in 2.0.0)
	 *
	 * @return {Promise<Array>}
	 */
	scanWifiNetworks() {
		return this.sendRequest(Request.WIFI_SCAN).then(rep => {
			if (!rep.list) {
				return [];
			}
			return rep.list.aps.map(ap => accessPointFromProtobuf(ap));
		});
	}

	/**
	 * Set the WiFi credentials.
	 *
	 * @deprecated This method is not guaranteed to work with recent versions of Device OS and it will
	 *             be removed in future versions of this library.
	 *
	 * Supported platforms:
	 * - Gen 2 (since Device OS 0.8.0, deprecated in 2.0.0)
	 *
	 * @param {Object} credentials Credentials.
	 * @return {Promise}
	 */
	setWifiCredentials(credentials) {
		return this.sendRequest(Request.WIFI_SET_CREDENTIALS, {
			ap: accessPointToProtobuf(credentials)
		});
	}

	/**
	 * Get the WiFi credentials.
	 *
	 * @deprecated This method is not guaranteed to work with recent versions of Device OS and it will
	 *             be removed in future versions of this library.
	 *
	 * Supported platforms:
	 * - Gen 2 (since Device OS 0.8.0, deprecated in 2.0.0)
	 *
	 * @return {Promise<Array>}
	 */
	getWifiCredentials() {
		return this.sendRequest(Request.WIFI_GET_CREDENTIALS).then(rep => {
			if (!rep.list) {
				return [];
			}
			return rep.list.aps.map(ap => accessPointFromProtobuf(ap));
		});
	}

	/**
	 * Clear the WiFi credentials.
	 *
	 * @deprecated This method is not guaranteed to work with recent versions of Device OS and it will
	 *             be removed in future versions of this library.
	 *
	 * Supported platforms:
	 * - Gen 2 (since Device OS 0.8.0, deprecated in 2.0.0)
	 *
	 * @return {Promise}
	 */
	clearWifiCredentials() {
		return this.sendRequest(Request.WIFI_CLEAR_CREDENTIALS);
	}
};

module.exports = {
	WifiAntenna,
	WifiSecurity,
	WifiCipher,
	EapMethod,
	WifiDeviceLegacy
};
