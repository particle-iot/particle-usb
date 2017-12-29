import pbMessage from '../lib/pb-message.js';

export const proto = pbMessage.particle.ctrl;

// Mapping of request types to Protobuf messages
export const RequestType = {
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
    request: proto.SetClaimCodeRequest,
    reply: proto.SetClaimCodeReply
  },
  IS_CLAIMED: {
    id: 201
  },
  SET_SECURITY_KEY: {
    id: 210,
    request: proto.SetSecurityKeyRequest,
    reply: proto.SetSecurityKeyReply
  },
  GET_SECURITY_KEY: {
    id: 211,
    request: proto.GetSecurityKeyRequest,
    reply: proto.GetSecurityKeyReply
  },
  SET_SERVER_ADDRESS: {
    id: 220,
    request: proto.SetServerAddressRequest,
    reply: proto.SetServerAddressReply
  },
  GET_SERVER_ADDRESS: {
    id: 221,
    request: proto.GetServerAddressRequest,
    reply: proto.GetServerAddressReply
  },
  SET_SERVER_PROTOCOL: {
    id: 222,
    request: proto.SetServerProtocolRequest,
    reply: proto.SetServerProtocolReply
  },
  GET_SERVER_PROTOCOL: {
    id: 223,
    request: proto.GetServerProtocolRequest,
    reply: proto.GetServerProtocolReply
  },
  START_NYAN_SIGNAL: {
    id: 230
  },
  STOP_NYAN_SIGNAL: {
    id: 231
  },
  SET_SOFTAP_SSID: {
    id: 240,
    request: proto.SetSoftApSsidRequest,
    reply: proto.SetSoftApSsidReply
  },
  START_FIRMWARE_UPDATE: {
    id: 250,
    request: proto.StartFirmwareUpdateRequest,
    reply: proto.StartFirmwareUpdateReply
  },
  FINISH_FIRMWARE_UPDATE: {
    id: 251,
    request: proto.FinishFirmwareUpdateRequest,
    reply: proto.FinishFirmwareUpdateReply
  },
  CANCEL_FIRMWARE_UPDATE: {
    id: 252,
    request: proto.CancelFirmwareUpdateRequest,
    reply: proto.CancelFirmwareUpdateReply
  },
  SAVE_FIRMWARE_DATA: {
    id: 253,
    request: proto.SaveFirmwareDataRequest,
    reply: proto.SaveFirmwareDataReply
  },
  DESCRIBE_STORAGE: {
    id: 260,
    request: proto.DescribeStorageRequest,
    reply: proto.DescribeStorageReply
  },
  LOAD_STORAGE_DATA: {
    id: 261,
    request: proto.LoadStorageDataRequest,
    reply: proto.LoadStorageDataReply
  },
  SAVE_STORAGE_DATA: {
    id: 262,
    request: proto.SaveStorageDataRequest,
    reply: proto.SaveStorageDataReply
  },
  CLEAR_STORAGE_SECTION: {
    id: 263,
    request: proto.ClearStorageSectionRequest,
    reply: proto.ClearStorageSectionReply
  }
};
