import * as proto from './proto';
import * as errors from './errors'

import * as usb from 'usb';
import * as async from 'async';
import * as _ from 'lodash';

import EventEmitter from 'events';

/**
 * Device types.
 */
export const DeviceType = {
  CORE: 'Core',
  PHOTON: 'Photon',
  P1: 'P1',
  ELECTRON: 'Electron',
  DUO: 'Duo'
};

// Particle USB devices
const USB_DEVICE_INFO = {
  // Core
  '1d50:607d': {
    type: DeviceType.CORE
  },
  '1d50:607f': {
    type: DeviceType.CORE,
    dfu: true
  },
  // Photon
  '2b04:c006': {
    type: DeviceType.PHOTON
  },
  '2b04:d006': {
    type: DeviceType.PHOTON,
    dfu: true
  },
  // P1
  '2b04:c008': {
    type: DeviceType.P1
  },
  '2b04:d008': {
    type: DeviceType.P1,
    dfu: true
  },
  // Electron
  '2b04:c00a': {
    type: DeviceType.ELECTRON
  },
  '2b04:d00a': {
    type: DeviceType.ELECTRON,
    dfu: true
  },
  // Duo
  '2b04:c058': {
    type: DeviceType.DUO
  },
  '2b04:d058': {
    type: DeviceType.DUO,
    dfu: true
  }
};

// Default backoff intervals
const DEFAULT_CHECK_INTERVALS = [100, 100, 250, 250, 500, 500, 1000]; // CHECK request

function backoffInterval(attempt, intervals) {
  if (attempt < intervals.length) {
    return intervals[attempt];
  }
  return intervals[intervals.length - 1];
}

/**
 * Predefined polling policies.
 */
export const PollingPolicy = {
  DEFAULT: n => backoffInterval(n, DEFAULT_CHECK_INTERVALS)
};

// Default options for DeviceBase.open()
const DEFAULT_OPEN_OPTIONS = {
  concurrentRequests: null // Maximum number of concurrent requests is limited by a device
};

// Default options for DeviceBase.close()
const DEFAULT_CLOSE_OPTIONS = {
  waitForPendingRequests: true, // Process pending requests before closing the device
  timeout: null // Wait until all requests are processed
};

// Default options for DeviceBase.sendRequest()
const DEFAULT_REQUEST_OPTIONS = {
  pollingPolicy: PollingPolicy.DEFAULT, // Polling policy
  timeout: 30000 // Request timeout
};

// Default options for DeviceBase.list()
const DEFAULT_LIST_OPTIONS = {
  includeDfu: true // Include devices which are in the DFU mode
};

// Helper function which is used to wrap the internal callback-based implementation into a
// Promise-based interface exposed by the DeviceBase class
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

// Dummy callback function
function noop() {
}

// Global configuration
let configOptions = {
  logger: { // Dummy logger
    trace: noop,
    info: noop,
    warn: noop,
    error: noop
  }
};

export class DeviceBase extends EventEmitter {
  constructor(usbDev, info) {
    super();
    this._usbDev = usbDev; // USB device object
    this._info = info; // Device info
    this._log = configOptions.logger; // Logger instance
    this._reqs = {}; // All known requests
    this._reqQueue = []; // Queue of unprocessed requests
    this._initQueue = []; // Queue of newly initiated requests to be checked
    this._checkQueue = []; // Queue of completely sent requests to be checked
    this._resetQueue = []; // Queue of active requests to be reset
    this._activeReqs = 0; // Number of active requests
    this._maxDevReqs = null; // Maximum number of concurrent requests supported by the device
    this._lastReqId = 0; // Last used request ID
    this._isOpen = false; // Set to true if the device is open
    this._closing = false; // Set to true if the device is being closed
    this._resetAll = false; // Set to true if all pending requests should be reset
    this._usbBusy = false; // Set to true if there's an activity on the USB connection
    this._id = null; // Cached device ID
  }

  /**
   * Open the device.
   * @param {Object} options Options.
   * @return {Promise}
   */
  open(options = DEFAULT_OPEN_OPTIONS) {
    return promisify(this._open.bind(this), options);
  }

  /**
   * Close the device.
   * @param {Object} options Options.
   * @return {Promise}
   */
  close(options = DEFAULT_CLOSE_OPTIONS) {
    return promisify(this._close.bind(this));
  }

  /**
   * Set to `true` if the device is open.
   */
  get isOpen() {
    return this._isOpen;
  }

  /**
   * Get the device ID.
   * @return {Promise}
   */
  getId() {
    return promisify(this._getId.bind(this));
  }

  /**
   * Get the firmware version.
   * @return {Promise}
   */
  getFirmwareVersion() {
    return promisify(this._getFirmwareVersion.bind(this));
  }

  /**
   * Send a USB request.
   * @param {Number} type Request type.
   * @param {String|Buffer} data Request data.
   * @param {Object} options Request options.
   * @return {Promise}
   */
  sendRequest(type, data = null, options = DEFAULT_REQUEST_OPTIONS) {
    return promisify(this._sendRequest.bind(this), type, data, options);
  }

  /**
   * Device type.
   */
  get type() {
    return this._info.type;
  }

  /**
   * Set to `true` if this is a Core device.
   */
  get isCore() {
    return (this.type == DeviceType.CORE);
  }

  /**
   * Set to `true` if this is a Photon device.
   */
  get isPhoton() {
    return (this.type == DeviceType.PHOTON);
  }

  /**
   * Set to `true` if this is a P1 device.
   */
  get isP1() {
    return (this.type == DeviceType.P1);
  }

  /**
   * Set to `true` if this is an Electron device.
   */
  get isElectron() {
    return (this.type == DeviceType.ELECTRON);
  }

  /**
   * Set to `true` if this is a Duo device.
   */
  get isDuo() {
    return (this.type == DeviceType.DUO);
  }

  /**
   * Set to `true` if this device is in the DFU mode.
   */
  get isInDfuMode() {
    return this._info.dfu;
  }

  /**
   * Enumerate Particle USB devices connected to the host.
   * @param {Object} options Options.
   * @return {Promise}
   */
  static list(options = DEFAULT_LIST_OPTIONS) {
    return promisify(DeviceBase._list, options);
  }

  /**
   * Open a device with the specified ID.
   * @param {String} id Device ID.
   * @param {Object} options Options.
   * @return {Promise}
   */
  static openById(id, options = DEFAULT_OPEN_OPTIONS) {
    return promisify(DeviceBase._openById, id, options);
  }

  /**
   * Set global options.
   * @param {Object} options Options.
   */
  static config(options) {
    Object.assign(configOptions, options);
  }

  // Internal implementation
  _open(options, cb) {
    if (this._isOpen) {
      return cb(new errors.StateError('Device is already open'));
    }
    try {
      this._usbDev.open();
    } catch (err) {
      return cb(new errors.UsbError(err.message));
    }
    this._maxDevReqs = options.concurrentRequestLimit;
    this._isOpen = true;
    cb();
  }

  _close(options, cb) {
    this._closeNow(); // FIXME
    cb();
  }

  _closeNow(err = null) {
    // Cancel pending requests
    if (!_.isEmpty(this._reqs)) {
      if (!err) {
        err = new errors.StateError("Device has been closed");
      }
      for (let id in this._reqs) {
        this._finishRequest(this._reqs[id], err);
      }
    }
    // Close USB device
    try {
      this._usbDev.close();
    } catch (err) {
      this._log.error(`Unable to close USB device: ${err.message}`);
    }
    // Reset device state
    this._reqs = {};
    this._reqQueue = [];
    this._initQueue = [];
    this._checkQueue = [];
    this._resetQueue = [];
    this._activeReqs = 0;
    this._maxDevReqs = null;
    this._isOpen = false;
    this._closing = false;
    this._resetAll = false;
    this._usbBusy = false;
    this._id = null;
  }

  _getId(cb) {
    // FIXME: Device can be busy with another operation
    const descr = this._usbDev.deviceDescriptor;
    this._usbDev.getStringDescriptor(descr.iSerialNumber, (err, id) => {
      if (err) {
        return cb(new errors.UsbError(err.message));
      }
      this._id = id.toLowerCase();
      cb(null, this._id);
    });
  }

  _getFirmwareVersion(cb) {
    cb(new Error('Not implemented')); // TODO
  }

  _sendRequest(type, data, options, cb) {
    const req = {
      id: ++this._lastReqId, // Internal request ID
      type: type,
      data: data,
      protoId: null, // Protocol request ID
      checkBackoff: (options.pollingPolicy || PollingPolicy.DEFAULT),
      checkTimer: null,
      checkCount: 0,
      reqTimer: null,
      callback: cb,
    };
    if (options.timeout) {
      // Start request timer
      req.reqTimer = setTimeout(() => {
        this._finishRequest(req, new errors.TimeoutError('Request has timed out'));
      }, options.timeout);
    }
    this._reqQueue[req.id] = req;
    this._process();
  }

  _process() {
    if (this._usbBusy) {
      return;
    }
    // Reset all requests
    if (this._resetAll) {
      this._resetAll = false;
      const setup = proto.resetRequest();
      return this._sendServiceRequest(setup, noop); // Ignore result
    }
    // Reset active request
    while (this._resetQueue.length > 0) {
      const req = this._reqs[this._resetQueue.shift()];
      if (req) {
        const setup = proto.resetRequest(req.protoId);
        return this._sendServiceRequest(setup, noop); // Ignore result
      }
    }
    // Check initiated request
    while (this._initQueue.length > 0) {
      const req = this._reqs[this._initQueue.shift()];
      if (req) {
        const setup = proto.checkRequest(req.protoId);
        return this._sendServiceRequest(setup, (err, srep) => {
          if (err) {
            return this._finishRequest(req, err);
          }
          if (srep.status == proto.Status.OK) {

          }

        });
      }
    }
    // Check completely sent request
    while (this._checkQueue.length > 0) {
      const id = this._checkQueue.shift();
      const req = this._reqs[id];
      if (!req) {
        continue;
      }
      const setup = proto.checkRequest(req.protoId);
      return this._sendServiceRequest(setup, (err, srep) => {

      });
    }
  }

  // Sends a service request and parses a reply data
  _sendServiceRequest(setup, cb) {
    this._transferIn(setup, (err, data) => {
      try {
        if (err) {
          throw err;
        }
        const srep = proto.parseReply(data);
        cb(null, srep);
      } catch (err) {
        cb(err);
      }
    });
  }

  // Performs an OUT control transfer
  _transferOut(setup, data, cb) {
    this._usbBusy = true;
    this._usbDev.controlTransfer(setup.bmRequestType, setup.bRequest, setup.wValue, setup.wIndex, data, (err) => {
      cb(err ? new errors.UsbError(err.message) : null);
      this._usbBusy = false;
      this._process();
    });
  }

  // Performs an IN control transfer
  _transferIn(setup, cb) {
    this._usbBusy = true;
    this._usbDev.controlTransfer(setup.bmRequestType, setup.bRequest, setup.wValue, setup.wIndex, setup.wLength, (err, data) => {
      cb(err ? new errors.UsbError(err.message) : null, data);
      this._usbBusy = false;
      this._process();
    })
  }

  _finishRequest(req, ...args) {
    if (req.checkTimer) {
      cancelTimeout(req.checkTimer);
      req.checkTimer = null;
    }
    if (req.reqTimer) {
      cancelTimeout(req.reqTimer);
      req.reqTimer = null;
    }
    if (req.protoId) {
      --this._activeReqs;
    }
    delete this._reqs[req.id];
    req.callback(...args);
  }

  static _list(options, cb) {
    let usbDevs = null; // Detected USB devices
    try {
      usbDevs = usb.getDeviceList();
    } catch (err) {
      return cb(err);
    }
    const devs = []; // Particle devices
    for (let usbDev of usbDevs) {
      const descr = usbDev.deviceDescriptor;
      const vendorId = descr.idVendor.toString(16);
      const productId = descr.idProduct.toString(16);
      const usbId = vendorId + ':' + productId;
      const info = USB_DEVICE_INFO[usbId];
      if (info && (!info.dfu || options.includeDfu)) {
        devs.push(new DeviceBase(usbDev, info));
      }
    }
    cb(null, devs);
  }

  static _openById(id, options, cb) {
    async.waterfall([
      // Get all Particle devices
      cb => {
        DeviceBase._list(DEFAULT_LIST_OPTIONS, cb);
      },
      // Find a device with the specified ID
      (devs, cb) => {
        let firstErr = null;
        async.detectLimit(devs, 4, (dev, cb) => { // Open up to 4 devices at once
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
              if (err && !firstErr) {
                firstErr = err; // Store the first error
              }
              // Close the device
              return dev._close(DEFAULT_CLOSE_OPTIONS, () => {
                cb(null, false);
              });
            }
            cb(null, true); // Device is found
          });
        }, (err, dev) => { // async.detectLimit()
          // Ignore encountered errors if the device has been found
          if (!dev) {
            return cb(firstErr ? firstErr : new errors.NotFoundError('Device is not found'));
          }
          cb(null, dev);
        });
      }
    ], cb); // async.waterfall()
  }
}
