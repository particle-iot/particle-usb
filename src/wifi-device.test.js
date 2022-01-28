/**
 * We deliberately don't use fakeUSB here because it mocks out too much
 */
const { sinon, expect, getFakeWifiDevice } = require('../test/support');
const { UsbDevice } = require('./usb-device-node');
const { PLATFORMS } = require('./platforms');

describe('WifiDevice', () => {
	let usbDevice, p2Platform, wifiDevice;
	
	beforeEach(async () => {
		usbDevice = new UsbDevice({});
		p2Platform = PLATFORMS.find(element => element.name === 'p2');
		wifiDevice = getFakeWifiDevice(usbDevice, p2Platform)
	});

	afterEach(() => {
		sinon.restore();
	});

	it('provides scanWifiNetworks()', async () => {
		// sinon.stub(device, 'sendProtobufRequest').resolves({ serial: exampleSerialNumber });
		const result = await wifiDevice.scanWifiNetworks();
		expect(result).to.eql('foo');
		// expect(device.sendProtobufRequest).to.have.property('callCount', 1);
		// expect(result).to.eql(exampleSerialNumber);
	});
});