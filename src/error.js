const { VError } = require('verror');

/**
 * Generic device error. This is a base class for all errors reported by the library.
 */
class DeviceError extends VError {
	constructor(...args) {
		super(...args);
		Error.captureStackTrace(this, this.constructor);
	}
}

/**
 * An error reported when a requested resource cannot be found.
 */
class NotFoundError extends DeviceError {
	constructor(...args) {
		super(...args);
		Error.captureStackTrace(this, this.constructor);
	}
}

/**
 * An error reported when a requested operation is not permitted.
 */
class NotAllowedError extends DeviceError {
	constructor(...args) {
		super(...args);
		Error.captureStackTrace(this, this.constructor);
	}
}

/**
 * An error reported when an object is not in an appropriate state to perform an operation.
 */
class StateError extends DeviceError {
	constructor(...args) {
		super(...args);
		Error.captureStackTrace(this, this.constructor);
	}
}

/**
 * Timeout error.
 */
class TimeoutError extends DeviceError {
	constructor(...args) {
		super(...args);
		Error.captureStackTrace(this, this.constructor);
	}
}

/**
 * An error reported when a device has no enough memory to perform an operation.
 */
class MemoryError extends DeviceError {
	constructor(...args) {
		super(...args);
		Error.captureStackTrace(this, this.constructor);
	}
}

/**
 * Protocol error.
 */
class ProtocolError extends DeviceError {
	constructor(...args) {
		super(...args);
		Error.captureStackTrace(this, this.constructor);
	}
}

/**
 * USB error.
 */
class UsbError extends DeviceError {
	constructor(...args) {
		super(...args);
		Error.captureStackTrace(this, this.constructor);
	}
}

/**
 * Internal error.
 */
class InternalError extends DeviceError {
	constructor(...args) {
		super(...args);
		Error.captureStackTrace(this, this.constructor);
	}
}

/**
 * Request error.
 */
class RequestError extends DeviceError {
	constructor(result, ...args) {
		super(...args);
		this.result = result;
		Error.captureStackTrace(this, this.constructor);
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
	assert
};
