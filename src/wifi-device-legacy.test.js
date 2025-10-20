'use strict';
const { sinon, expect } = require('../test/support');
const { setDevicePrototype } = require('./set-device-prototype');
const { PLATFORMS } = require('./platforms');

describe('WifiDeviceLegacy', () => {
	let relevantPlatformNames;
	beforeEach(() => {
		// default to everything 1 and greater, tests override to be more specific when needed
		relevantPlatformNames = PLATFORMS
			.filter(x => x.generation >= 1)
			.map(x => x.name);
	});

	afterEach(() => {
		sinon.restore();
	});
	it('provides deprecated wifi functions for core, photon, and p1 devices', async () => {
		// 'core', 'photon', 'p1'
		// I doubt this works on Spark Core/gen 1, but why not
		// Certainly won't work on gen -1/deprecated hardware platforms
		relevantPlatformNames = PLATFORMS
			.filter(x => (x.generation === 1 || x.generation === 2) && x.features.includes('wifi'))
			.map(x => x.name);

		// This id the deprecated interface
		const wifiDeviceInterface = [
			'setWifiAntenna', // deprecated
			'getWifiAntenna', // deprecated
			'scanWifiNetworks', // deprecated; but updated method provided in new/non legacy WifiDevice
			'setWifiCredentials', // deprecated
			'getWifiCredentials', // deprecated
			'clearWifiCredentials', // deprecated
		];

		for (const platformName of relevantPlatformNames) {
			const fakeDevice = { type: platformName };
			const result = setDevicePrototype(fakeDevice);
			for (const func of wifiDeviceInterface) {
				expect(result[func]).to.be.a('Function', `${platformName} implements ${func}`);
			}
		}
	});
});
