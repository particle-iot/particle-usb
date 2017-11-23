/**
 * Request error.
 */
export class RequestError extends Error {
  constructor(...args) {
    super(...args);
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Timeout error.
 */
export class TimeoutError extends Error {
  constructor(...args) {
    super(...args);
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Error reported when a requested entity cannot be found.
 */
export class NotFoundError extends Error {
  constructor(...args) {
    super(...args);
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Error reported when an operation cannot be performed in a current object state.
 */
export class StateError extends Error {
  constructor(...args) {
    super(...args);
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Protocol error.
 */
export class ProtocolError extends Error {
  constructor(...args) {
    super(...args);
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * USB error.
 */
export class UsbError extends Error {
  constructor(...args) {
    super(...args);
    Error.captureStackTrace(this, this.constructor);
  }
}
