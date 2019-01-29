import { NetworkDevice } from './network-device';
import { RequestType } from './request-type';
import { fromProtobufEnum, fromProtobufMessage, toProtobufMessage } from './protobuf-util';

import proto from './protocol';

/**
 * WiFi antenna types.
 */
export const WifiAntenna = fromProtobufEnum(proto.WiFiAntenna, {
  INTERNAL: 'INTERNAL',
  EXTERNAL: 'EXTERNAL',
  AUTO: 'AUTO'
});

/**
 * WiFi security types.
 */
export const WifiSecurity = fromProtobufEnum(proto.WiFiSecurityType, {
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
export const WifiCipher = fromProtobufEnum(proto.WiFiSecurityCipher, {
  AES: 'AES',
  TKIP: 'TKIP',
  AES_TKIP: 'AES_TKIP'
});

/**
 * EAP methods.
 */
export const EapMethod = fromProtobufEnum(proto.EapType, {
  TLS: 'TLS',
  PEAP: 'PEAP'
});

function bssidFromProtobuf(bssid) {
  return [...bssid].map(b => b.toString(16).padStart(2, '0')).join(':');
}

function bssidToProtobuf(bssid) {
  return Buffer.from(bssid.replace(/:/g, ''), 'hex');
}

const accessPointCommonProperties = [ 'ssid', 'channel', 'maxDataRate', 'rssi', 'password', 'innerIdentity',
    'outerIdentity', 'privateKey', 'clientCertificate', 'caCertificate' ];

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
 * Mixin class for a WiFi device.
 */
export const WifiDevice = base => class extends NetworkDevice(base) {
  /**
   * Set the WiFi antenna to use.
   *
   * @param {String} antenna Antenna type.
   * @return {Promise}
   */
  setWifiAntenna(antenna) {
    return this.sendRequest(RequestType.WIFI_SET_ANTENNA, {
      antenna: WifiAntenna.toProtobuf(antenna)
    });
  }

  /**
   * Get the currently used WiFi antenna.
   *
   * @return {Promise<String>}
   */
  getWifiAntenna(antenna) {
    return this.sendRequest(RequestType.WIFI_GET_ANTENNA).then(rep => {
      return WifiAntenna.fromProtobuf(rep.antenna)
    });
  }

  /**
   * Perform the WiFi scan.
   *
   * @return {Promise<Array>}
   */
  scanWifiNetworks() {
    return this.sendRequest(RequestType.WIFI_SCAN).then(rep => {
      if (!rep.list) {
        return [];
      }
      return rep.list.aps.map(ap => accessPointFromProtobuf(ap));
    });
  }

  /**
   * Set the WiFi credentials.
   *
   * @param {Object} credentials Credentials.
   * @return {Promise}
   */
  setWifiCredentials(credentials) {
    return this.sendRequest(RequestType.WIFI_SET_CREDENTIALS, {
      ap: accessPointToProtobuf(credentials)
    });
  }

  /**
   * Get the WiFi credentials.
   *
   * @return {Promise<Array>}
   */
  getWifiCredentials() {
    return this.sendRequest(RequestType.WIFI_GET_CREDENTIALS).then(rep => {
      if (!rep.list) {
        return [];
      }
      return rep.list.aps.map(ap => accessPointFromProtobuf(ap));
    });
  }

  /**
   * Clear the WiFi credentials.
   *
   * @return {Promise}
   */
  clearWifiCredentials() {
    return this.sendRequest(RequestType.WIFI_CLEAR_CREDENTIALS);
  }
};
