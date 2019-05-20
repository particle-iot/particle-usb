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

  async claimInterface(intrface) {
    try {
      await this._dev.claimInterface(intrface);
    } catch (err) {
      throw new UsbError(err, 'Failed to claim interface');
    }
  }

  async releaseInterface(intrface) {
    try {
      await this._dev.releaseInterface(intrface);
    } catch (err) {
      throw new UsbError(err, 'Failed to release interface');
    }
  }

  async setAltSetting(intrface, setting) {
    try {
      await this._dev.selectAlternateInterface(intrface, setting);
    } catch (err) {
      throw new UsbError(err, 'Failed to set alt setting');
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

  get isOpen() {
    return this._dev.opened;
  }
}

export async function getUsbDevices(filters) {
  if (filters) {
    // Validate filtering options
    filters.forEach(f => {
      if (f.productId && !f.vendorId) {
        throw new RangeError('Vendor ID is missing');
      }
    });
  } else {
    filters = [];
  }
  let devs = [];
  try {
    // Fow now, always ask the user to grant access to the device, even if we already have a
    // permission to access it. The permissions API for USB is not yet implemented in Chrome,
    // and calling requestDevice() after getDevices() causes a SecurityError.
    // TODO: Implement a separate API to request a permission from the user
    let newDev = null;
    try {
      newDev = await navigator.usb.requestDevice({ filters });
    } catch (e) {
      // Ignore NotFoundError which means that the user has cancelled the request
      if (e.name != 'NotFoundError') {
        throw e;
      }
    }
    // Get the list of known devices and filter them according to the provided options
    devs = await navigator.usb.getDevices();
    if (filters.length > 0) {
      devs = devs.filter(dev => filters.some(f => ((!f.vendorId || dev.vendorId == f.vendorId) &&
          (!f.productId || dev.productId == f.productId) &&
          (!f.serialNumber || dev.serialNumber == f.serialNumber))));
    }
    if (newDev) {
      // Avoid listing the same device twice
      const hasNewDev = devs.some(dev => dev.vendorId == newDev.vendorId && dev.productId == newDev.productId &&
          dev.serialNumber == newDev.serialNumber);
      if (!hasNewDev) {
        devs.push(newDev);
      }
    }
  } catch (err) {
    throw new UsbError(err, 'Unable to enumerate USB devices');
  }
  devs = devs.map(dev => new UsbDevice(dev));
  return devs;
}
