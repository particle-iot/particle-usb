import * as proto from '../../src/usb-protocol';
import { DeviceType } from '../../src/device-type';
import { ProtocolError, UsbError } from '../../src/error';

const USB_DEVICES = [
  { type: DeviceType.CORE, vendorId: 0x1d50, productId: 0x607d, dfu: false },
  { type: DeviceType.CORE, vendorId: 0x1d50, productId: 0x607f, dfu: true },
  { type: DeviceType.PHOTON, vendorId: 0x2b04, productId: 0xc006, dfu: false },
  { type: DeviceType.PHOTON, vendorId: 0x2b04, productId: 0xd006, dfu: true },
  { type: DeviceType.P1, vendorId: 0x2b04, productId: 0xc008, dfu: false },
  { type: DeviceType.P1, vendorId: 0x2b04, productId: 0xd008, dfu: true },
  { type: DeviceType.ELECTRON, vendorId: 0x2b04, productId: 0xc00a, dfu: false },
  { type: DeviceType.ELECTRON, vendorId: 0x2b04, productId: 0xd00a, dfu: true },
  { type: DeviceType.DUO, vendorId: 0x2b04, productId: 0xc058, dfu: false },
  { type: DeviceType.DUO, vendorId: 0x2b04, productId: 0xd058, dfu: true },
  { type: DeviceType.XENON, vendorId: 0x2b04, productId: 0xc00e, dfu: false },
  { type: DeviceType.XENON, vendorId: 0x2b04, productId: 0xd00e, dfu: true },
  { type: DeviceType.ARGON, vendorId: 0x2b04, productId: 0xc00c, dfu: false },
  { type: DeviceType.ARGON, vendorId: 0x2b04, productId: 0xd00c, dfu: true },
  { type: DeviceType.BORON, vendorId: 0x2b04, productId: 0xc00d, dfu: false },
  { type: DeviceType.BORON, vendorId: 0x2b04, productId: 0xd00d, dfu: true }
];

// Low-level vendor requests
const VendorRequest = {
  SYSTEM_VERSION: 30 // Get system version
};

// USB devices "attached" to the host
let devices = new Map();

// Last used internal device ID
let lastDeviceId = 0;

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
        data = this.initServiceRequest(setup.wIndex, setup.wValue);
        break;
      }
      case proto.ServiceType.CHECK: {
        data = this.checkServiceRequest(setup.wIndex);
        break;
      }
      case proto.ServiceType.RECV: {
        data = this.recvServiceRequest(setup.wIndex, setup.wLength);
        break;
      }
      case proto.ServiceType.RESET: {
        data = this.resetServiceRequest(setup.wIndex);
        break;
      }
      case proto.PARTICLE_BREQUEST: { // Low-level vendor request
        if (setup.wIndex == VendorRequest.SYSTEM_VERSION) {
          if (!this._opts.firmwareVersion) {
            throw new ProtocolError(`Unsupported device-to-host request: wIndex: ${setup.wIndex}`);
          }
          data = Buffer.from(this._opts.firmwareVersion);
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
        this.sendServiceRequest(setup.wIndex, data);
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
    srep.status = this.initRequest(req);
    if (srep.status == proto.Status.OK || srep.status == proto.Status.PENDING) {
      if (srep.status == proto.Status.OK && req.size && !req.data) {
        req.data = Buffer.alloc(req.size);
      }
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
        srep.status = this.checkBuffer(req);
        if (srep.status == proto.Status.OK) {
          req.data = Buffer.alloc(req.size);
        } else if (srep.status != proto.Status.PENDING) {
          this._reqs.delete(id); // Buffer allocation failed
        }
      } else {
        // Request processing is pending
        srep.status = this.checkRequest(req);
        if (srep.status == proto.Status.OK) {
          const rep = { // Application reply
            result: this.replyResult(req),
            data: this.replyData(req)
          };
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
    const data = req.reply ? req.reply.data : null;
    if (!data) {
      throw new ProtocolError('Reply data is not available');
    }
    if (size != data.length) {
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

  initRequest(req) {
    return proto.Status.OK;
  }

  checkBuffer(req) {
    return proto.Status.OK;
  }

  checkRequest(req) {
    return proto.Status.OK;
  }

  resetRequest(req) {
    return proto.Status.OK;
  }

  resetAllRequests() {
    return proto.Status.OK;
  }

  replyResult(req) {
    return 0; // OK
  }

  replyData(req) {
    return null;
  }

  reset() {
    this._reqs.clear();
    this._lastReqId = 0;
  }
}

// Class implementing a fake USB device
export class Device {
  constructor(id, options) {
    this._objId = id; // Internal object ID
    this._opts = options; // Device options
    this._proto = new Protocol(options); // Protocol implementation
    this._open = false; // Set to true if the device is open
    this._attached = true; // Set to true if the device is "attached" to the host
  }

  async open() {
    if (!this._attached) {
      throw new UsbError('Device is not found');
    }
    if (this._open) {
      throw new UsbError('Device is already open');
    }
    this._open = true;
  }

  async close() {
    if (!this._attached) {
      throw new UsbError('Device is not found');
    }
    this._proto.reset();
    this._open = false;
  }

  async transferIn(setup) {
    if (!this._attached) {
      throw new UsbError('Device is not found');
    }
    if (!this._open) {
      throw new UsbError('Device is not open');
    }
    return this._proto.deviceToHostRequest(setup);
  }

  async transferOut(setup, data) {
    if (!this._attached) {
      throw new UsbError('Device is not found');
    }
    if (!this._open) {
      throw new UsbError('Device is not open');
    }
    this._proto.hostToDeviceRequest(setup, data);
  }

  detach() {
    this._proto.reset();
    this._attached = false;
  }

  get objectId() {
    return this._objId;
  }

  get vendorId() {
    return this._opts.vendorId;
  }

  get productId() {
    return this._opts.productId;
  }

  get serialNumber() {
    return this._opts.serialNumber;
  }

  get protocol() {
    return this._proto;
  }

  get options() {
    return this._opts;
  }

  get isOpen() {
    return this._open;
  }
}

export async function getDevices() {
  return Array.from(devices.values());
}

export function addDevice(options) {
  if (options.type) {
    const devs = USB_DEVICES.filter(dev => (dev.type == options.type && dev.dfu == !!options.dfu));
    if (devs.length == 0) {
      throw new Error(`Unknown device type: ${options.type}`);
    }
    options = Object.assign({}, options, devs[0]);
    if (!options.id) {
      // Generate ID for a Particle device
      options.id = String(devices.size).padStart(24, '0');
    }
    // Particle devices expose the device ID via the serial number descriptor
    options.serialNumber = options.id;
  }
  const objId = ++lastDeviceId; // Internal object ID
  const dev = new Device(objId, options);
  devices.set(objId, dev);
  return dev;
}

export function addDevices(options) {
  let devs = [];
  for (let opts of options) {
    devs.push(addDevice(opts));
  }
  return devs;
}

export function addCore(options) {
  const opts = Object.assign({}, options, { type: DeviceType.CORE });
  return addDevice(opts);
}

export function addPhoton(options) {
  const opts = Object.assign({}, options, { type: DeviceType.PHOTON });
  return addDevice(opts);
}

export function addP1(options) {
  const opts = Object.assign({}, options, { type: DeviceType.P1 });
  return addDevice(opts);
}

export function addElectron(options) {
  const opts = Object.assign({}, options, { type: DeviceType.ELECTRON });
  return addDevice(opts);
}

export function addDuo(options) {
  const opts = Object.assign({}, options, { type: DeviceType.DUO });
  return addDevice(opts);
}

export function addXenon(options) {
  const opts = Object.assign({}, options, { type: DeviceType.XENON });
  return addDevice(opts);
}

export function addArgon(options) {
  const opts = Object.assign({}, options, { type: DeviceType.ARGON });
  return addDevice(opts);
}

export function addBoron(options) {
  const opts = Object.assign({}, options, { type: DeviceType.BORON });
  return addDevice(opts);
}

export function removeDevice(dev) {
  if (devices.delete(dev.objectId)) {
    dev.detach();
  }
}

export function clearDevices() {
  for (let dev of devices.values()) {
    dev.detach();
  }
  devices.clear();
}
