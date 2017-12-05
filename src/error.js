import { VError } from 'verror';

/**
 * Base class for all errors reported by the library.
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
 * Error reported when a device has no enough memory to perform an operation.
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
 * Internal error.
 */
export class InternalError extends DeviceError {
  constructor(...args) {
    super(...args);
    Error.captureStackTrace(this, this.constructor);
  }
}
