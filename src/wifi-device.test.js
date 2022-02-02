const { sinon, expect } = require('../test/support');
const { setDevicePrototype } = require('./set-device-prototype');
const { PLATFORMS } = require('./platforms');

describe('WifiDevice', () => {
	const relevantPlatformNames = PLATFORMS
		.filter(x => x.generation >= 3 && x.features.includes('wifi'))
		.map(x => x.name);

	beforeEach(() => {

	});

	afterEach(() => {
		sinon.restore();
	});

	for (const platformName of relevantPlatformNames) {
		it(`provides expected interface for platform=${platformName}`, async () => {
			const fakeDevice = { type: platformName };
			const result = setDevicePrototype(fakeDevice);
			const wifiDeviceInterface = [
				'scanWifiNetworks',
				'joinNewWifiNetwork',
				'clearWifiNetworks'
			];
			for (const func of wifiDeviceInterface) {
				expect(result[func]).to.be.a('Function', `${platformName} implements ${func}`);
			}
		});
	}
});
