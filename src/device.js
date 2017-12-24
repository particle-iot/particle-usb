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
  START_LISTENING: {
    id: 70
  },
  STOP_LISTENING: {
    id: 71
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
  },
  PREPARE_FIRMWARE_UPDATE: {
    id: 250,
    request: pb.PrepareFirmwareUpdateRequest,
    reply: pb.PrepareFirmwareUpdateReply
  },
  FINISH_FIRMWARE_UPDATE: {
    id: 251,
    request: pb.FinishFirmwareUpdateRequest,
    reply: pb.FinishFirmwareUpdateReply
  },
  CANCEL_FIRMWARE_UPDATE: {
    id: 252,
    request: pb.CancelFirmwareUpdateRequest,
    reply: pb.CancelFirmwareUpdateReply
  },
  SAVE_FIRMWARE_CHUNK: {
    id: 253,
    request: pb.SaveFirmwareChunkRequest,
    reply: pb.SaveFirmwareChunkReply
  }
};

// Result codes as defined by the firmware's system_error_t enum
const RESULT_CODES = [
  {
    id: 'OK',
    value: 0,
    message: 'Operation succeeded'
  },
  {
    id: 'ERROR',
    value: -100,
    message: 'Unknown error'
  },
  {
    id: 'BUSY',
    value: -110,
    message: 'Resource is busy'
  },
  {
    id: 'NOT_SUPPORTED',
    value: -120,
    message: 'Not supported'
  },
  {
    id: 'NOT_ALLOWED',
    value: -130,
    message: 'Not allowed'
  },
  {
    id: 'CANCELLED',
    value: -140,
    message: 'Operation cancelled'
  },
  {
    id: 'ABORTED',
    value: -150,
    message: 'Operation aborted'
  },
  {
    id: 'TIMEOUT_ERROR',
    value: -160,
    message: 'Timeout error'
  },
  {
    id: 'NOT_FOUND',
    value: -170,
    message: 'Not found'
  },
  {
    id: 'ALREADY_EXISTS',
    value: -180,
    message: 'Already exists'
  },
  {
    id: 'TOO_LARGE',
    value: -190,
    message: 'Data is too large'
  },
  {
    id: 'LIMIT_EXCEEDED',
    value: -200,
    message: 'Limit exceeded'
  },
  {
    id: 'INVALID_STATE',
    value: -210,
    message: 'Invalid state'
  },
  {
    id: 'IO_ERROR',
    value: -220,
    message: 'IO error'
  },
  {
    id: 'NETWORK_ERROR',
    value: -230,
    message: 'Network error'
  },
  {
    id: 'PROTOCOL_ERROR',
    value: -240,
    message: 'Protocol error'
  },
  {
    id: 'INTERNAL_ERROR',
    value: -250,
    message: 'Internal error'
  },
  {
    id: 'NO_MEMORY',
    value: -260,
    message: 'Memory allocation error'
  },
  {
    id: 'INVALID_ARGUMENT',
    value: -270,
    message: 'Invalid argument'
  },
  {
    id: 'BAD_DATA',
    value: -280,
    message: 'Invalid data format'
  }
];

const RESULT_CODE_MESSAGES = RESULT_CODES.reduce((obj, result) => {
  obj[result.value] = result.message;
  return obj;
}, {});

/**
 * Request result codes.
 */
export const RequestResult = RESULT_CODES.reduce((obj, result) => {
  obj[result.id] = result.value;
  return obj;
}, {});

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

  uploadFirmware(data) {
    return this._pbRequest(RequestType.PREPARE_FIRMWARE_UPDATE, {
      size: data.length
    }).then(rep => {
      let chunkSize = rep.chunkSize;
      let offs = 0;
      const sendChunks = () => {
        if (offs + chunkSize > data.length) {
          chunkSize = data.length - offs;
        }
        if (chunkSize == 0) {
          return Promise.resolve();
        }
        return this._pbRequest(RequestType.SAVE_FIRMWARE_CHUNK, {
          data: data.slice(offs, offs + chunkSize)
        }).then(() => {
          offs += chunkSize;
          return sendChunks();
        });
      };
      return sendChunks();
    }).then(() => {
      return this._pbRequest(RequestType.FINISH_FIRMWARE_UPDATE, {
        validateOnly: false
      });
    });
  }

  _pbRequest(type, props) {
    let buf = null;
    if (props && type.request) {
      const msg = type.request.create(props);
      buf = type.request.encode(msg).finish();
    }
    return this.sendRequest(type.id, buf).then(rep => {
      if (rep.result != RequestResult.OK) {
        throw new RequestError(rep.result, RESULT_CODE_MESSAGES[rep.result]);
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
