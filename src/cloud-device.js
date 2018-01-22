import { RequestType } from './request-type';
import { fromProtobufEnum } from './protobuf-util';

import proto from './protocol';

/**
 * Server protocol types.
 */
export const ServerProtocol = fromProtobufEnum(proto.ServerProtocolType, {
  TCP: 'TCP_PROTOCOL',
  UDP: 'UDP_PROTOCOL'
});

/**
 * Mixin class for a cloud-enabled device.
 */
export const CloudDevice = Base => class extends Base {
  /**
   * Set the claim code.
   *
   * @param {String} code Claim code.
   * @return {Promise}
   */
  setClaimCode(code) {
    return this.sendProtobufRequest(RequestType.SET_CLAIM_CODE, {
      code: code
    });
  }

  /**
   * Check if the device is claimed.
   *
   * @return {Promise<Boolean>}
   */
  isClaimed() {
    return this.sendProtobufRequest(RequestType.IS_CLAIMED).then(rep => rep.claimed);
  }

  /**
   * Set the device private key.
   *
   * @param {Buffer} data Key data.
   * @param {String} [protocol] Server protocol.
   * @return {Promise}
   */
  setDevicePrivateKey(data, protocol) {
    return this._getServerProtocol(protocol).then(protocol => {
      const keyType = (protocol == proto.ServerProtocolType.UDP_PROTOCOL ? proto.SecurityKeyType.UDP_DEVICE_PRIVATE_KEY :
          proto.SecurityKeyType.TCP_DEVICE_PRIVATE_KEY);
      return this._setSecurityKey(keyType, data);
    });
  }

  /**
   * Get the device private key.
   *
   * @param {String} [protocol] Server protocol.
   * @return {Promise<Buffer>}
   */
  getDevicePrivateKey(protocol) {
    return this._getServerProtocol(protocol).then(protocol => {
      const keyType = (protocol == proto.ServerProtocolType.UDP_PROTOCOL ? proto.SecurityKeyType.UDP_DEVICE_PRIVATE_KEY :
          proto.SecurityKeyType.TCP_DEVICE_PRIVATE_KEY);
      return this._getSecurityKey(keyType);
    });
  }

  /**
   * Set the device public key.
   *
   * @param {Buffer} data Key data.
   * @param {String} [protocol] Server protocol.
   * @return {Promise}
   */
  setDevicePublicKey(data, protocol) {
    return this._getServerProtocol(protocol).then(protocol => {
      const keyType = (protocol == proto.ServerProtocolType.UDP_PROTOCOL ? proto.SecurityKeyType.UDP_DEVICE_PUBLIC_KEY :
          proto.SecurityKeyType.TCP_DEVICE_PUBLIC_KEY);
      return this._setSecurityKey(keyType, data);
    });
  }

  /**
   * Get the device public key.
   *
   * @param {String} [protocol] Server protocol.
   * @return {Promise<Buffer>}
   */
  getDevicePublicKey(data, protocol) {
    return this._getServerProtocol(protocol).then(protocol => {
      const keyType = (protocol == proto.ServerProtocolType.UDP_PROTOCOL ? proto.SecurityKeyType.UDP_DEVICE_PUBLIC_KEY :
          proto.SecurityKeyType.TCP_DEVICE_PUBLIC_KEY);
      return this._getSecurityKey(keyType);
    });
  }

  /**
   * Set the server public key.
   *
   * @param {Buffer} data Key data.
   * @param {String} [protocol] Server protocol.
   * @return {Promise}
   */
  setServerPublicKey(data, protocol) {
    return this._getServerProtocol(protocol).then(protocol => {
      const keyType = (protocol == proto.ServerProtocolType.UDP_PROTOCOL ? proto.SecurityKeyType.UDP_SERVER_PUBLIC_KEY :
          proto.SecurityKeyType.TCP_SERVER_PUBLIC_KEY);
      return this._setSecurityKey(keyType, data);
    });
  }

  /**
   * Get the server public key.
   *
   * @param {String} [protocol] Server protocol.
   * @return {Promise<Buffer>}
   */
  getServerPublicKey(data, protocol) {
    return this._getServerProtocol(protocol).then(protocol => {
      const keyType = (protocol == proto.ServerProtocolType.UDP_PROTOCOL ? proto.SecurityKeyType.UDP_SERVER_PUBLIC_KEY :
          proto.SecurityKeyType.TCP_SERVER_PUBLIC_KEY);
      return this._getSecurityKey(keyType);
    });
  }

  /**
   * Set the server address.
   *
   * @param {String} data Host address.
   * @param {Number} port Port number.
   * @param {String} [protocol] Server protocol.
   * @return {Promise}
   */
  setServerAddress(address, port, protocol) {
    return this._getServerProtocol(protocol).then(protocol => {
      return this.sendProtobufRequest(RequestType.SET_SERVER_ADDRESS, {
        protocol: protocol,
        address: address,
        port: port // TODO: Make port number optional
      });
    });
  }

  /**
   * Get the server address.
   *
   * @param {String} [protocol] Server protocol.
   * @return {Promise<Object>}
   */
  getServerAddress(protocol) {
    return this._getServerProtocol(protocol).then(protocol => {
      return this.sendProtobufRequest(RequestType.GET_SERVER_ADDRESS, {
        protocol: protocol
      });
    });
  }

  /**
   * Set the server protocol.
   *
   * @param {String} protocol Server protocol.
   * @return {Promise}
   */
  setServerProtocol(protocol) {
    return this.sendProtobufRequest(RequestType.SET_SERVER_PROTOCOL, {
      protocol: ServerProtocol.toProtobuf(protocol)
    });
  }

  /**
   * Get the server protocol.
   *
   * @return {Promise<String>}
   */
  getServerProtocol() {
    return this._getServerProtocol().then(protocol => ServerProtocol.fromProtobuf(protocol));
  }

  _setSecurityKey(type, data) {
    return this.sendProtobufRequest(RequestType.SET_SECURITY_KEY, { type: type, data: data });
  }

  _getSecurityKey(type) {
    return this.sendProtobufRequest(RequestType.GET_SECURITY_KEY, { type: type }).then(rep => rep.data);
  }

  _getServerProtocol(protocol) {
    if (protocol) {
      return Promise.resolve(ServerProtocol.toProtobuf(protocol));
    }
    return this.sendProtobufRequest(RequestType.GET_SERVER_PROTOCOL).then(rep => rep.protocol);
  }
}
