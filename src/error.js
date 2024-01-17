/**
 * Generic device error. This is a base class for all errors reported by the library.
 */
class DeviceError extends Error {
	constructor(...args) {
		super(...args);
		this.name = this.constructor.name;
	}
}

/**
 * An error reported when a requested resource cannot be found.
 */
class NotFoundError extends DeviceError {
	constructor(...args) {
		super(...args);
		this.name = this.constructor.name;
	}
}

/**
 * An error reported when a requested operation is not permitted.
 */
class NotAllowedError extends DeviceError {
	constructor(...args) {
		super(...args);
		this.name = this.constructor.name;
	}
}

/**
 * An error reported when an object is not in an appropriate state to perform an operation.
 */
class StateError extends DeviceError {
	constructor(...args) {
		super(...args);
		this.name = this.constructor.name;
	}
}

/**
 * Timeout error.
 */
class TimeoutError extends DeviceError {
	constructor(...args) {
		super(...args);
		this.name = this.constructor.name;
	}
}

/**
 * An error reported when a device has no enough memory to perform an operation.
 */
class MemoryError extends DeviceError {
	constructor(...args) {
		super(...args);
		this.name = this.constructor.name;
	}
}

/**
 * Protocol error.
 */
class ProtocolError extends DeviceError {
	constructor(...args) {
		super(...args);
		this.name = this.constructor.name;
	}
}

/**
 * USB error.
 */
class UsbError extends DeviceError {
	constructor(...args) {
		super(...args);
		this.name = this.constructor.name;
	}
}

/**
 * Internal error.
 */
class InternalError extends DeviceError {
	constructor(...args) {
		super(...args);
		this.name = this.constructor.name;
	}
}

/**
 * Request error.
 */
class RequestError extends DeviceError {
	constructor(result, ...args) {
		super(...args);
		this.name = this.constructor.name;
		this.result = result;
	}
}

/**
 * USB stall error.
 */
class UsbStallError extends UsbError {
	constructor(...args) {
		super(...args);
		this.name = this.constructor.name;
	}
}

/**
 * Device Protection error.
 */
class DeviceProtectionError extends DeviceError {
	constructor(result, ...args) {
		super(...args);
		this.name = this.constructor.name;
		this.result = result;
	}
}

function assert(val, msg = null) {
	if (!val) {
		throw new InternalError(msg ? msg : 'Assertion failed');
	}
}

module.exports = {
	DeviceError,
	NotFoundError,
	NotAllowedError,
	StateError,
	TimeoutError,
	MemoryError,
	ProtocolError,
	UsbError,
	InternalError,
	RequestError,
	UsbStallError,
	DeviceProtectionError,
	assert
};
