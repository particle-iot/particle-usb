import { getUsbDevices, MAX_CONTROL_TRANSFER_DATA_SIZE } from './usb-device-node';
import * as proto from './usb-protocol';
import { DeviceType, DEVICES } from './device-type';
import { DeviceError, NotFoundError, StateError, TimeoutError, MemoryError, ProtocolError, assert } from './error';
import { globalOptions } from './config';
import { Dfu } from './dfu';

import EventEmitter from 'events';

// Device descriptions arranged by vendor/product IDs
const DEVICE_INFO = DEVICES.reduce((obj, dev) => {
	dev = Object.assign({}, dev);
	const ids = dev.usbIds;
	delete dev.usbIds;
	const dfuIds = dev.dfuUsbIds;
	delete dev.dfuUsbIds;
	if (!(ids.vendorId in obj)) {
		obj[ids.vendorId] = {};
	}
	obj[ids.vendorId][ids.productId] = Object.assign({ dfu: false }, dev);
	if (!(dfuIds.vendorId in obj)) {
		obj[dfuIds.vendorId] = {};
	}
	obj[dfuIds.vendorId][dfuIds.productId] = Object.assign({ dfu: true }, dev);
	return obj;
}, {});

function deviceInfoForUsbIds(vendorId, productId) {
	let info = DEVICE_INFO[vendorId];
	if (info) {
		info = info[productId];
	}
	return info;
}

// Default backoff intervals for the CHECK service request
const DEFAULT_CHECK_INTERVALS = [50, 50, 100, 100, 250, 250, 500, 500, 1000];

function checkInterval(attempts, intervals) {
	if (attempts < intervals.length) {
		return intervals[attempts];
	}
	return intervals[intervals.length - 1];
}

/**
 * Predefined polling policies.
 *
 * @enum {Function}
 */
export const PollingPolicy = {
	/** Default polling policy. */
	DEFAULT: n => checkInterval(n, DEFAULT_CHECK_INTERVALS)
};

// Device state
const DeviceState = {
	CLOSED: 0,
	OPENING: 1,
	OPEN: 2,
	CLOSING: 3
};

// Low-level vendor requests as defined by the firmware's ctrl_request_type enum
const VendorRequest = {
	SYSTEM_VERSION: 30 // Get system version
};

// Dummy callback function
function ignore() {
}

/**
 * Base class for a Particle USB device.
 *
 * This class is not meant to be instantiated directly. Use {@link getDevices} and
 * {@link openDeviceById} to create device instances.
 */
export class DeviceBase extends EventEmitter {
	constructor(dev, info) {
		super();
		this._dev = dev; // USB device handle
		this._info = info; // Device info
		this._log = globalOptions.log; // Logger instance
		this._state = DeviceState.CLOSED; // Device state
		this._reqs = new Map(); // All known requests
		this._reqQueue = []; // Unprocessed requests
		this._checkQueue = []; // Active requests that need to be checked
		this._resetQueue = []; // Active requests that need to be reset
		this._activeReqs = 0; // Number of active requests
		this._maxActiveReqs = null; // Maximum number of active requests
		this._lastReqId = 0; // Last used request ID
		this._closeTimer = null; // Timer for the closing operation
		this._wantClose = false; // Set to true if the device needs to be closed
		this._resetAllReqs = false; // Set to true if all requests need to be reset
		this._busy = false; // Set to true if there's an activity on the USB connection
		this._fwVer = null; // Firmware version
		this._id = null; // Device ID
		this._dfu = null; // DFU class implementation
	}

	/**
	 * Open the device.
	 *
	 * @param {Object} [options] Options.
	 * @param {Number} [options.concurrentRequests] Maximum number of requests that can be sent to the
	 *        device concurrently. Requests that exceed this limit are queued. By default, this parameter
	 *        is set to the maximum number of concurrent requests supported by the device.
	 * @return {Promise}
	 */
	open(options) {
		options = Object.assign({
			concurrentRequests: null // The maximum number of concurrent requests is limited by the device
		}, options);
		if (this._state !== DeviceState.CLOSED) {
			return Promise.reject(new StateError('Device is already open'));
		}
		// Open USB device
		this._log.trace('Opening device');
		this._state = DeviceState.OPENING;
		return this._dev.open().then(() => {
			// Normalize the device ID string
			this._id = this._dev.serialNumber.replace(/[^\x20-\x7e]/g, '').toLowerCase();
			this._log.trace(`Device ID: ${this._id}`);

			// Get firmware version
			return this._getFirmwareVersion().then(ver => {
				this._fwVer = ver;
				this._log.trace(`Firmware version: ${this._fwVer}`);
			}).catch(err => {
				// Pre-0.6.0 firmwares and devices in DFU mode don't support the firmware version request
				if (!this._info.dfu) {
					this._log.trace(`Unable to get firmware version: ${err.message}`);
				}
			});
		}).then(() => {
			if (this._info.dfu) {
				this._dfu = new Dfu(this._dev, this._log);
				return this._dfu.open(options);
			}
		}).then(() => {
			this._log.trace('Device is open');
			this._maxActiveReqs = options.concurrentRequests;
			this._resetAllReqs = true; // Reset all requests remaining from a previous session
			this._state = DeviceState.OPEN;
			this.emit('open');
			this._process();
		}).catch(err => {
			return this._close(err).catch(ignore).then(() => {
				throw err;
			});
		});
	}

	/**
	 * Close the device.
	 *
	 * @param {Object} [options] Options.
	 * @param {Boolean} [options.processPendingRequests=true] Whether to complete processing of the
	 *        pending requests before closing the device.
	 * @param {Number} [options.timeout] Timeout for processing pending requests (milliseconds).
	 *        By default, the device is kept open until all requests are processed.
	 * @return {Promise}
	 */
	close(options) {
		options = Object.assign({
			processPendingRequests: true, // Process pending requests before closing the device
			timeout: null // Wait until all requests are processed
		}, options);
		if (this._state === DeviceState.CLOSED) {
			return Promise.resolve();
		}
		// Check if pending requests need to be processed before closing the device
		if (!options.processPendingRequests) {
			this._rejectAllRequests(new StateError('Device is being closed'));
			if (this._closeTimer) {
				clearTimeout(this._closeTimer);
				this._closeTimer = null;
			}
		} else if (options.timeout && !this._wantClose) { // Timeout cannot be overriden
			this._closeTimer = setTimeout(() => {
				this._rejectAllRequests(new StateError('Device is being closed'));
				this._process();
			}, options.timeout);
		}
		return new Promise((resolve) => {
			// Use EventEmitter's queue to resolve the promise
			this.once('closed', () => {
				resolve();
			});
			this._wantClose = true;
			this._process();
		});
	}

	/**
	 * Send a control request to the device.
	 *
	 * @param {Number} type Request type.
	 * @param {Buffer|String} data Request data.
	 * @param {Object} [options] Request options.
	 * @param {Function|Number} [options.pollingPolicy=PollingPolicy.DEFAULT] Request polling policy.
	 *        This parameter specifies how frequently the device will be polled to determine the result
	 *        of the request. The argument can either be a function that returns the number of milliseconds
	 *        to wait before polling the device again or a number that specifies a fixed interval.
	 * @param {Number} [options.timeout] Request timeout. The default timeout can be configured via
	 *        {@link config}.
	 * @return {Promise<Object>} Response object.
	 */
	sendControlRequest(type, data, options) {
		options = Object.assign({
			pollingPolicy: PollingPolicy.DEFAULT, // Polling policy
			timeout: globalOptions.requestTimeout // Request timeout
		}, options);
		return new Promise((resolve, reject) => {
			if (this._state === DeviceState.CLOSED) {
				throw new StateError('Device is not open');
			}
			if (this._state === DeviceState.CLOSING || this._wantClose) {
				throw new StateError('Device is being closed');
			}
			if (type < 0 || type > proto.MAX_REQUEST_TYPE) {
				throw new RangeError('Invalid request type');
			}
			const dataIsStr = (typeof data === 'string');
			if (dataIsStr) {
				data = Buffer.from(data);
			}
			if (data && data.length > proto.MAX_PAYLOAD_SIZE) {
				throw new RangeError('Request data is too large');
			}
			const req = {
				id: ++this._lastReqId, // Internal request ID
				type: type,
				data: data,
				dataIsStr: dataIsStr,
				dataSent: false,
				protoId: null, // Protocol request ID
				checkInterval: options.pollingPolicy,
				checkIntervalIsFunc: (typeof options.pollingPolicy === 'function'),
				checkTimer: null,
				checkCount: 0,
				reqTimer: null,
				resolve: resolve,
				reject: reject,
				done: false
			};
			if (options.timeout) {
				// Start request timer
				req.reqTimer = setTimeout(() => {
					this._rejectRequest(req, new TimeoutError('Request timeout'));
					this._process();
				}, options.timeout);
			}
			this._reqs.set(req.id, req);
			this._reqQueue.push(req);
			this._log.trace(`Request ${req.id}: Enqueued`);
			this._process();
		});
	}

	/**
	 * Perform the system reset.
	 *
	 * This method only works in DFU mode.
	 *
	 * @return {Promise}
	 */
	async reset() {
		if (this._dfu) {
			return this._dfu.leave();
		}
		throw new StateError();
	}

	/**
	 * Set to `true` if the device is open.
	 */
	get isOpen() {
		return (this._state !== DeviceState.CLOSED);
	}

	/**
	 * Device ID.
	 *
	 * This property is set to `null` if the device is closed.
	 */
	get id() {
		return this._id;
	}

	/**
	 * Device OS system version.
	 *
	 * This property is set to `null` if the device is closed or the version could not be determined.
	 */
	get firmwareVersion() {
		return this._fwVer;
	}

	/**
	 * Device type (see {@link DeviceType}).
	 */
	get type() {
		return this._info.type;
	}

	/**
	 * Platform ID.
	 */
	get platformId() {
		return this._info.platformId;
	}

	/**
	 * Set to `true` if this is a Core device.
	 */
	get isCore() {
		return (this.type === DeviceType.CORE);
	}

	/**
	 * Set to `true` if this is a Photon device.
	 */
	get isPhoton() {
		return (this.type === DeviceType.PHOTON);
	}

	/**
	 * Set to `true` if this is a P1 device.
	 */
	get isP1() {
		return (this.type === DeviceType.P1);
	}

	/**
	 * Set to `true` if this is an Electron device.
	 */
	get isElectron() {
		return (this.type === DeviceType.ELECTRON);
	}

	/**
	 * Set to `true` if this is a RedBear Duo device.
	 */
	get isDuo() {
		return (this.type === DeviceType.DUO);
	}

	/**
	 * Set to `true` if this is a Xenon device.
	 */
	get isXenon() {
		return (this.type === DeviceType.XENON);
	}

	/**
	 * Set to `true` if this is an Argon device.
	 */
	get isArgon() {
		return (this.type === DeviceType.ARGON);
	}

	/**
	 * Set to `true` if this is a Boron device.
	 */
	get isBoron() {
		return (this.type === DeviceType.BORON);
	}

	/**
	 * USB vendor ID.
	 */
	get vendorId() {
		return this._dev.vendorId;
	}

	/**
	 * USB product ID.
	 */
	get productId() {
		return this._dev.productId;
	}

	/**
	 * Set to `true` if this device is in the DFU mode.
	 */
	get isInDfuMode() {
		return this._info.dfu;
	}

	/**
	 * Internal USB device handle.
	 */
	get usbDevice() {
		return this._dev;
	}

	_process() {
		if (this._state === DeviceState.CLOSED || this._state === DeviceState.OPENING || this._busy) {
			return;
		}
		if (this._wantClose && this._state !== DeviceState.CLOSING) {
			this._log.trace('Closing device');
			this._state = DeviceState.CLOSING;
		}
		if (this._resetAllRequests()) {
			return;
		}
		if (this._resetNextRequest()) {
			return;
		}
		if (this._checkNextRequest()) {
			return;
		}
		if (this._sendNextRequest()) {
			return;
		}
		if (this._state === DeviceState.CLOSING && this._activeReqs === 0) {
			this._close();
		}
	}

	_resetAllRequests() {
		if (!this._resetAllReqs) {
			return false;
		}
		this._log.trace('Sending RESET');
		assert(!this._busy);
		this._busy = true;
		const setup = proto.resetRequest();
		this._sendServiceRequest(setup).catch(ignore).then(() => { // Ignore result
			this._resetAllReqs = false;
			this._activeReqs = 0;
		}).finally(() => {
			this._busy = false;
			this._process();
		});
		return true;
	}

	_resetNextRequest() {
		if (this._resetQueue.length === 0) {
			return false;
		}
		const req = this._resetQueue.shift();
		this._log.trace(`Request ${req.id}: Sending RESET`);
		assert(!this._busy && req.protoId);
		this._busy = true;
		const setup = proto.resetRequest(req.protoId);
		this._sendServiceRequest(setup).catch(ignore).then(() => { // Ignore result
			assert(--this._activeReqs >= 0);
		}).finally(() => {
			this._busy = false;
			this._process();
		});
		return true;
	}

	_checkNextRequest() {
		let req = null;
		while (this._checkQueue.length !== 0) {
			const r = this._checkQueue.shift();
			if (!r.done) { // Skip cancelled requests
				req = r;
				break;
			}
		}
		if (!req) {
			return false;
		}
		this._log.trace(`Request ${req.id}: Sending CHECK (${req.checkCount})`);
		assert(!this._busy && req.protoId);
		this._busy = true;
		const setup = proto.checkRequest(req.protoId);
		this._sendServiceRequest(setup).then(srep => {
			this._log.trace(`Request ${req.id}: Status: ${srep.status}`);
			switch (srep.status) {
				case proto.Status.OK: {
					if (req.dataSent) {
						// Request processing is completed
						const rep = {
							result: srep.result
						};
						if (srep.size) {
							// Receive payload data
							return this._recvReplyData(req, srep.size).then(data => {
								rep.data = req.dataIsStr ? data.toString() : data;
								this._resolveRequest(req, rep);
							});
						} else {
							this._resolveRequest(req, rep); // No reply data
						}
					} else {
						// Buffer allocation is completed, send payload data
						return this._sendRequestData(req).then(() => {
							req.dataSent = true;
							req.checkCount = 0; // Reset check counter
							this._startCheckTimer(req);
						});
					}
					break;
				}
				case proto.Status.PENDING: {
					this._startCheckTimer(req);
					break;
				}
				case proto.Status.NO_MEMORY: {
					throw new MemoryError('Memory allocation error');
				}
				case proto.Status.NOT_FOUND: {
					throw new DeviceError('Request was cancelled');
				}
				default: {
					throw new ProtocolError(`Unknown status code: ${srep.status}`);
				}
			}
		}).catch(err => {
			this._rejectRequest(req, err);
		}).finally(() => {
			this._busy = false;
			this._process();
		});
		return true;
	}

	_sendNextRequest() {
		if (this._maxActiveReqs && this._activeReqs >= this._maxActiveReqs) {
			return false;
		}
		let req = null;
		while (this._reqQueue.length !== 0) {
			const r = this._reqQueue.shift();
			if (!r.done) { // Skip cancelled requests
				req = r;
				break;
			}
		}
		if (!req) {
			return false;
		}
		this._log.trace(`Request ${req.id}: Sending INIT`);
		assert(!this._busy);
		this._busy = true;
		const setup = proto.initRequest(req.type, req.data ? req.data.length : 0);
		this._sendServiceRequest(setup).then(srep => {
			this._log.trace(`Request ${req.id}: Status: ${srep.status}`);
			if (srep.status === proto.Status.OK || srep.status === proto.Status.PENDING) {
				req.protoId = srep.id;
				++this._activeReqs;
				this._log.trace(`Request ${req.id}: Protocol ID: ${req.protoId}`);
			}
			switch (srep.status) {
				case proto.Status.OK: {
					if (req.data && req.data.length > 0) {
						// Send payload data
						return this._sendRequestData(req).then(() => {
							req.dataSent = true;
							this._startCheckTimer(req);
						});
					} else {
						req.dataSent = true; // No payload data
						this._startCheckTimer(req);
					}
					break;
				}
				case proto.Status.PENDING: {
					if (!req.data || req.data.length === 0) {
						throw new ProtocolError(`Unexpected status code: ${srep.status}`);
					}
					// Buffer allocation is pending
					this._startCheckTimer(req);
					break;
				}
				case proto.Status.BUSY: {
					// Update maximum number of active requests
					this._maxActiveReqs = this._activeReqs;
					// Return the request back to queue
					this._reqQueue.unshift(req);
					break;
				}
				case proto.Status.NO_MEMORY: {
					throw new MemoryError('Memory allocation error');
				}
				default: {
					throw new ProtocolError(`Unknown status code: ${srep.status}`);
				}
			}
		}).catch(err => {
			this._rejectRequest(req, err);
		}).finally(() => {
			this._busy = false;
			this._process();
		});
		return true;
	}

	_sendRequestData(req) {
		assert(req.data && req.data.length > 0);
		let offs = 0;
		const sendNextChunk = () => {
			const chunkSize = Math.min(MAX_CONTROL_TRANSFER_DATA_SIZE, req.data.length - offs);
			const chunk = req.data.slice(offs, offs + chunkSize);
			this._log.trace(`Request ${req.id}: Sending SEND`);
			const setup = proto.sendRequest(req.protoId, chunkSize);
			return this._dev.transferOut(setup, chunk).then(() => {
				this._log.trace(`Request ${req.id}: Sent ${chunkSize} bytes`);
				offs += chunkSize;
				if (offs < req.data.length) {
					if (req.done) {
						throw new Error('Control transfer cancelled');
					}
					return sendNextChunk();
				}
			});
		};
		return sendNextChunk();
	}

	_recvReplyData(req, size) {
		assert(size > 0);
		const buf = Buffer.alloc(size);
		let offs = 0;
		const recvNextChunk = () => {
			const chunkSize = Math.min(MAX_CONTROL_TRANSFER_DATA_SIZE, size - offs);
			this._log.trace(`Request ${req.id}: Sending RECV`);
			const setup = proto.recvRequest(req.protoId, chunkSize);
			return this._dev.transferIn(setup).then(data => {
				this._log.trace(`Request ${req.id}: Received ${data.length} bytes`);
				if (data.length !== chunkSize) {
					throw new Error('Unexpected size of the control transfer');
				}
				data.copy(buf, offs);
				offs += chunkSize;
				if (offs < size) {
					if (req.done) {
						throw new Error('Control transfer cancelled');
					}
					return recvNextChunk();
				}
				return buf;
			});
		};
		return recvNextChunk();
	}

	_close(err = null) {
		assert(!this._busy);
		// Cancel all requests
		if (this._reqs.size !== 0) {
			if (!err) {
				err = new StateError('Device has been closed');
			}
			this._rejectAllRequests(err);
		}
		this._activeReqs = 0;
		this._resetAllReqs = false;
		// Cancel timers
		if (this._closeTimer) {
			clearTimeout(this._closeTimer);
			this._closeTimer = null;
		}

		let p = Promise.resolve();
		if (this._dfu) {
			p = p.then(() => this._dfu.close()).catch(err => {
				this._log.warn(`Unable to close DFU interface: ${err.message}`);
			});
		}
		// Close USB device
		return p.then(() => this._dev.close()).catch(err => {
			this._log.warn(`Unable to close USB device: ${err.message}`);
		}).then(() => {
			// Reset device state
			const emitEvent = (this._state === DeviceState.CLOSING);
			this._state = DeviceState.CLOSED;
			this._wantClose = false;
			this._maxActiveReqs = null;
			this._fwVer = null;
			this._id = null;
			if (emitEvent) {
				this.emit('closed');
			}
		});
	}

	_rejectAllRequests(err) {
		this._reqs.forEach(req => {
			this._rejectRequest(req, err);
		});
		this._reqQueue = [];
		this._checkQueue = [];
		this._resetQueue = [];
		if (this._activeReqs > 0) {
			this._resetAllReqs = true;
		}
	}

	_rejectRequest(req, err) {
		if (req.done) {
			return;
		}
		this._log.trace(`Request ${req.id}: Failed: ${err.message}`);
		this._clearRequest(req);
		if (req.protoId) {
			this._resetQueue.push(req);
		}
		req.reject(err);
	}

	_resolveRequest(req, rep) {
		if (req.done) {
			return;
		}
		this._log.trace(`Request ${req.id}: Completed`);
		this._clearRequest(req);
		assert(--this._activeReqs >= 0);
		req.resolve(rep);
	}

	_clearRequest(req) {
		if (req.checkTimer) {
			clearTimeout(req.checkTimer);
			req.checkTimer = null;
		}
		if (req.reqTimer) {
			clearTimeout(req.reqTimer);
			req.reqTimer = null;
		}
		this._reqs.delete(req.id);
		req.done = true;
	}

	_startCheckTimer(req) {
		let timeout = req.checkInterval;
		if (req.checkIntervalIsFunc) {
			timeout = timeout(req.checkCount);
		}
		++req.checkCount;
		setTimeout(() => {
			this._checkQueue.push(req);
			this._process();
		}, timeout);
	}

	_getFirmwareVersion() {
		const setup = {
			bmRequestType: proto.BmRequestType.DEVICE_TO_HOST,
			bRequest: proto.PARTICLE_BREQUEST,
			wIndex: VendorRequest.SYSTEM_VERSION,
			wValue: 0,
			wLength: proto.MIN_WLENGTH
		};
		return this._dev.transferIn(setup).then(data => {
			return data.toString();
		});
	}

	// Sends a service request and parses the reply data
	_sendServiceRequest(setup) {
		return this._dev.transferIn(setup).then(data => {
			return proto.parseReply(data);
		});
	}
}

export async function getDevices({ types = [], includeDfu = true } = {}) {
	types = types.map(type => type.toLowerCase());
	const filters = [];
	DEVICES.forEach(dev => {
		if (types.length === 0 || types.includes(dev.type.toLowerCase())) {
			filters.push(dev.usbIds);
			if (includeDfu) {
				filters.push(dev.dfuUsbIds);
			}
		}
	});
	if (filters.length === 0) {
		return [];
	}
	const devs = await getUsbDevices(filters);
	return devs.map(dev => {
		const info = deviceInfoForUsbIds(dev.vendorId, dev.productId);
		assert(info);
		return new DeviceBase(dev, info);
	});
}

export async function openDeviceById(id, options = null) {
	const log = globalOptions.log;
	const filters = [];
	DEVICES.forEach(dev => {
		filters.push(Object.assign({ serialNumber: id }, dev.usbIds));
		filters.push(Object.assign({ serialNumber: id }, dev.dfuUsbIds));
	});
	const devs = await getUsbDevices(filters);
	if (devs.length === 0) {
		throw new NotFoundError('Device is not found');
	}
	if (devs.length !== 1) {
		log.warn(`Found multiple devices with the same ID: ${id}`); // lol
	}
	let dev = devs[0];
	const info = deviceInfoForUsbIds(dev.vendorId, dev.productId);
	assert(info);
	dev = new DeviceBase(dev, info);
	await dev.open(options);
	return dev;
}
