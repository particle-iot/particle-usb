import * as usb from './device-base';
import { RequestType } from './request-type';
import { RequestResult, messageForResultCode } from './request-result';
import { fromProtobufEnum } from './protobuf-util';
import { RequestError } from './error';

import proto from './protocol';

/**
 * Server protocol types.
 */
export const ServerProtocol = fromProtobufEnum(proto.ServerProtocolType, {
  TCP: 'TCP_PROTOCOL',
  UDP: 'UDP_PROTOCOL'
});

/**
 * Particle USB device.
 */
export class Device extends usb.DeviceBase {
  /**
   * Perform the system reset.
   *
   * @return {Promise}
   */
  reset() {
    return this.sendProtobufRequest(RequestType.RESET);
  }

  /**
   * Perform the factory reset.
   *
   * @return {Promise}
   */
  factoryReset() {
    return this.sendProtobufRequest(RequestType.FACTORY_RESET);
  }

  /**
   * Reset and enter the DFU mode.
   *
   * @return {Promise}
   */
  enterDfuMode() {
    return this.sendProtobufRequest(RequestType.DFU_MODE);
  }

  /**
   * Reset and enter the safe mode.
   *
   * @return {Promise}
   */
  enterSafeMode() {
    return this.sendProtobufRequest(RequestType.SAFE_MODE);
  }

  /**
   * Enter the listening mode.
   *
   * @return {Promise}
   */
  enterListeningMode() {
    return this.sendProtobufRequest(RequestType.START_LISTENING);
  }

  /**
   * Leave the listening mode.
   *
   * @return {Promise}
   */
  leaveListeningMode() {
    return this.sendProtobufRequest(RequestType.STOP_LISTENING);
  }

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
    return this.sendProtobufRequest(RequestType.IS_CLAIMED).then(() => true, err => {
      if (err.result == RequestResult.NOT_FOUND) {
        return false;
      }
      throw err;
    });
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

  /**
   * Start the Nyan LED indication.
   *
   * @return {Promise}
   */
  startNyanSignal() {
    return this.sendProtobufRequest(RequestType.START_NYAN_SIGNAL);
  }

  /**
   * Stop the Nyan LED indication.
   *
   * @return {Promise}
   */
  stopNyanSignal() {
    return this.sendProtobufRequest(RequestType.STOP_NYAN_SIGNAL);
  }

  /**
   * Perform the firmware update.
   *
   * @param {Buffer} data Firmware module data.
   * @return {Promise}
   */
  updateFirmware(data) {
    return this.sendProtobufRequest(RequestType.START_FIRMWARE_UPDATE, {
      size: data.length
    }).then(rep => {
      let chunkSize = rep.chunkSize;
      let offs = 0;
      const sendFirmwareData = () => {
        if (offs + chunkSize > data.length) {
          chunkSize = data.length - offs;
        }
        if (chunkSize == 0) {
          return Promise.resolve();
        }
        return this.sendProtobufRequest(RequestType.SAVE_FIRMWARE_DATA, {
          data: data.slice(offs, offs + chunkSize)
        }).then(() => {
          offs += chunkSize;
          return sendFirmwareData();
        });
      };
      return sendFirmwareData();
    }).then(() => {
      return this.sendProtobufRequest(RequestType.FINISH_FIRMWARE_UPDATE, {
        validateOnly: false
      });
    });
  }

  sendProtobufRequest(type, props) {
    let buf = null;
    if (props && type.request) {
      const msg = type.request.create(props);
      buf = type.request.encode(msg).finish();
    }
    return this.sendRequest(type.id, buf).then(rep => {
      if (rep.result != RequestResult.OK) {
        throw new RequestError(rep.result, messageForResultCode(rep.result));
      }
      if (rep.data && type.reply) {
        return type.reply.decode(rep.data);
      }
    });
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
