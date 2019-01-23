import { UsbError } from './error';

function bmRequestTypeToString(type) {
  type = (type >> 4) & 0x03;
  switch (type) {
    case 0: {
      return 'standard';
    }
    case 1: {
      return 'class';
    }
    case 2: {
      return 'vendor';
    }
    default: {
      return 'unknown';
    }
  }
}

function bmRequestTypeToRecipientString(type) {
  type = type & 0x0f;
  switch (type) {
    case 0: {
      return 'device';
    }
    case 1: {
      return 'interface';
    }
    case 2: {
      return 'endpoint';
    }
    case 3:
    default: {
      return 'other';
    }
  }
}

export class UsbDevice {
  constructor(dev) {
    this._dev = dev;
    this._dev.timeout = 5000; // Use longer timeout for control transfers
  }

  async open() {
    try {
      await this._dev.open();
    } catch (err) {
      throw new UsbError(err, 'Unable to open USB device');
    }
  }

  async close() {
    try {
      await this._dev.close();
    } catch (err) {
      throw new UsbError(err, 'Unable to close USB device');
    }
  }

  async transferIn(setup) {
    try {
      const res = await this._dev.controlTransferIn({
        requestType: bmRequestTypeToString(setup.bmRequestType),
        recipient: bmRequestTypeToRecipientString(setup.bmRequestType),
        request: setup.bRequest,
        value: setup.wValue,
        index: setup.wIndex
      }, setup.wLength);
      return new Buffer(res.data.buffer);
    } catch (err) {
      throw new UsbError(err, 'IN control transfer failed');
    }
  }

  async transferOut(setup, data) {
    try {
      const res = await this._dev.controlTransferOut({
        requestType: bmRequestTypeToString(setup.bmRequestType),
        recipient: bmRequestTypeToRecipientString(setup.bmRequestType),
        request: setup.bRequest,
        value: setup.wValue,
        index: setup.wIndex
      }, data);
    } catch (err) {
      throw new UsbError(err, 'OUT control transfer failed');
    }
  }

  get vendorId() {
    return this._dev.vendorId;
  }

  get productId() {
    return this._dev.productId;
  }

  get serialNumber() {
    return this._dev.serialNumber;
  }
}

async function getDeviceList() {
  let devs = [];
  try {
    devs = await navigator.usb.getDevices();
  } catch (err) {
    throw new UsbError(err, 'Unable to enumerate USB devices');
  }
  return devs;
}

export async function getUsbDevices() {
  // Attempt to request permission to access device
  let d = await navigator.usb.requestDevice({
    filters: [{
      vendorId: 0x2b04,
      classCode: 0xff
    }]
  });

  // Get device list
  let devs = await getDeviceList();

  devs = devs.map(dev => new UsbDevice(dev));
  return devs;
}
