import * as usb from './device-base';
import { DeviceError } from './error';

import pbMessage from '../lib/pb-message.js';
const pb = pbMessage.particle.ctrl;

// Request types
const RequestType = {
  RESET: {
    id: 40
  },
  FACTORY_RESET: {
    id: 41
  },
  DFU_MODE: {
    id: 50
  },
  SAFE_MODE: {
    id: 60
  },
  LISTENING_MODE: {
    id: 70
  },
  LOG_CONFIG: {
    id: 80
  },
  MODULE_INFO: {
    id: 90
  },
  DIAGNOSTIC_INFO: {
    id: 100
  },
  WIFI_SET_ANTENNA: {
    id: 110
  },
  WIFI_GET_ANTENNA: {
    id: 111
  },
  WIFI_SCAN: {
    id: 112
  },
  WIFI_SET_CREDENTIALS: {
    id: 113
  },
  WIFI_GET_CREDENTIALS: {
    id: 114
  },
  WIFI_CLEAR_CREDENTIALS: {
    id: 115
  },
  NETWORK_SET_CONFIGURATION: {
    id: 120
  },
  NETWORK_GET_CONFIGURATION: {
    id: 121
  },
  NETWORK_GET_STATUS: {
    id: 122
  },
  SET_CLAIM_CODE: {
    id: 200,
    request: pb.SetClaimCodeRequest
  },
  IS_CLAIMED: {
    id: 201
  },
  SET_SECURITY_KEY: {
    id: 210,
    request: pb.SetSecurityKeyRequest
  },
  GET_SECURITY_KEY: {
    id: 211,
    request: pb.GetSecurityKeyRequest,
    reply: pb.GetSecurityKeyReply
  },
  SET_SERVER_ADDRESS: {
    id: 220,
    request: pb.SetServerAddressRequest
  },
  GET_SERVER_ADDRESS: {
    id: 221,
    request: pb.GetServerAddressRequest,
    reply: pb.GetServerAddressReply
  },
  SET_SERVER_PROTOCOL: {
    id: 222,
    request: pb.SetServerProtocolRequest
  },
  GET_SERVER_PROTOCOL: {
    id: 223,
    reply: pb.GetServerProtocolReply
  },
  START_NYAN_SIGNAL: {
    id: 230
  },
  STOP_NYAN_SIGNAL: {
    id: 231
  },
  SET_SOFTAP_SSID: {
    id: 240
  }
};

/**
 * Request result codes.
 */
export const RequestResult = {
  OK: 0,
  ERROR: -100,
  BUSY: -110,
  NOT_SUPPORTED: -120,
  NOT_ALLOWED: -130,
  CANCELLED: -140,
  ABORTED: -150,
  TIMEOUT: -160,
  NOT_FOUND: -170,
  ALREADY_EXISTS: -180,
  TOO_LARGE: -190,
  LIMIT_EXCEEDED: -200,
  INVALID_STATE: -210,
  IO_ERROR: -220,
  NETWORK_ERROR: -230,
  PROTOCOL_ERROR: -240,
  INTERNAL_ERROR: -250,
  NO_MEMORY: -260,
  INVALID_ARGUMENT: -270,
  BAD_DATA: -280
};

/**
 * Request error.
 */
export class RequestError extends DeviceError {
  constructor(result, ...args) {
    super(...args);
    this.result = result;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Particle USB device.
 */
export class Device extends usb.DeviceBase{
  reset() {
    return this._pbRequest(RequestType.RESET);
  }

  setClaimCode(code) {
    return this._pbRequest(RequestType.SET_CLAIM_CODE, {
      code: code
    });
  }

  isClaimed() {
    return this._pbRequest(RequestType.IS_CLAIMED).then(() => true, err => {
      if (err.result == RequestResult.NOT_FOUND) {
        return false;
      }
      throw err;
    });
  }

  setSecurityKey(type, data) {
    return this._pbRequest(RequestType.SET_SECURITY_KEY, {
      type: type,
      data: data
    });
  }

  getSecurityKey(type) {
    return this._pbRequest(RequestType.GET_SECURITY_KEY, {
      type: type
    });
  }

  setServerAddress(protocol, address, port) {
    return this._pbRequest(RequestType.SET_SERVER_ADDRESS, {
      protocol: protocol,
      address: address,
      port: port
    });
  }

  getServerAddress(protocol) {
    return this._pbRequest(RequestType.GET_SERVER_ADDRESS, {
      protocol: protocol
    });
  }

  setServerProtocol(protocol) {
    return this._pbRequest(RequestType.SET_SERVER_PROTOCOL, {
      protocol: protocol
    });
  }

  getServerProtocol() {
    return this._pbRequest(RequestType.GET_SERVER_PROTOCOL).then(rep => {
      return rep.protocol;
    });
  }

  startNyanSignal() {
    return this._pbRequest(RequestType.START_NYAN_SIGNAL);
  }

  stopNyanSignal() {
    return this._pbRequest(RequestType.STOP_NYAN_SIGNAL);
  }

  _pbRequest(type, data) {
    let buf = null;
    if (data && type.request) {
      const msg = type.request.create(data);
      buf = type.request.encode(msg).finish();
    }
    return this.sendRequest(type.id, buf).then(rep => {
      if (rep.result != RequestResult.OK) {
        console.log(rep.result);
        throw new RequestError(rep.result); // TODO: Error message
      }
      if (rep.data && type.reply) {
        return type.reply.decode(rep.data);
      }
    });
  }
}

export function getDevices(options) {
  return usb.getDevices(options).then(devs => devs.map(dev => {
    return Object.setPrototypeOf(dev, Device.prototype); // DeviceBase -> Device
  }));
}

export function openDeviceById(id, options) {
  return usb.openDeviceById(id, options).then(dev => {
    return Object.setPrototypeOf(dev, Device.prototype); // DeviceBase -> Device
  });
}
