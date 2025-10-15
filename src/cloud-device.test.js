'use strict';
const { /*sinon,*/ expect } = require('../test/support');
const { setDevicePrototype } = require('./set-device-prototype');

describe('CloudDevice', () => {
	it('provides CloudDevice methods in cloud-device.js (which ALL Particle Devices inherit from)', async () => {
		const cloudDeviceInterface = [
			'connectToCloud',
			'disconnectFromCloud',
			'getCloudConnectionStatus',
			'setClaimCode',
			'isClaimed',
			'setDevicePrivateKey', // deprecated
			'getDevicePrivateKey', // deprecated
			'setDevicePublicKey', // deprecated
			'getDevicePublicKey', // deprecated
			'setServerPublicKey', // deprecated
			'getServerPublicKey', // deprecated
			'setServerAddress', // deprecated
			'getServerAddress', // deprecated
			'setServerProtocol', // deprecated
		];
		const fakeDevice = { type: 'p2' };
		const result = setDevicePrototype(fakeDevice);
		for (const func of cloudDeviceInterface) {
			expect(result[func]).to.be.a('Function');
		}
	});
});

