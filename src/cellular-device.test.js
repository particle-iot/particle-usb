const { /*sinon,*/ expect } = require('../test/support');
const { setDevicePrototype } = require('./set-device-prototype');

describe('CellularDevice', () => {
	it('provides getIccid() for Particle boron', async () => {
		// TODO: Pull from platforms like code does
		const fakeDevice = { type: 'boron' };
		const result = setDevicePrototype(fakeDevice);
		expect(result.getIccid).to.be.a('Function');
	});
});
