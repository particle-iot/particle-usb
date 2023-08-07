const deviceConstants = require('@particle/device-constants');
const proto = require('../../src/usb-protocol');
const { ProtocolError, UsbError } = require('../../src/error');
const dfu = require('../../src/dfu');
const { PLATFORMS } = require('../../src/platforms');

const USB_DEVICES = PLATFORMS.reduce((arr, platform) => {
	if (platform.usb) {
		arr.push({
			type: platform.name,
			platformId: platform.id,
			vendorId: platform.usb.vendorId,
			productId: platform.usb.productId,
			dfu: false
		});
	}
	if (platform.dfu) {
		arr.push({
			type: platform.name,
			platformId: platform.id,
			vendorId: platform.dfu.vendorId,
			productId: platform.dfu.productId,
			dfu: true
		});
	}

	return arr;
}, []);

// Low-level vendor requests
const VendorRequest = {
	SYSTEM_VERSION: 30 // Get system version
};

// Maximum request ID value
const MAX_REQUEST_ID = 0xffff;

// USB devices "attached" to the host
const devices = new Map();

// Last used internal device ID
let lastDeviceId = 0;

// Mockable protocol implementation
class Protocol {
	constructor(options) {
		this._opts = options; // Device options
		this._reqs = new Map(); // All known requests
		this._lastReqId = 0; // Last used request ID
	}

	deviceToHostRequest(setup) {
		if (setup.bmRequestType !== proto.BmRequestType.DEVICE_TO_HOST &&
			setup.bmRequestType !== 0x80) {
			throw new ProtocolError(`Unsupported device-to-host request: bmRequestType: ${setup.bmRequestType}`);
		}
		let data = null;
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
				if (setup.wIndex === VendorRequest.SYSTEM_VERSION) {
					if (!this._opts.firmwareVersion) {
						throw new ProtocolError(`Unsupported device-to-host request: wIndex: ${setup.wIndex}`);
					}
					data = Buffer.from(this._opts.firmwareVersion);
				} else {
					throw new ProtocolError(`Unsupported device-to-host request: wIndex: ${setup.wIndex}`);
				}
				break;
			}
			case 0x06:
				// GET_DESCRIPTOR
				break;
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
		if (setup.bmRequestType !== proto.BmRequestType.HOST_TO_DEVICE) {
			throw new ProtocolError(`Unsupported host-to-device request: bmRequestType: ${setup.bmRequestType}`);
		}
		if (data && data.length !== setup.wLength || !data && setup.wLength !== 0) {
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
		const id = this.nextRequestId;
		const req = { // Request object
			id: id,
			type: type,
			size: size,
			offset: 0,
			data: null,
			reply: null,
			received: false
		};
		const srep = {}; // Service reply
		srep.status = this.initRequest({ id, type, size });
		if (srep.status === proto.Status.OK || srep.status === proto.Status.PENDING) {
			if (srep.status === proto.Status.OK) {
				if (!req.size) {
					req.received = true;
				} else if (!req.data) {
					req.data = Buffer.alloc(req.size);
				}
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
				srep.status = this.checkBuffer({ id });
				if (srep.status === proto.Status.OK) {
					req.data = Buffer.alloc(req.size);
				} else if (srep.status !== proto.Status.PENDING) {
					this._reqs.delete(id); // Buffer allocation failed
				}
			} else {
				// Request processing is pending
				srep.status = this.checkRequest({ id });
				if (srep.status === proto.Status.OK) {
					const rep = { // Application reply
						result: this.replyResult({ id }),
						data: this.replyData({ id })
					};
					srep.result = rep.result;
					if (rep.data && rep.data.length !== 0) {
						srep.size = rep.data.length;
						req.reply = rep;
					} else {
						this._reqs.delete(id); // Request completed
					}
				} else if (srep.status !== proto.Status.PENDING) {
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
		if (req.received) {
			throw new ProtocolError('Unexpected service request');
		}
		if (!req.data) {
			throw new ProtocolError('Request buffer is not allocated');
		}
		if (!data || !data.length || req.offset + data.length > req.data.length) {
			throw new ProtocolError('Unexpected size of the control transfer');
		}
		this.sendRequest({ id, data: Buffer.from(data) });
		data.copy(req.data, req.offset);
		req.offset += data.length;
		if (req.offset === req.data.length) {
			req.offset = 0;
			req.received = true;
		}
	}

	recvServiceRequest(id, size) {
		const req = this._reqs.get(id);
		if (!req) {
			// Payload data is application-specific, so we can't reply with a status code
			throw new ProtocolError(`Request not found: ${id}`);
		}
		const repData = req.reply ? req.reply.data : null;
		if (!repData) {
			throw new ProtocolError('Reply data is not available');
		}
		if (!size || req.offset + size > repData.length) {
			throw new ProtocolError('Unexpected size of the control transfer');
		}
		this.recvRequest({ id, size });
		const data = repData.slice(req.offset, req.offset + size);
		req.offset += size;
		if (req.offset === repData.size) {
			this._reqs.delete(id); // Request completed
		}
		return data;
	}

	resetServiceRequest(id) {
		const srep = {}; // Service reply
		if (id) {
			const req = this._reqs.get(id);
			if (req) {
				srep.status = this.resetRequest({ id: req.id });
				if (srep.status === proto.Status.OK) {
					this._reqs.delete(id);
				}
			} else {
				srep.status = proto.Status.NOT_FOUND;
			}
		} else {
			srep.status = this.resetAllRequests();
			if (srep.status === proto.Status.OK) {
				this._reqs.clear();
			}
		}
		return proto.encodeReply(srep);
	}

	initRequest(/* { id, type, size } */) {
		return proto.Status.OK;
	}

	checkBuffer(/* { id } */) {
		return proto.Status.OK;
	}

	checkRequest(/* { id } */) {
		return proto.Status.OK;
	}

	sendRequest(/* { id, data } */) {
	}

	recvRequest(/* { id, size } */) {
	}

	resetRequest(/* { id } */) {
		return proto.Status.OK;
	}

	resetAllRequests() {
		return proto.Status.OK;
	}

	replyResult(/* { id } */) {
		return 0; // OK
	}

	replyData(/* { id } */) {
		return null;
	}

	reset() {
		this._reqs.clear();
		this._lastReqId = 0;
	}

	get lastRequestId() {
		return this._lastReqId;
	}

	get nextRequestId() {
		let id = this._lastReqId + 1;
		if (id > MAX_REQUEST_ID) {
			id = 0;
		}
		return id;
	}
}

// Mockable minimal DFU implementation
class DfuClass {
	constructor(options, dev) {
		this._opts = options;
		this._dev = dev;
		this.reset();
	}

	reset() {
		this._claimed = [];
		// Start in some non-trivial state
		this._state = {
			status: dfu.DfuDeviceStatus.errUNKNOWN,
			state: dfu.DfuDeviceState.dfuDNBUSY,
			pollTimeout: 0
		};
	}

	hostToDeviceRequest(setup, data) {
		if (setup.bmRequestType !== dfu.DfuBmRequestType.HOST_TO_DEVICE) {
			throw new UsbError('Unknown bmRequestType');
		}

		if (!(setup.wIndex in this._claimed)) {
			throw new UsbError('Interface is not claimed');
		}

		switch (setup.bRequest) {
			case dfu.DfuRequestType.DFU_DNLOAD: {
				return this._dnload(setup, data);
			}
			case dfu.DfuRequestType.DFU_CLRSTATUS: {
				return this._clearStatus(setup, data);
			}

			default: {
				throw new UsbError('Unknown bRequest');
			}
		}
	}

	deviceToHostRequest(setup) {
		// Implements DFU_GETSTATUS only
		if (setup.bmRequestType !== dfu.DfuBmRequestType.DEVICE_TO_HOST &&
			setup.bmRequestType !== 0x80) {
			throw new UsbError('Unknown bmRequestType');
		}

		if (!(setup.wIndex in this._claimed)) {
			throw new UsbError('Interface is not claimed');
		}

		switch (setup.bRequest) {
			case dfu.DfuRequestType.DFU_GETSTATUS: {
				return this._getStatus(setup);
			}
			case 0x06: {
				// (GET_DESCRIPTOR)
				const sample = [9,2,36,0,1,1,4,192,50,9,4,0,0,0,254,1,2,5,9,4,0,1,0,254,1,2,6,9,33,11,255,0,0,16,26,1];
				return Buffer.from(sample);
			}
			default: {
				throw new UsbError('Unknown bRequest');
			}
		}
	}

	claimInterface(iface) {
		// Already claimed, ignore
		if (iface in this._claimed) {
			return;
		}

		this._claimed.push(iface);
	}

	releaseInterface(iface) {
		if (!(iface in this._claimed)) {
			throw new UsbError('Interface is not claimed');
		}

		this._claimed.splice(this._claimed.indexOf(iface), 1);
	}

	setAltSetting(/* iface, setting */) {
		// Noop for now
	}

	async _pollUntil(statePredicate) {
		let dfuStatus = await this._getStatus();

		function asyncSleep(durationMs) {
			return new Promise((resolve) => {
				// this._log.trace('Sleeping for ' + durationMs + 'ms');
				setTimeout(resolve, durationMs);
			});
		}

		while (!statePredicate(dfuStatus.state) && dfuStatus.state !== dfu.DfuDeviceState.dfuERROR) {
			await asyncSleep(dfuStatus.pollTimeout);
			dfuStatus = await this._getStatus();
		}

		return dfuStatus;
	}

	_getStatus(setup) {
		if (setup.wValue !== 0) {
			throw new UsbError('Unknown wValue for DFU_GETSTATUS');
		}

		if (setup.wLength < dfu.DFU_STATUS_SIZE) {
			throw new UsbError('Invalid wLength for DFU_GETSTATUS');
		}

		switch (this._state.state) {
			case dfu.DfuDeviceState.dfuMANIFEST_SYNC: {
				this._setError(dfu.DfuDeviceStatus.OK);
				this._setState(dfu.DfuDeviceState.dfuMANIFEST);
				break;
			}
			case dfu.DfuDeviceState.dfuMANIFEST: {
				this._setState(dfu.DfuDeviceState.dfuMANIFEST_WAIT_RESET);
				break;
			}
		}

		switch (this._state.state) {
			/* Imitate fall-through from the previous switch-case */
			case dfu.DfuDeviceState.dfuDNLOAD_SYNC:
			case dfu.DfuDeviceState.dfuMANIFEST_SYNC:
			case dfu.DfuDeviceState.dfuMANIFEST:
			case dfu.DfuDeviceState.appIDLE:
			case dfu.DfuDeviceState.appDETACH:
			case dfu.DfuDeviceState.dfuIDLE:
			case dfu.DfuDeviceState.dfuDNLOAD_IDLE:
			case dfu.DfuDeviceState.dfuUPLOAD_IDLE:
			case dfu.DfuDeviceState.dfuERROR: {
				// Generate DFU_GETSTATUS response
				const response = Buffer.alloc(dfu.DFU_STATUS_SIZE);
				response.writeUInt32LE(this._state.pollTimeout, 0);
				response.writeUInt8(this._state.status, 0);

				if (this._state.state !== dfu.DfuDeviceState.dfuMANIFEST || !this._opts.buggyDfu) {
					response.writeUInt8(this._state.state, 4);
				} else {
					// Gen2 devices in order to please dfu-util report dfuDNLOAD_IDLE :|
					response.writeUInt8(dfu.DfuDeviceState.dfuDNLOAD_IDLE, 4);
				}

				if (this._state.state === dfu.DfuDeviceState.dfuMANIFEST) {
					// Immediately detach
					this._dev.detach();
				}

				return response;
			}

			default: {
				/* Transition not defined */
				this._setError(dfu.DfuDeviceStatus.errUNKNOWN);
				throw new UsbError('Invalid state (endpoint stalled)');
			}
		}
	}

	_clearStatus(setup, data) {
		if (data && data.length > 0) {
			throw new UsbError('Invalid request');
		}

		if (this._state.state === dfu.DfuDeviceState.dfuERROR) {
			// Clear error
			this._setState(dfu.DfuDeviceState.dfuIDLE);
			this._setError(dfu.DfuDeviceStatus.OK);
		} else {
			this._setError(dfu.DfuDeviceStatus.errUNKNOWN);
			throw new UsbError('Invalid state (endpoint stalled)');
		}
	}

	_dnload() {
		switch (this._state.state) {
			case dfu.DfuDeviceState.dfuIDLE:
			case dfu.DfuDeviceState.dfuDNLOAD_IDLE: {
				// Go into dfuMANIFEST_SYNC state
				this._setState(dfu.DfuDeviceState.dfuMANIFEST_SYNC);
				break;
			}
			default: {
				this._setError(dfu.DfuDeviceStatus.errUNKNOWN);
				throw new UsbError('Invalid state (endpoint stalled)');
			}
		}
	}

	_setState(state) {
		this._state.state = state;
	}

	_setError(err) {
		this._state.status = err;
		if (err !== dfu.DfuDeviceStatus.OK) {
			this._state.state = dfu.DfuDeviceState.dfuERROR;
		}
	}
}

// Class implementing a fake USB device
class Device {
	constructor(id, options) {
		this._objId = id; // Internal object ID
		this._opts = options; // Device options
		this._proto = new Protocol(options); // Protocol implementation
		this._open = false; // Set to true if the device is open
		this._attached = true; // Set to true if the device is "attached" to the host
		if (options.dfu) {
			this._dfu = new DfuClass(options, this);
		}
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
		if (this._opts.dfu) {
			this._dfu.reset();
		}
		this._open = false;
	}

	async transferIn(setup) {
		if (!this._attached) {
			throw new UsbError('Device is not found');
		}
		if (!this._open) {
			throw new UsbError('Device is not open');
		}
		if (!this.options.dfu) {
			return this._proto.deviceToHostRequest(setup);
		} else {
			return this._dfu.deviceToHostRequest(setup);
		}
	}

	async transferOut(setup, data) {
		if (!this._attached) {
			throw new UsbError('Device is not found');
		}
		if (!this._open) {
			throw new UsbError('Device is not open');
		}
		if (!this.options.dfu) {
			this._proto.hostToDeviceRequest(setup, data);
		} else {
			return this._dfu.hostToDeviceRequest(setup, data);
		}
	}

	async claimInterface(iface) {
		if (!this._attached) {
			throw new UsbError('Device is not found');
		}
		if (!this._open) {
			throw new UsbError('Device is not open');
		}

		if (!this.options.dfu) {
			throw new UsbError('Unsupported command');
		}

		return this._dfu.claimInterface(iface);
	}

	async releaseInterface(iface) {
		if (!this._attached) {
			throw new UsbError('Device is not found');
		}
		if (!this._open) {
			throw new UsbError('Device is not open');
		}

		if (!this.options.dfu) {
			throw new UsbError('Unsupported command');
		}

		return this._dfu.releaseInterface(iface);
	}

	async setAltSetting(iface, setting) {
		if (!this._attached) {
			throw new UsbError('Device is not found');
		}
		if (!this._open) {
			throw new UsbError('Device is not open');
		}

		if (!this.options.dfu) {
			throw new UsbError('Unsupported command');
		}
		return this._dfu.setAltSetting(iface, setting);
	}

	detach() {
		this._proto.reset();
		if (this._dfu) {
			this._dfu.reset();
		}
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

async function getUsbDevices(filters) {
	// Validate the filtering options
	filters = !filters ? [] : filters.map(f => {
		if (f.productId && !f.vendorId) {
			throw new RangeError('Vendor ID is missing');
		}
		if (f.serialNumber) {
			f = Object.assign({}, f);
			f.serialNumber = f.serialNumber.toLowerCase();
		}
		return f;
	});
	let devs = Array.from(devices.values());
	if (filters.length > 0) {
		devs = devs.filter(dev => filters.some(f => ((!f.vendorId || dev.vendorId === f.vendorId) &&
				(!f.productId || dev.productId === f.productId) &&
				(!f.serialNumber || dev.serialNumber.toLowerCase() === f.serialNumber))));
	}
	return devs;
}

function addDevice(options) {
	if (options.type) {
		const devs = USB_DEVICES.filter(dev => (dev.type === options.type && dev.dfu === !!options.dfu));
		if (devs.length === 0) {
			throw new Error(`Unknown device type: ${options.type}`);
		}
		options = Object.assign({}, options, devs[0]);
		if (!options.id) {
			// Generate ID for a Particle device
			options.id = String(devices.size).padStart(24, '0');
		}
		// Particle devices expose their IDs via the serial number descriptor
		options.serialNumber = options.id;
	}
	const objId = ++lastDeviceId; // Internal object ID
	const dev = new Device(objId, options);
	devices.set(objId, dev);
	return dev;
}

function addDevices(options) {
	const devs = [];
	for (const opts of options) {
		devs.push(addDevice(opts));
	}
	return devs;
}

function addPhoton(options) {
	const opts = Object.assign({}, options, { type: deviceConstants.photon.name, buggyDfu: true });
	return addDevice(opts);
}

function addP1(options) {
	const opts = Object.assign({}, options, { type: deviceConstants.p1.name, buggyDfu: true });
	return addDevice(opts);
}

function addElectron(options) {
	const opts = Object.assign({}, options, { type: deviceConstants.electron.name, buggyDfu: true });
	return addDevice(opts);
}

function addArgon(options) {
	const opts = Object.assign({}, options, { type: deviceConstants.argon.name });
	return addDevice(opts);
}

function addBoron(options) {
	const opts = Object.assign({}, options, { type: deviceConstants.boron.name });
	return addDevice(opts);
}

function addXenon(options) {
	const opts = Object.assign({}, options, { type: deviceConstants.xenon.name });
	return addDevice(opts);
}

function addArgonSom(options) {
	const opts = Object.assign({}, options, { type: deviceConstants.asom.name });
	return addDevice(opts);
}

function addBoronSom(options) {
	const opts = Object.assign({}, options, { type: deviceConstants.bsom.name });
	return addDevice(opts);
}

function addB5Som(options) {
	const opts = Object.assign({}, options, { type: deviceConstants.b5som.name });
	return addDevice(opts);
}

function addXenonSom(options) {
	const opts = Object.assign({}, options, { type: deviceConstants.xsom.name });
	return addDevice(opts);
}

function addAssetTracker(options) {
	const opts = Object.assign({}, options, { type: deviceConstants.tracker.name });
	return addDevice(opts);
}

function addP2(options) {
	const opts = Object.assign({}, options, { type: deviceConstants.p2.name });
	return addDevice(opts);
}

function removeDevice(dev) {
	if (devices.delete(dev.objectId)) {
		dev.detach();
	}
}

function clearDevices() {
	for (const dev of devices.values()) {
		dev.detach();
	}
	devices.clear();
}

module.exports = {
	Protocol,
	DfuClass,
	Device,
	getUsbDevices,
	addDevice,
	addDevices,
	addPhoton,
	addP1,
	addElectron,
	addArgon,
	addBoron,
	addXenon,
	addArgonSom,
	addBoronSom,
	addB5Som,
	addXenonSom,
	addAssetTracker,
	addP2,
	removeDevice,
	clearDevices
};
