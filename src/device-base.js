import * as proto from './proto';

import * as usb from 'usb';
import * as async from 'async';
import { VError } from 'verror';

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

// Default backoff intervals for the CHECK request
const DEFAULT_CHECK_INTERVALS = [100, 100, 250, 250, 500, 500, 1000];

function checkInterval(attempts, intervals) {
  if (attempts < intervals.length) {
    return intervals[attempts];
  }
  return intervals[intervals.length - 1];
}

/**
 * Predefined polling policies.
 */
export const PollingPolicy = {
  DEFAULT: n => checkInterval(n, DEFAULT_CHECK_INTERVALS)
};

// Default options for DeviceBase.open()
const DEFAULT_OPEN_OPTIONS = {
  concurrentRequests: null // Maximum number of concurrent requests is limited by a device
};

// Default options for DeviceBase.close()
const DEFAULT_CLOSE_OPTIONS = {
  processPendingRequests: true, // Process pending requests before closing the device
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

// Device state
const DeviceState = {
  CLOSED: 0,
  OPENING: 1,
  OPEN: 2,
  CLOSING: 3
};

// Request state
const RequestState = {
  NEW: 0, // New request
  ALLOC: 1, // Buffer allocation is pending
  PENDING: 2, // Request processing is pending
  DONE: 3 // Request processing is completed
};

// Low-level vendor requests (see ctrl_request_type enum defined in the firmware source code)
const VendorRequest = {
  SYSTEM_VERSION: 30, // Get system version
};

/**
 * Request result codes.
 */
export const RequestResult = {
  OK: 0
};

/**
 * Base class for all errors reported by DeviceBase.
 */
export class DeviceError extends VError {
  constructor(...args) {
    super(...args);
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Timeout error.
 */
export class TimeoutError extends DeviceError {
  constructor(...args) {
    super(...args);
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Error reported when a device has no enough memory to process a request.
 */
export class MemoryError extends DeviceError {
  constructor(...args) {
    super(...args);
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Internal error.
 */
export class InternalError extends DeviceError {
  constructor(...args) {
    super(...args);
    Error.captureStackTrace(this, this.constructor);
  }
}

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
  log: { // Dummy logger
    trace: noop,
    info: noop,
    warn: noop,
    error: noop
  }
};

/**
 * Base class for a Particle USB device.
 */
export class DeviceBase extends EventEmitter {
  constructor(usbDev, info) {
    super();
    this._usbDev = usbDev; // USB device object
    this._info = info; // Device info
    this._log = configOptions.log; // Logger instance
    this._state = DeviceState.CLOSED; // Device state
    this._reqs = new Map(); // All known requests
    this._reqQueue = []; // Unprocessed requests (array of request objects)
    this._checkQueue = []; // Active requests that need to be checked (array of request objects)
    this._resetQueue = []; // Active requests that need to be reset (array of protocol IDs)
    this._activeReqs = 0; // Number of active requests
    this._maxActiveReqs = null; // Maximum number of active requests
    this._lastReqId = 0; // Last used request ID
    this._closeTimer = null; // Timer for the closing operation
    this._closeMe = false; // Set to true if the device needs to be closed
    this._resetAllReqs = false; // Set to true if all requests need to be reset
    this._usbBusy = false; // Set to true if there's an activity on the USB connection
    this._fwVer = null; // Firmware version
    this._id = null; // Device ID
  }

  /**
   * Open the device.
   *
   * @param {Object} options Options.
   * @return {Promise}
   */
  open(options = DEFAULT_OPEN_OPTIONS) {
    return promisify(this._open.bind(this), options);
  }

  /**
   * Close the device.
   *
   * @param {Object} options Options.
   * @return {Promise}
   */
  close(options = DEFAULT_CLOSE_OPTIONS) {
    return promisify(this._close.bind(this), options);
  }

  /**
   * Set to `true` if the device is open.
   */
  get isOpen() {
    return (this._state != DeviceState.CLOSED);
  }

  /**
   * Device ID. Set to `null` if the device is not open.
   */
  get id() {
    return this._id;
  }

  /**
   * Firmware version. Set to `null` if the device is not open, or the version could not be determined.
   */
  get firmwareVersion() {
    return this._fwVer;
  }

  /**
   * Send a USB request.
   *
   * @param {Number} type Request type.
   * @param {Buffer|String} data Request data.
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
   * Underlying USB device object.
   *
   * @see https://github.com/tessel/node-usb#device
   */
  get usbDevice() {
    return this._usbDev;
  }

  /**
   * List Particle USB devices connected to the host.
   *
   * @param {Object} options Options.
   * @return {Promise}
   */
  static list(options = DEFAULT_LIST_OPTIONS) {
    return promisify(DeviceBase._list, options);
  }

  /**
   * Open a device with the specified ID.
   *
   * @param {String} id Device ID.
   * @param {Object} options Options.
   * @return {Promise}
   */
  static openById(id, options = DEFAULT_OPEN_OPTIONS) {
    return promisify(DeviceBase._openById, id, options);
  }

  /**
   * Set global options.
   *
   * @param {Object} options Options.
   */
  static config(options) {
    Object.assign(configOptions, options);
  }

  // Internal implementation
  _open(options, cb) {
    if (this._state != DeviceState.CLOSED) {
      return cb(new DeviceError('Device is already open'));
    }
    // Open USB device
    try {
      this._usbDev.open();
    } catch (err) {
      return cb(err);
    }
    this._state = DeviceState.OPENING;
    async.series([
      // Get device ID
      cb => this._getId(cb),
      // Get firmware version
      cb => this._getFirmwareVersion((err, ver) => cb(null, ver)) // Ignore error
    ], (err, result) => {
      if (err) {
        this._closeNow(new DeviceError(err, 'Unable to open device'));
        return cb(err);
      }
      this._id = result[0]; // Device ID
      this._fwVer = result[1]; // Firmware version
      this._maxActiveReqs = options.concurrentRequests;
      this._resetAllReqs = true; // Reset all requests remaining from a previous session
      this._state = DeviceState.OPEN;
      this.emit('open');
      this._process();
      cb();
    });
  }

  _close(options, cb) {
    if (this._state == DeviceState.CLOSED) {
      return cb();
    }
    // Check if pending requests need to be processed before closing the device
    if (!options.processPendingRequests) {
      this._cancelAllRequests(new DeviceError('Device is being closed'));
      if (this._closeTimer) {
        clearTimeout(this._closeTimer);
        this._closeTimer = null;
      }
    } else if (options.timeout && !this._closeMe) { // Timeout value cannot be overriden
      this._closeTimer = setTimeout(() => {
        this._cancelAllRequests(new DeviceError('Device is being closed'));
        this._process();
      }, options.timeout);
    }
    // Use EventEmitter's queue to invoke the callback
    this.once('closed', cb);
    this._closeMe = true;
    this._process();
  }

  _closeNow(err = null) {
    if (this._state != DeviceState.CLOSING && this._state != DeviceState.OPENING) {
      throw new InternalError('Unexpected device state');
    }
    // Cancel all requests
    if (this._reqs.size > 0) {
      if (!err) {
        err = new DeviceError('Device has been closed');
      }
      this._cancelAllRequests(err);
    }
    // Cancel timers
    if (this._closeTimer) {
      clearTimeout(this._closeTimer);
      this._closeTimer = null;
    }
    // Close USB device
    try {
      this._usbDev.close();
    } catch (err) {
      this._log.error(`Unable to close USB device: ${err.message}`);
    }
    // Reset device state
    this._state = DeviceState.CLOSED;
    this._closeMe = false;
    this._maxActiveReqs = null;
    this._fwVer = null;
    this.emit('closed');
  }

  _sendRequest(type, data, options, cb) {
    if (this._state == DeviceState.CLOSED) {
      return cb(new DeviceError('Device is not open'));
    }
    if (this._state == DeviceState.CLOSING || this._closeMe) {
      return cb(new DeviceError('Device is being closed'));
    }
    if (type < 0 || type > proto.MAX_REQUEST_TYPE) {
      return cb(new DeviceError('Invalid request type'));
    }
    const dataIsStr = (typeof data == 'string');
    if (dataIsStr) {
      data = Buffer.from(data);
    }
    if (data && data.length > proto.MAX_PAYLOAD_SIZE) {
      return cb(new DeviceError('Request data is too large'));
    }
    const req = {
      id: ++this._lastReqId, // Internal request ID
      type: type,
      data: data,
      hasTextData: dataIsStr,
      state: RequestState.NEW,
      protoId: null, // Protocol request ID
      checkInterval: (options.pollingPolicy || PollingPolicy.DEFAULT),
      checkTimer: null,
      checkCount: 0,
      reqTimer: null,
      callback: cb
    };
    if (options.timeout) {
      // Start request timer
      req.reqTimer = setTimeout(() => {
        this._finishRequest(req, new TimeoutError('Request timeout'));
        if (req.protoId) {
          // Notify the device that the request has been cancelled
          this._resetQueue.push(req.protoId);
          this._process();
        }
      }, options.timeout);
    }
    this._reqs.set(req.id, req);
    this._reqQueue.push(req);
    this._log.trace(`Request ${req.id}: Enqued`);
    this._process();
  }

  _cancelAllRequests(err) {
    this._reqs.forEach((req, id) => {
      this._finishRequest(req, err);
    });
    this._reqs.clear();
    this._reqQueue = [];
    this._checkQueue = [];
    this._resetQueue = [];
    if (this._activeReqs != 0) {
      this._activeReqs = 0;
      this._resetAllReqs = true;
    }
  }

  _finishRequest(req, ...args) {
    if (req.state == RequestState.DONE) {
      throw new InternalError('Unexpected request state');
    }
    if (req.checkTimer) {
      clearTimeout(req.checkTimer);
      req.checkTimer = null;
    }
    if (req.reqTimer) {
      clearTimeout(req.reqTimer);
      req.reqTimer = null;
    }
    if (req.protoId && --this._activeReqs < 0) {
      throw new InternalError('Invalid number of active requests');
    }
    req.data = null;
    req.state = RequestState.DONE;
    this._reqs.delete(req.id);
    this._log.trace(`Request ${req.id}: Completed`);
    req.callback(...args);
  }

  // TODO: Refactor this method into a few smaller ones
  _process() {
    if (this._state == DeviceState.CLOSED || this._state == DeviceState.OPENING || this._usbBusy) {
      return;
    }
    if (this._closeMe) {
      this._state = DeviceState.CLOSING;
    }
    // Reset all requests
    if (this._resetAllReqs) {
      this._log.trace('Sending RESET');
      const setup = proto.resetRequest();
      return this._sendServiceRequest(setup, () => { // Ignore result
        this._resetAllReqs = false;
      });
    }
    // Reset next request
    if (this._resetQueue.length > 0) {
      const protoId = this._resetQueue.shift();
      this._log.trace('Sending RESET, protocol ID: ${protoId}');
      const setup = proto.resetRequest(protoId);
      return this._sendServiceRequest(setup, noop); // Ignore result
    }
    // Check next request
    while (this._checkQueue.length > 0) {
      const req = this._checkQueue.shift();
      if (req.state == RequestState.DONE) {
        continue; // Cancelled request
      }
      this._log.trace(`Request ${req.id}: Sending CHECK (${req.checkCount + 1})`);
      const setup = proto.checkRequest(req.protoId);
      return this._sendServiceRequest(setup, (err, srep) => {
        if (this._isRequestFailed(req, err)) {
          return;
        }
        this._log.trace(`Request ${req.id}: Received service reply, status: ${srep.status}`);
        switch (srep.status) {
          case proto.Status.OK: {
            ++req.checkCount;
            if (req.state == RequestState.PENDING) {
              // Request processing is finished
              const rep = {
                result: srep.result || RequestResult.OK
              };
              if (srep.size) {
                // Receive payload data
                this._log.trace(`Request ${req.id}: Sending RECV`);
                const setup = proto.recvRequest(req.protoId, srep.size);
                this._transferIn(setup, (err, data) => {
                  if (this._isRequestFailed(req, err)) {
                    return;
                  }
                  this._log.trace(`Request ${req.id}: Received payload data`);
                  if (req.hasTextData) {
                    data = data.toString();
                  }
                  rep.data = data;
                  this._finishRequest(req, null, rep);
                })
              } else {
                this._finishRequest(req, null, rep); // No reply data
              }
            } else if (req.state == RequestState.ALLOC) {
              // Buffer allocation is completed, send payload data
              this._log.trace(`Request ${req.id}: Sending SEND`);
              const setup = proto.sendRequest(req.protoId, req.data.length);
              this._transferOut(setup, req.data, (err) => {
                if (this._isRequestFailed(req, err)) {
                  return;
                }
                this._log.trace(`Request ${req.id}: Sent payload data`);
                // Update request state
                req.state = RequestState.PENDING;
                req.checkCount = 0; // Reset check counter
                this._startCheckTimer(req);
              });
            } else {
              this._finishRequest(req, new InternalError('Unexpected request state'));
            }
            break;
          }
          case proto.Status.PENDING: {
            ++req.checkCount;
            this._startCheckTimer(req);
            break;
          }
          case proto.Status.NO_MEMORY: {
            this._finishRequest(req, new MemoryError('Memory allocation error'));
            break;
          }
          case proto.Status.NOT_FOUND: {
            this._finishRequest(req, new DeviceError('Request has been cancelled'));
            break;
          }
          default: {
            this._log.error(`Unknown status code: ${srep.status}`);
            this._finishRequest(req, new InternalError('Unknown status code'));
            break;
          }
        }
      });
    }
    // Send next request
    if (!this._maxActiveReqs || this._activeReqs < this._maxActiveReqs) {
      while (this._reqQueue.length > 0) {
        const req = this._reqQueue.shift();
        if (req.state == RequestState.DONE) {
          continue; // Cancelled request
        }
        this._log.trace(`Request ${req.id}: Sending INIT`);
        const setup = proto.initRequest(req.type, req.data ? req.data.length : 0);
        return this._sendServiceRequest(setup, (err, srep) => {
          if (this._isRequestFailed(req, err)) {
            return;
          }
          this._log.trace(`Request ${req.id}: Received service reply, status: ${srep.status}`);
          switch (srep.status) {
            case proto.Status.OK: {
              ++this._activeReqs;
              req.protoId = srep.id;
              this._log.trace(`Request ${req.id}: Protocol ID: ${req.protoId}`);
              if (req.data && req.data.length > 0) {
                // Send payload data
                this._log.trace(`Request ${req.id}: Sending SEND`);
                const setup = proto.sendRequest(req.protoId, req.data.length);
                this._transferOut(setup, req.data, (err) => {
                  if (this._isRequestFailed(req, err)) {
                    return;
                  }
                  this._log.trace(`Request ${req.id}: Sent payload data`);
                  // Request processing is pending
                  req.state = RequestState.PENDING;
                  this._startCheckTimer(req);
                });
              } else {
                // Request processing is pending
                req.state = RequestState.PENDING;
                this._startCheckTimer(req);
              }
              break;
            }
            case proto.Status.PENDING: {
              ++this._activeReqs;
              req.protoId = srep.id;
              this._log.trace(`Request ${req.id}: Protocol ID: ${req.protoId}`);
              if (req.data && req.data.length > 0) {
                // Buffer allocation is pending
                req.state = RequestState.ALLOC;
                this._startCheckTimer(req);
              } else {
                this._log.error(`Unexpected status code: ${srep.status}`);
                this._finishRequest(req, new InternalError('Unexpected status code'));
              }
              break;
            }
            case proto.Status.BUSY: {
              // Update maximum number of active requests
              this._maxActiveReqs = this._activeReqs;
              // Return request back to queue
              this._reqQueue.unshift(req);
              break;
            }
            case proto.Status.NO_MEMORY: {
              this._finishRequest(req, new MemoryError('Memory allocation error'));
              break;
            }
            default: {
              this._finishRequest(req, new InternalError('Unknown status code'));
              break;
            }
          }
        });
      }
    }
    // Nothing more to do, close the device if necessary
    if (this._state == DeviceState.CLOSING) {
      this._closeNow();
    }
  }

  _startCheckTimer(req) {
    let timeout = req.checkInterval;
    if (typeof timeout == 'function') {
      timeout = timeout(req.checkCount);
    }
    setTimeout(() => {
      this._checkQueue.push(req);
      this._process();
    }, timeout);
  }

  _isRequestFailed(req, err) {
    if (req.state == RequestState.DONE) {
      return true;
    }
    if (err) {
      this._finishRequest(req, err);
      return true;
    }
    return false;
  }

  // Sends a service request and parses a reply data
  _sendServiceRequest(setup, cb) {
    this._transferIn(setup, (err, data) => {
      if (err) {
        return cb(err);
      }
      let srep = null;
      try {
        srep = proto.parseReply(data);
      } catch (err) {
        return cb(new DeviceError(err, 'Invalid service reply'));
      }
      cb(null, srep);
    });
  }

  // Performs an OUT control transfer
  _transferOut(setup, data, cb) {
    this._usbBusy = true;
    this._usbDev.controlTransfer(setup.bmRequestType, setup.bRequest, setup.wValue, setup.wIndex, data, (err) => {
      this._usbBusy = false;
      if (err) {
        err = new DeviceError(err, 'OUT control transfer failed');
      }
      cb(err);
      this._process();
    });
  }

  // Performs an IN control transfer
  _transferIn(setup, cb) {
    this._usbBusy = true;
    this._usbDev.controlTransfer(setup.bmRequestType, setup.bRequest, setup.wValue, setup.wIndex, setup.wLength, (err, data) => {
      this._usbBusy = false;
      if (err) {
        err = new DeviceError(err, 'IN control transfer failed');
      }
      cb(err, data);
      this._process();
    })
  }

  _getId(cb) {
    const descr = this._usbDev.deviceDescriptor;
    this._usbDev.getStringDescriptor(descr.iSerialNumber, (err, id) => {
      if (err) {
        return cb(new DeviceError(err, 'Unable to get serial number descriptor'));
      }
      this._id = id.toLowerCase();
      cb(null, this._id);
    });
  }

  _getFirmwareVersion(cb) {
    this._usbDev.controlTransfer(proto.BmRequestType.DEVICE_TO_HOST, proto.PARTICLE_BREQUEST, 0,
        VendorRequest.SYSTEM_VERSION, proto.MIN_WLENGTH, (err, data) => {
      if (err) {
        return cb(new DeviceError(err, 'Unable to query firmware version'));
      }
      cb(null, data.toString());
    });
  }

  static _list(options, cb) {
    let usbDevs = null; // Detected USB devices
    try {
      usbDevs = usb.getDeviceList();
    } catch (err) {
      return cb(new DeviceError(err, 'Unable to enumerate USB devices'));
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
      cb => DeviceBase._list(DEFAULT_LIST_OPTIONS, cb),
      // Find a device with the specified ID
      (devs, cb) => async.detectLimit(devs, 4, (dev, cb) => { // Open up to 4 devices at once
        // Open the device
        dev._open(options, (err) => {
          if (err) {
            return cb(null, false); // Ignore error
          } else if (dev.id == id) {
            return cb(null, true); // Device is found
          } else {
            return dev._close(DEFAULT_CLOSE_OPTIONS, () => cb(null, false)); // Close the device
          }
        });
      }, (err, dev) => { // async.detectLimit()
        if (!dev) {
          return cb(new DeviceError('Device is not found or cannot be opened'));
        }
        cb(null, dev);
      })
    ], cb); // async.waterfall()
  }
}
