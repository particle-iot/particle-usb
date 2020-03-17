import { VError } from 'verror';

/**
 * Generic device error. This is a base class for all errors reported by the library.
 */
export class DeviceError extends VError {
	constructor(...args) {
		super(...args);
		Error.captureStackTrace(this, this.constructor);
	}
}

/**
 * An error reported when a requested resource cannot be found.
 */
export class NotFoundError extends DeviceError {
	constructor(...args) {
		super(...args);
		Error.captureStackTrace(this, this.constructor);
	}
}

/**
 * An error reported when a requested operation is not permitted.
 */
export class NotAllowedError extends DeviceError {
	constructor(...args) {
		super(...args);
		Error.captureStackTrace(this, this.constructor);
	}
}

/**
 * An error reported when an object is not in an appropriate state to perform an operation.
 */
export class StateError extends DeviceError {
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
 * An error reported when a device has no enough memory to perform an operation.
 */
export class MemoryError extends DeviceError {
	constructor(...args) {
		super(...args);
		Error.captureStackTrace(this, this.constructor);
	}
}

/**
 * Protocol error.
 */
export class ProtocolError extends DeviceError {
	constructor(...args) {
		super(...args);
		Error.captureStackTrace(this, this.constructor);
	}
}

/**
 * USB error.
 */
export class UsbError extends DeviceError {
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

/**
 * Request error.
 */
export class RequestError extends DeviceError {
	constructor(result, ...args) {
		super(...args);
		this.result = result;
		Error.captureStackTrace(this, this.constructor);
	}
}

export function assert(val, msg = null) {
	if (!val) {
		throw new InternalError(msg ? msg : 'Assertion failed');
	}
}
