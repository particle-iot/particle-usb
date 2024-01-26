const addressUtil = require('./address-util');
const { expect } = require('../test/support');

describe('convertBufferToMacAddress', () => {
	it('should convert a buffer to MAC address', () => {
		const buffer = Buffer.from([0x00, 0x11, 0x22, 0x33, 0x44, 0x55]); // Buffer with MAC address bytes
		const expected = '00:11:22:33:44:55';
		const result = addressUtil.convertBufferToMacAddress(buffer);
		expect(result).to.eql(expected);
	});
});
