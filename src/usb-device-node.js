import { UsbError } from './error';
import { globalOptions } from './config';

let usb = null;

try {
  usb = require('usb');
} catch (err) {
  // Ignore USB initialization errors when running in the Travis environment
  if (!process.env.TRAVIS) {
    throw err;
  }
}

export class UsbDevice {
  constructor(dev) {
    this._dev = dev;
    this._dev.timeout = 5000; // Use longer timeout for control transfers
    // There's no way to check if a device is open, so we're storing the state in an additional
    // property of the node-usb device object
    this._dev.particle = { isOpen: false };
    this._serialNum = null;
    this._log = globalOptions.log;
  }

  open() {
    return new Promise((resolve, reject) => {
      try {
        this._dev.open();
      } catch (err) {
        return reject(new UsbError(err, 'Unable to open USB device'));
      }
      // Get serial number string
      const descr = this._dev.deviceDescriptor;
      this._dev.getStringDescriptor(descr.iSerialNumber, (err, serialNum) => {
        if (err) {
          try {
            this._dev.close();
          } catch (err) {
            this._log.error(`Unable to close device: ${err.message}`);
            // Ignore error
          }
          return reject(new UsbError(err, 'Unable to get serial number descriptor'));
        }
        this._serialNum = serialNum;
        this._dev.particle.isOpen = true;
        resolve();
      });
    });
  }

  close() {
    return new Promise((resolve, reject) => {
      try {
        this._dev.close();
        this._dev.particle.isOpen = false;
      } catch (err) {
        return reject(new UsbError(err, 'Unable to close USB device'));
      }
      resolve();
    });
  }

  transferIn(setup) {
    return new Promise((resolve, reject) => {
      this._dev.controlTransfer(setup.bmRequestType, setup.bRequest, setup.wValue, setup.wIndex, setup.wLength, (err, data) => {
        if (err) {
          return reject(new UsbError(err, 'IN control transfer failed'));
        }
        resolve(data);
      });
    });
  }

  transferOut(setup, data) {
    return new Promise((resolve, reject) => {
      this._dev.controlTransfer(setup.bmRequestType, setup.bRequest, setup.wValue, setup.wIndex, data, err => {
        if (err) {
          return reject(new UsbError(err, 'OUT control transfer failed'));
        }
        resolve();
      });
    });
  }

  get isOpen() {
    return this._dev.particleUsb.isOpen;
  }

  get vendorId() {
    return this._dev.deviceDescriptor.idVendor;
  }

  get productId() {
    return this._dev.deviceDescriptor.idProduct;
  }

  get serialNumber() {
    return this._serialNum;
  }
}

export async function getUsbDevices(filters) {
  const log = globalOptions.log;
  // Validate the filtering options
  if (filters) {
    filters = filters.map(f => {
      if (f.productId && !f.vendorId) {
        throw new RangeError('Vendor ID is missing');
      }
      if (f.serialNumber) {
        // Filtering by serial number works in a case-insensitive manner. This is not necessarily
        // true for other backends
        f = Object.assign({}, f);
        f.serialNumber = f.serialNumber.toLowerCase();
      }
      return f;
    });
  } else {
    filters = [];
  }
  let devs = null;
  try {
    devs = usb.getDeviceList().map(dev => new UsbDevice(dev));
  } catch (err) {
    throw new UsbError(err, 'Unable to enumerate USB devices');
  }
  if (filters.length > 0) {
    // Filter the list of devices
    const filtDevs = [];
    for (let dev of devs) {
      let serialNum = null
      for (let f of filters) {
        if (f.vendorId && dev.vendorId != f.vendorId) {
          continue;
        }
        if (f.productId && dev.productId != f.productId) {
          continue;
        }
        if (f.serialNumber) {
          if (!serialNum) {
            // Open the device and get its serial number
            const wasOpen = dev.isOpen;
            if (!wasOpen) {
              try {
                await dev.open();
              } catch (e) {
                log.error(`Unable to open device: ${e.message}`);
                break;
              }
            }
            serialNum = dev.serialNumber.toLowerCase();
            // Don't close the device if it was opened elsewhere. node-usb caches device objects
            if (!wasOpen) {
              try {
                await dev.close();
              } catch (e) {
                log.error(`Unable to close device: ${e.message}`);
                break;
              }
            }
          }
          if (serialNum != f.serialNumber) {
            continue;
          }
        }
        filtDevs.push(dev);
        break;
      }
    }
    devs = filtDevs;
  }
  return devs;
}
