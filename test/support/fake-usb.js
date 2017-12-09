import { RequestResult } from '../../src/device-base';
import { ProtocolError, UsbError } from '../../src/error';
import * as proto from '../../src/proto';

const PARTICLE_DEVICES = [
  { type: 'Core', vendorId: 0x1d50, productId: 0x607d, dfu: false },
  { type: 'Core', vendorId: 0x1d50, productId: 0x607f, dfu: true },
  { type: 'Photon', vendorId: 0x2b04, productId: 0xc006, dfu: false },
  { type: 'Photon', vendorId: 0x2b04, productId: 0xd006, dfu: true },
  { type: 'P1', vendorId: 0x2b04, productId: 0xc008, dfu: false },
  { type: 'P1', vendorId: 0x2b04, productId: 0xd008, dfu: true },
  { type: 'Electron', vendorId: 0x2b04, productId: 0xc00a, dfu: false },
  { type: 'Electron', vendorId: 0x2b04, productId: 0xd00a, dfu: true },
  { type: 'Duo', vendorId: 0x2b04, productId: 0xc058, dfu: false },
  { type: 'Duo', vendorId: 0x2b04, productId: 0xd058, dfu: true }
];

// Low-level vendor requests
const VendorRequest = {
  SYSTEM_VERSION: 30 // Get system version
};

// List of USB devices "attached" to the host
let devices = [];

// Mockable protocol implementation
export class Protocol {
  constructor(options) {
    this._opts = options; // Device options
    this._reqs = new Map(); // All known requests
    this._lastReqId = 0; // Last used request ID
  }

  deviceToHostRequest(setup) {
    if (setup.bmRequestType != proto.BmRequestType.DEVICE_TO_HOST) {
      throw new ProtocolError(`Unsupported device-to-host request: bmRequestType: ${setup.bmRequestType}`);
    }
    let data = null
    switch (setup.bRequest) {
      case proto.ServiceType.INIT: {
        data = initServiceRequest(setup.wIndex, setup.wValue);
        break;
      }
      case proto.ServiceType.CHECK: {
        data = checkServiceRequest(setup.wIndex);
        break;
      }
      case proto.ServiceType.RECV: {
        data = recvServiceRequest(setup.wIndex, setup.wLength);
        break;
      }
      case proto.ServiceType.RESET: {
        data = resetServiceRequest(setup.wIndex);
        break;
      }
      case proto.PARTICLE_BREQUEST: { // Low-level vendor request
        if (setup.wIndex == VendorRequest.SYSTEM_VERSION && this._opts.id) {
          data = Buffer.from(this._opts.id);
        } else {
          throw new ProtocolError(`Unsupported device-to-host request: wIndex: ${setup.wIndex}`);
        }
        break;
      }
      default: {
        throw new ProtocolError(`Unsupported device-to-host request: bRequest: ${setup.bRequest}`);
      }
    }
    if (data.length > setup.wLength) {
      throw new ProtocolError(`Unexpected size of the data stage: wLength: ${setup.wLength}`);
    }
    return data;
  }

  hostToDeviceRequest(setup, data) {
    if (setup.bmRequestType != proto.BmRequestType.HOST_TO_DEVICE) {
      throw new ProtocolError(`Unsupported host-to-device request: bmRequestType: ${setup.bmRequestType}`);
    }
    if (data && data.length != setup.wLength || !data && setup.wLength != 0) {
      throw new ProtocolError(`Unexpected size of the data stage: wLength: ${setup.wLength}`);
    }
    switch (setup.bRequest) {
      case proto.ServiceType.SEND: {
        sendServiceRequest(setup.wIndex, data);
        break;
      }
      case proto.PARTICLE_BREQUEST: { // Low-level vendor request
        throw new ProtocolError(`Unsupported host-to-device request: wIndex: ${setup.wIndex}`);
      }
      default: {
        throw new ProtocolError(`Unsupported host-to-device request: bRequest: ${setup.bRequest}`);
      }
    }
  }

  initServiceRequest(type, size) {
    if (type < 0 || type > proto.MAX_REQUEST_TYPE) {
      throw new ProtocolError(`Invalid request type: ${type}`);
    }
    if (size < 0 || size > proto.MAX_PAYLOAD_SIZE) {
      throw new ProtocolError(`Invalid payload size: ${size}`);
    }
    const id = this._lastReqId + 1; // Request ID
    const req = { // Request object
      id: id,
      type: type,
      size: size,
      data: null,
      reply: null
    };
    const srep = {}; // Service reply
    srep.status = this.newRequest(req);
    if (srep.status == proto.Status.OK || srep.status == proto.Status.PENDING) {
      this._reqs.set(id, req);
      this._lastReqId = id;
      srep.id = id;
    }
    return proto.encodeReply(srep);
  }

  checkServiceRequest(id) {
    const req = this._reqs.get(id);
    const srep = {}; // Service reply
    if (req) {
      if (req.size && !req.data) {
        // Buffer allocation is pending
        srep.status = this.allocRequest(req);
        if (srep.status == proto.Status.OK) {
          if (!req.data) {
            req.data = Buffer.alloc(req.size);
          }
        } else if (srep.status != proto.Status.PENDING) {
          this._reqs.delete(id); // Buffer allocation failed
        }
      } else {
        // Request processing is pending
        const rep = { // Application reply
          result: RequestResult.OK,
          data: null
        };
        srep.status = this.processRequest(req, rep);
        if (srep.status == proto.Status.OK) {
          srep.result = rep.result;
          if (rep.data && rep.data.length != 0) {
            srep.size = rep.data.length;
            req.reply = rep;
          } else {
            this._reqs.delete(id); // Request completed
          }
        } else if (srep.status != proto.Status.PENDING) {
          this._reqs.delete(id); // Request failed
        }
      }
    } else {
      srep.status = proto.Status.NOT_FOUND;
    }
    return proto.encodeReply(srep);
  }

  sendServiceRequest(id, data) {
    const req = this._reqs.get(id);
    if (!req) {
      // This is a host-to-device request, so we can't reply with a status code
      throw new ProtocolError(`Request not found: ${id}`);
    }
    if (!req.data) {
      throw new ProtocolError('Request buffer is not allocated');
    }
    if (!data || data.length != req.data.length) {
      throw new ProtocolError('Unexpected size of the request data');
    }
    data.copy(req.data);
  }

  recvServiceRequest(id, size) {
    const req = this._reqs.get(id);
    if (!req) {
      // Payload data is application-specific, so we can't reply with a status code
      throw new ProtocolError(`Request not found: ${id}`);
    }
    if (!req.reply || !req.reply.data) {
      throw new ProtocolError('Reply data is not available');
    }
    const data = req.reply.data;
    if (data.length != size) {
      throw new ProtocolError('Unexpected size of the reply data');
    }
    this._reqs.delete(id); // Request completed
    return data;
  }

  resetServiceRequest(id) {
    const srep = {}; // Service reply
    if (id) {
      const req = this._reqs.get(id);
      if (req) {
        srep.status = this.resetRequest(req);
        if (srep.status == proto.Status.OK) {
          this._reqs.delete(id);
        }
      } else {
        srep.status = proto.Status.NOT_FOUND;
      }
    } else {
      srep.status = this.resetAllRequests();
      if (srep.status == proto.Status.OK) {
        this._reqs.clear();
      }
    }
    return proto.encodeReply(srep);
  }

  newRequest(req) {
    return proto.Status.PENDING;
  }

  allocRequest(req) {
    return proto.Status.OK;
  }

  processRequest(req, rep) {
    return proto.Status.OK;
  }

  resetRequest(req) {
    return proto.Status.OK;
  }

  resetAllRequests() {
    return proto.Status.OK;
  }

  reset() {
    this._reqs.clear();
    this._lastReqId = 0;
  }
}

// Class implementing a fake USB device
export class Device {
  constructor(options) {
    this._opts = options; // Device options
    this._proto = new Protocol(options); // Protocol implementation
    this._isOpen = false; // Set to true if the device is open
  }

  async open() {
    if (this._isOpen) {
      throw new UsbError('Device is already open');
    }
    this._isOpen = true;
  }

  async close() {
    this._proto.reset();
    this._isOpen = false;
  }

  async transferIn(setup) {
    if (!this._isOpen) {
      throw new UsbError('Device is not open');
    }
    return this._proto.deviceToHostRequest(setup);
  }

  async transferOut(setup, data) {
    if (!this._isOpen) {
      throw new UsbError('Device is not open');
    }
    this._proto.hostToDeviceRequest(setup, data);
  }

  get vendorId() {
    return this._opts.vendorId;
  }

  get productId() {
    return this._opts.productId;
  }

  get serialNumber() {
    return (this._isOpen ? this._opts.id : null);
  }

  get protocol() {
    return this._proto;
  }

  get isOpen() {
    return this._isOpen;
  }
}

export function getDevices() {
  return Promise.resolve(devices);
}

export function addDevice(options) {
  if (options.type) {
    const devs = PARTICLE_DEVICES.filter(dev => (dev.type == options.type && !!dev.dfu == !!options.dfu));
    if (devs.length == 0) {
      throw new Error(`Unknown device type: ${options.type}`);
    }
    options = Object.assign({}, options, devs[0]);
    if (!('id' in options)) {
      options.id = String(devices.length).padStart(24, '0'); // Generate device ID
    }
  }
  const dev = new Device(options);
  devices.push(dev);
  return dev;
}

export function addCore(options) {
  const opts = Object.assign({ type: 'Core' }, options);
  return addDevice(opts);
}

export function addPhoton(options) {
  const opts = Object.assign({ type: 'Photon' }, options);
  return addDevice(opts);
}

export function addP1(options) {
  const opts = Object.assign({ type: 'P1' }, options);
  return addDevice(opts);
}

export function addElectron(options) {
  const opts = Object.assign({ type: 'Electron' }, options);
  return addDevice(opts);
}

export function addDuo(options) {
  const opts = Object.assign({ type: 'Duo' }, options);
  return addDevice(opts);
}

export function clearDevices() {
  devices = [];
}
