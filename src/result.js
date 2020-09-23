// Result codes as defined by the firmware's system_error_t enum
const RESULT_CODES = [
	{
		id: 'OK',
		value: 0,
		message: 'Operation succeeded'
	},
	{
		id: 'ERROR',
		value: -100,
		message: 'Unknown error'
	},
	{
		id: 'BUSY',
		value: -110,
		message: 'Resource is busy'
	},
	{
		id: 'NOT_SUPPORTED',
		value: -120,
		message: 'Not supported'
	},
	{
		id: 'NOT_ALLOWED',
		value: -130,
		message: 'Not allowed'
	},
	{
		id: 'CANCELLED',
		value: -140,
		message: 'Operation cancelled'
	},
	{
		id: 'ABORTED',
		value: -150,
		message: 'Operation aborted'
	},
	{
		id: 'TIMEOUT_ERROR',
		value: -160,
		message: 'Timeout error'
	},
	{
		id: 'NOT_FOUND',
		value: -170,
		message: 'Not found'
	},
	{
		id: 'ALREADY_EXISTS',
		value: -180,
		message: 'Already exists'
	},
	{
		id: 'TOO_LARGE',
		value: -190,
		message: 'Data is too large'
	},
	{
		id: 'LIMIT_EXCEEDED',
		value: -200,
		message: 'Limit exceeded'
	},
	{
		id: 'INVALID_STATE',
		value: -210,
		message: 'Invalid state'
	},
	{
		id: 'IO_ERROR',
		value: -220,
		message: 'IO error'
	},
	{
		id: 'NETWORK_ERROR',
		value: -230,
		message: 'Network error'
	},
	{
		id: 'PROTOCOL_ERROR',
		value: -240,
		message: 'Protocol error'
	},
	{
		id: 'INTERNAL_ERROR',
		value: -250,
		message: 'Internal error'
	},
	{
		id: 'NO_MEMORY',
		value: -260,
		message: 'Memory allocation error'
	},
	{
		id: 'INVALID_ARGUMENT',
		value: -270,
		message: 'Invalid argument'
	},
	{
		id: 'BAD_DATA',
		value: -280,
		message: 'Invalid data format'
	},
	{
		id: 'OUT_OF_RANGE',
		value: -290,
		message: 'Out of range'
	}
];

// Result code messages
const RESULT_CODE_MESSAGES = RESULT_CODES.reduce((obj, result) => {
	obj[result.value] = result.message;
	return obj;
}, {});

/**
 * Request result codes.
 *
 * @enum {Number}
 */
export const Result = RESULT_CODES.reduce((obj, result) => {
	obj[result.id] = result.value;
	return obj;
}, {});

/**
 * Return a message for the result code.
 *
 * @param {Number} result Result code.
 * @return {String} Error message.
 */
export function messageForResultCode(result) {
	return (RESULT_CODE_MESSAGES[result] || 'Request error');
}
