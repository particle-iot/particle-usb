import * as usb from 'usb';
import * as async from 'async';

// Particle USB devices
const USB_DEVICE_INFO = {
  // Core
  '1d50:607d': {
    type: 'Core'
  },
  '1d50:607f': {
    type: 'Core',
    dfu: true
  },
  // Photon
  '2b04:c006': {
    type: 'Photon'
  },
  '2b04:d006': {
    type: 'Photon',
    dfu: true
  },
  // P1
  '2b04:c008': {
    type: 'P1'
  },
  '2b04:d008': {
    type: 'P1',
    dfu: true
  },
  // Electron
  '2b04:c00a': {
    type: 'Electron'
  },
  '2b04:d00a': {
    type: 'Electron',
    dfu: true
  },
  // Duo
  '2b04:c058': {
    type: 'Duo'
  },
  '2b04:d058': {
    type: 'Duo',
    dfu: true
  }
};

// This function is used to wrap the internal implementation, which uses callbacks, into a Promise-
// based interface exposed by the Device class
function promisify(fn, ...fnArgs) {
  return new Promise((resolve, reject) => {
    fn(...fnArgs, (err, ...args) => {
      if (!err) {
        if (args.length > 1) {
          resolve(args); // Pass the callback arguments as an array
        } else {
          resolve(...args);
        }
      } else {
        reject(err);
      }
    });
  });
}

// Predefined polling policies
export const CheckInterval = {
  DEFAULT: n => { // Simple Fibonacci-alike backoff
    if (n <= 2) {
      return 100;
    } else if (n <= 4) {
      return 250;
    } else if (n <= 6) {
      return 500;
    } else {
      return 1000;
    }
  }
};

// Default options for Device.open()
const DEFAULT_OPEN_OPTIONS = {
  concurrentRequestLimit: null // Maximum number of concurrent requests
};

// Default options for Device.close()
const DEFAULT_CLOSE_OPTIONS = {
  waitForPendingRequests: true, // Whether to wait for pending requests
  timeout: null
};

// Default options for Device.sendRequest()
const DEFAULT_REQUEST_OPTIONS = {
  checkInterval: CheckInterval.DEFAULT,
  timeout: 30000,
  encoding: null
};

// Default options for Device.list()
const DEFAULT_LIST_OPTIONS = {
  includeDfu: true // Whether to include devices which are in the DFU mode
};

export default class Device {
  constructor(usbDev, info) {
    this._usbDev = usbDev;
    this._info = info;
    this._opts = null; // Options passed to Device.open()
    this._id = null; // Cached device ID
  }

  /**
   * Opens the device.
   * @param {Object} options Options.
   * @return {Promise}
   */
  open(options = DEFAULT_OPEN_OPTIONS) {
    return promisify(this._open.bind(this), options);
  }

  /**
   * Closes the device.
   * @param {Object} options Options.
   * @return {Promise}
   */
  close(options = DEFAULT_CLOSE_OPTIONS) {
    return promisify(this._close.bind(this));
  }

  /**
   * Retrieves the device ID.
   * @return {Promise}
   */
  getId() {
    return promisify(this._getId.bind(this));
  }

  /**
   * Retrieves the firmware version.
   * @return {Promise}
   */
  getFirmwareVersion() {
    return promisify(this._getFirmwareVersion.bind(this));
  }

  /**
   * Sends a USB request.
   * @param {Number} type Request type.
   * @param {String|Buffer} data Request data.
   * @param {Object} options Request options.
   * @return {Promise}
   */
  sendRequest(type, data = null, options = DEFAULT_REQUEST_OPTIONS) {
    return promisify(this._sendRequest.bind(this));
  }

  get type() {
    return this._info.type;
  }

  get isCore() {
    return (this.type == 'Core');
  }

  get isPhoton() {
    return (this.type == 'Photon');
  }

  get isP1() {
    return (this.type == 'P1');
  }

  get isElectron() {
    return (this.type == 'Electron');
  }

  get isDuo() {
    return (this.type == 'Duo');
  }

  /**
   * Returns `true` if the device is in the DFU mode.
   * @return {Boolean}
   */
  get isInDfuMode() {
    return this._info.dfu;
  }

  /**
   * Enumerates Particle USB devices connected to the host.
   * @param {Object} options Options.
   * @return {Promise}
   */
  static list(options = DEFAULT_LIST_OPTIONS) {
    return promisify(Device._list, options);
  }

  /**
   * Opens a device with the specified ID.
   * @param {String} id Device ID.
   * @param {Object} options Options.
   * @return {Promise}
   */
  static openById(id, options = DEFAULT_OPEN_OPTIONS) {
    return promisify(Device._openById, id, options);
  }

  // Internal implementation
  _open(options, cb) {
    this._opts = options;
    try {
      this._usbDev.open();
    } catch (err) {
      return cb(err);
    }
    cb();
  }

  _close(options, cb) {
    try {
      this._usbDev.close();
    } catch (err) {
      return cb(err);
    }
    cb();
  }

  _getId(cb) {
    const descr = this._usbDev.deviceDescriptor;
    this._usbDev.getStringDescriptor(descr.iSerialNumber, (err, id) => {
      if (err) {
        return cb(err);
      }
      this._id = id;
      cb(null, id);
    });
  }

  _sendRequest(type, data, options, cb) {
  }

  static _list(options, cb) {
    const devs = []; // Particle devices
    let usbDevs = null; // Detected USB devices
    try {
      usbDevs = usb.getDeviceList();
    } catch (err) {
      return cb(err);
    }
    for (let usbDev of usbDevs) {
      const descr = usbDev.deviceDescriptor;
      const vendorId = descr.idVendor.toString(16);
      const productId = descr.idProduct.toString(16);
      const usbId = vendorId + ':' + productId;
      const info = USB_DEVICE_INFO[usbId];
      if (info && (!info.dfu || options.includeDfu)) {
        devs.push(new Device(usbDev, info));
      }
    }
    cb(null, devs);
  }

  static _openById(id, options, cb) {
    async.waterfall([
      // Get all Particle devices
      cb => {
        Device._list(DEFAULT_LIST_OPTIONS, cb);
      },
      // Find a device with the specified ID
      (devs, cb) => {
        let findErr = null;
        async.detectLimit(devs, 5, (dev, cb) => { // Open up to 5 devices at once
          async.waterfall([
            // Open the device
            cb => {
              dev._open(options, cb);
            },
            // Get device ID
            cb => {
              dev._getId(cb);
            }
          ], (err, devId) => { // async.waterfall()
            if (err || (devId != id)) {
              if (err && !findErr) {
                findErr = err; // Store the first encountered error
              }
              // Close the device
              return dev._close(DEFAULT_CLOSE_OPTIONS, () => {
                cb(null, false);
              });
            }
            cb(null, true); // Device is found
          });
        }, (err, dev) => { // async.detectLimit()
          // Ignore errors if the device has been found
          if (!dev) {
            return cb(findErr ? findErr : new Error('Device is not found'));
          }
          cb(null, dev);
        });
      }
    ], cb); // async.waterfall()
  }
}
