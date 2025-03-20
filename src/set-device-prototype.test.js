const { sinon, expect } = require('../test/support');
const { setDevicePrototype } = require('./set-device-prototype');
const { Device } = require('./device');
const { LinuxDevice } = require('./linux-device');
const { PLATFORMS } = require('./platforms');

describe('setDevicePrototype(), a helper function that sets prototype and inheritance hierarchy based on hardware platform', () => {
	let relevantPlatformNames;
	beforeEach(() => {
		relevantPlatformNames = PLATFORMS.map(x => x.name);
	});

	afterEach(() => {
		sinon.restore();
	});

	// See platform specific mixins like wifi-device.test.js for specific assertions
	// against method implementations
	it('returns a Device instance for all platforms', () => {
		for (const platformName of relevantPlatformNames) {
			const fakeDevice = { type: platformName };
			const result = setDevicePrototype(fakeDevice);
			if (platformName === 'tachyon') {
				expect(result).to.be.an.instanceOf(LinuxDevice);
			} else {
				expect(result).to.be.an.instanceOf(Device);
			}
		}
	});
});
