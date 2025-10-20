'use strict';
const { sinon, expect } = require('../test/support');
const { setDevicePrototype } = require('./set-device-prototype');

describe('Gen3Device', () => {
	beforeEach(() => { });

	afterEach(() => {
		sinon.restore();
	});

	it('provides setSetupDone() function for argon', async () => {
		const fakeDevice = { type: 'argon' };
		const result = setDevicePrototype(fakeDevice);
		expect(result.setSetupDone).to.be.a('Function');
	});

	it('provides setSetupDone() function for boron', async () => {
		const fakeDevice = { type: 'boron' };
		const result = setDevicePrototype(fakeDevice);
		expect(result.setSetupDone).to.be.a('Function');
	});
});
