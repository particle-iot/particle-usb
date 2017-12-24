import { UsbError } from './error';

import * as usb from 'usb';

export class Device {
  constructor(dev) {
    this._dev = dev;
    this._dev.timeout = 5000; // Use longer timeout for control transfers
    this._serialNum = null;
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
            // Ignore error
          }
          return reject(new UsbError(err, 'Unable to get serial number descriptor'));
        }
        this._serialNum = serialNum;
        resolve();
      });
    });
  }

  close() {
    return new Promise((resolve, reject) => {
      try {
        this._dev.close();
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

export function getDevices() {
  return new Promise((resolve, reject) => {
    let devs = null;
    try {
      devs = usb.getDeviceList();
    } catch (err) {
      return reject(new UsbError(err, 'Unable to enumerate USB devices'));
    }
    devs = devs.map(dev => new Device(dev));
    resolve(devs);
  });
}
