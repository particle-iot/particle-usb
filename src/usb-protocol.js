import { ProtocolError } from './error';

// Service request types
export const ServiceType = {
	INIT: 1,
	CHECK: 2,
	SEND: 3,
	RECV: 4,
	RESET: 5
};

// Field flags
export const FieldFlag = {
	STATUS: 0x01,
	ID: 0x02,
	SIZE: 0x04,
	RESULT: 0x08
};

// Status codes
export const Status = {
	OK: 0,
	ERROR: 1,
	PENDING: 2,
	BUSY: 3,
	NO_MEMORY: 4,
	NOT_FOUND: 5
};

// Values of the bmRequestType field used by the protocol
export const BmRequestType = {
	HOST_TO_DEVICE: 0x40, // 01000000b (direction: host-to-device; type: vendor; recipient: device)
	DEVICE_TO_HOST: 0xc0 // 11000000b (direction: device_to_host; type: vendor; recipient: device)
};

// Value of the bRequest field for Particle vendor requests
export const PARTICLE_BREQUEST = 0x50; // ASCII code of the character 'P'

// Minimum length of the data stage for high-speed USB devices
export const MIN_WLENGTH = 64;

// Misc. constraints defined by the protocol and the USB specification
export const MAX_REQUEST_ID = 0xffff;
export const MAX_REQUEST_TYPE = 0xffff;
export const MAX_PAYLOAD_SIZE = 0xffff;

// Returns the setup packet fields for the INIT service request
export function initRequest(reqType, dataSize = 0) {
	return {
		bmRequestType: BmRequestType.DEVICE_TO_HOST,
		bRequest: ServiceType.INIT,
		wIndex: reqType, // Request type
		wValue: dataSize, // Payload size
		wLength: MIN_WLENGTH
	};
}

// Returns the setup packet fields for the CHECK service request
export function checkRequest(reqId) {
	return {
		bmRequestType: BmRequestType.DEVICE_TO_HOST,
		bRequest: ServiceType.CHECK,
		wIndex: reqId, // Request ID
		wValue: 0, // Not used
		wLength: MIN_WLENGTH
	};
}

// Returns the setup packet fields for the SEND service request
export function sendRequest(reqId, dataSize) {
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
export function recvRequest(reqId, dataSize) {
	return {
		bmRequestType: BmRequestType.DEVICE_TO_HOST,
		bRequest: ServiceType.RECV,
		wIndex: reqId, // Request ID
		wValue: 0, // Not used
		wLength: dataSize // Payload size
	};
}

// Returns the setup packet fields for the RESET service request
export function resetRequest(reqId = 0) {
	return {
		bmRequestType: BmRequestType.DEVICE_TO_HOST,
		bRequest: ServiceType.RESET,
		wIndex: reqId, // Request ID (can be set to 0 to reset all requests)
		wValue: 0, // Not used
		wLength: MIN_WLENGTH
	};
}

// Parses service reply data
export function parseReply(data) {
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
			throw new ProtocolError(err, 'Unable to parse service reply');
		}
		throw err;
	}
}

// Serializes service reply data
export function encodeReply(rep) {
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
