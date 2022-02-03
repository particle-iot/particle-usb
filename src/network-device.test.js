const { expect } = require('../test/support');
const { setDevicePrototype } = require('./set-device-prototype');
describe('NetworkDevice (all deprecated methods)', () => {
	const deprecatedMethods = ['getNetworkStatus', 'getNetworkConfig', 'setNetworkConfig'];
	for (const method of deprecatedMethods) {
		it(`provides ${method}`, async () => {
			const fakeDevice = { type: 'p2' }; // could be any device type
			const result = setDevicePrototype(fakeDevice);
			expect(result[method]).to.be.a('Function');
		});
	}
});
