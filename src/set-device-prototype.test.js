const { sinon, expect } = require('../test/support');
const { setDevicePrototype } = require('./set-device-prototype');
const { Device } = require('./device');
// The methods we assert are defined in these files, but we don't include
// them because uncertainty with how to assert an instance has a given
// mixin mixed in.
//   const { WifiDevice } = require('./wifi-device');
//   const { CellularDevice } = require('./cellular-device');
//   const { CloudDevice } = require('./cloud-device');
//   const { Gen3Device } = require('./gen3-device');
//   const { NetworkDevice } = require('./network-device');

describe('setDevicePrototype(), a helper function that sets prototype and inheritance hierarchy based on platform characteristics', () => {
	beforeEach(() => {

	});

	afterEach(() => {
		sinon.restore();
	});

	// TODO: this will become wifi-device-legacy.js
	it('provides functions for gen2 wifi devices (Photon) in wifi-device.js', async () => {
		const wifiDeviceInterface = [
			'setWifiAntenna', // deprecated
			'getWifiAntenna', // deprecated
			'scanWifiNetworks', // will be updated
			'setWifiCredentials', // deprecated
			'getWifiCredentials', // deprecated
			'clearWifiCredentials', // deprecated
		];
		const fakeDevice = { type: 'photon'	};
		const result = setDevicePrototype(fakeDevice);
		expect(result).to.be.an.instanceOf(Device);

		// Note: this does NOT work because this is a Mixin rather than parent class
		//   expect(result).to.be.an.instanceOf(WifiDevice);
		// Instead, we assert the public methods that this thing exported:
		for (const func of wifiDeviceInterface) {
			expect(result[func]).to.be.a('Function');
		}
	});

	it('provides setSetupDone() function for gen3 devices (Argon, Boron) in gen3-device.js', async () => {
		const fakeDevice = { type: 'argon'	};
		const result = setDevicePrototype(fakeDevice);
		expect(result).to.be.an.instanceOf(Device);
		expect(result.setSetupDone).to.be.a('Function');
	});

	// Note: Deliberately skipping assertions against NetworkDevice, which has all deprecated methods

	it('provides getIccid() for cellular devices (Electron, Boron) in cellular-device.js', async () => {
		const fakeDevice = { type: 'boron'	};
		const result = setDevicePrototype(fakeDevice);
		expect(result).to.be.an.instanceOf(Device);
		expect(result.getIccid).to.be.a('Function');
	});

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
		const fakeDevice = { type: 'p2'	};
		const result = setDevicePrototype(fakeDevice);
		expect(result).to.be.an.instanceOf(Device);
		for (const func of cloudDeviceInterface) {
			expect(result[func]).to.be.a('Function');
		}
	});
});
