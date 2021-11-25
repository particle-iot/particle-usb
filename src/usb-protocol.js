const { ProtocolError } = require('./error');

// Service request types
const ServiceType = {
	INIT: 1,
	CHECK: 2,
	SEND: 3,
	RECV: 4,
	RESET: 5
};

// Field flags
const FieldFlag = {
	STATUS: 0x01,
	ID: 0x02,
	SIZE: 0x04,
	RESULT: 0x08
};

// Status codes
const Status = {
	OK: 0,
	ERROR: 1,
	PENDING: 2,
	BUSY: 3,
	NO_MEMORY: 4,
	NOT_FOUND: 5
};

// Values of the bmRequestType field used by the protocol
const BmRequestType = {
	HOST_TO_DEVICE: 0x40, // 01000000b (direction: host-to-device; type: vendor; recipient: device)
	DEVICE_TO_HOST: 0xc0 // 11000000b (direction: device_to_host; type: vendor; recipient: device)
};

// Value of the bRequest field for Particle vendor requests
const PARTICLE_BREQUEST = 0x50; // ASCII code of the character 'P'

// Minimum length of the data stage for high-speed USB devices
const MIN_WLENGTH = 64;

// Misc. constraints defined by the protocol and the USB specification
const MAX_REQUEST_ID = 0xffff;
const MAX_REQUEST_TYPE = 0xffff;
const MAX_PAYLOAD_SIZE = 0xffff;

// Returns the setup packet fields for the INIT service request
function initRequest(reqType, dataSize = 0) {
	return {
		bmRequestType: BmRequestType.DEVICE_TO_HOST,
		bRequest: ServiceType.INIT,
		wIndex: reqType, // Request type
		wValue: dataSize, // Payload size
		wLength: MIN_WLENGTH
	};
}

// Returns the setup packet fields for the CHECK service request
function checkRequest(reqId) {
	return {
		bmRequestType: BmRequestType.DEVICE_TO_HOST,
		bRequest: ServiceType.CHECK,
		wIndex: reqId, // Request ID
		wValue: 0, // Not used
		wLength: MIN_WLENGTH
	};
}

// Returns the setup packet fields for the SEND service request
function sendRequest(reqId, dataSize) {
	return {
		// SEND is the only host-to-device service request defined by the protocol
		bmRequestType: BmRequestType.HOST_TO_DEVICE,
		bRequest: ServiceType.SEND,
		wIndex: reqId, // Request ID
		wValue: 0, // Not used
		wLength: dataSize // Payload size
	};
}

// Returns the setup packet fields for the RECV service request
function recvRequest(reqId, dataSize) {
	return {
		bmRequestType: BmRequestType.DEVICE_TO_HOST,
		bRequest: ServiceType.RECV,
		wIndex: reqId, // Request ID
		wValue: 0, // Not used
		wLength: dataSize // Payload size
	};
}

// Returns the setup packet fields for the RESET service request
function resetRequest(reqId = 0) {
	return {
		bmRequestType: BmRequestType.DEVICE_TO_HOST,
		bRequest: ServiceType.RESET,
		wIndex: reqId, // Request ID (can be set to 0 to reset all requests)
		wValue: 0, // Not used
		wLength: MIN_WLENGTH
	};
}

// Parses service reply data
function parseReply(data) {
	try {
		const rep = {};
		let offs = 0;
		// Field flags (4 bytes)
		rep.flags = data.readUInt32LE(offs);
		offs += 4;
		// Status code (2 bytes)
		if (!(rep.flags & FieldFlag.STATUS)) {
			throw new ProtocolError('Service reply is missing mandatory status field');
		}
		rep.status = data.readUInt16LE(offs);
		offs += 2;
		// Request ID (2 bytes, optional)
		if (rep.flags & FieldFlag.ID) {
			rep.id = data.readUInt16LE(offs);
			offs += 2;
		}
		// Payload size (4 bytes, optional)
		if (rep.flags & FieldFlag.SIZE) {
			rep.size = data.readUInt32LE(offs);
			offs += 4;
		}
		// Result code (4 bytes, optional)
		if (rep.flags & FieldFlag.RESULT) {
			rep.result = data.readInt32LE(offs); // Signed
			offs += 4;
		}
		return rep;
	} catch (err) {
		if (!(err instanceof ProtocolError)) {
			throw new ProtocolError('Unable to parse service reply', { cause: err });
		}
		throw err;
	}
}

// Serializes service reply data
function encodeReply(rep) {
	let flags = FieldFlag.STATUS; // Status code is a mandatory field
	let size = 6; // 4 bytes for field flags and 2 bytes for status code
	if ('id' in rep) {
		flags |= FieldFlag.ID;
		size += 2;
	}
	if ('size' in rep) {
		flags |= FieldFlag.SIZE;
		size += 4;
	}
	if ('result' in rep) {
		flags |= FieldFlag.RESULT;
		size += 4;
	}
	const data = Buffer.alloc(size);
	let offs = 0;
	// Field flags (4 bytes)
	data.writeUInt32LE(flags, offs);
	offs += 4;
	// Status code (2 bytes)
	data.writeUInt16LE(rep.status, offs);
	offs += 2;
	// Request ID (2 bytes, optional)
	if (flags & FieldFlag.ID) {
		data.writeUInt16LE(rep.id, offs);
		offs += 2;
	}
	// Payload size (4 bytes, optional)
	if (flags & FieldFlag.SIZE) {
		data.writeUInt32LE(rep.size, offs);
		offs += 4;
	}
	// Result code (4 bytes, optional)
	if (flags & FieldFlag.RESULT) {
		data.writeInt32LE(rep.result, offs); // Signed
		offs += 4;
	}
	return data;
}

module.exports = {
	ServiceType,
	FieldFlag,
	Status,
	BmRequestType,
	PARTICLE_BREQUEST,
	MIN_WLENGTH,
	MAX_REQUEST_ID,
	MAX_REQUEST_TYPE,
	MAX_PAYLOAD_SIZE,
	initRequest,
	checkRequest,
	sendRequest,
	recvRequest,
	resetRequest,
	parseReply,
	encodeReply
};
