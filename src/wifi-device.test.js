/**
 * We deliberately don't use fakeUSB here because it mocks out too much
 */
const { sinon, expect, getFakeWifiDevice } = require('../test/support');
const { UsbDevice } = require('./usb-device-node');
const { PLATFORMS } = require('./platforms');

describe('WifiDevice', () => {
	let usbDevice, p2Platform, wifiDevice;

	// this is a hidden network associated with a
	// TP-Link N300 Wireless Portable Nano Travel Router
	// note it does not have an ssid
	const fakeNetworkWithoutSSID = {
		'bssid': 'c0c9e376992f',
		'security': 3,
		'channel': 1,
		'rssi': -20
	};

	// This is the actual 2.4 GHz network in Joe's House
	const fakeValidNetwork1 = {
		'ssid': 'how24ghz',
		'bssid': '382c4a6a9040',
		'security': 3,
		'channel': 1,
		'rssi': -58
	};

	// This is the actual 5 GHz network in Joe's House
	const fakeValidNetwork2 = {
		'ssid': 'how5ghz',
		'bssid': '382c4a6a9044',
		'security': 3,
		'channel': 157,
		'rssi': -66
	};

	// Note; no security field set for Comcast's WiFI
	const fakeNetworkWithoutSecurity = {
		'ssid': 'xfinitywifi',
		'bssid': '1e9ecc0bed24',
		'channel': 157,
		'rssi': -88
	};

	const fakeScanNetworksReply = {
		networks: [
			fakeValidNetwork1,
			fakeValidNetwork2,
			fakeNetworkWithoutSSID,
			fakeNetworkWithoutSecurity
		]
	};

	beforeEach(async () => {
		usbDevice = new UsbDevice({});
		p2Platform = PLATFORMS.find(element => element.name === 'p2');
		wifiDevice = getFakeWifiDevice(usbDevice, p2Platform);
	});

	afterEach(() => {
		sinon.restore();
	});

	it('Provides scanWifiNetworks(); when no networks are returned', async () => {
		sinon.stub(wifiDevice, 'sendProtobufRequest').resolves({ networks: [] });
		const result = await wifiDevice.scanWifiNetworks();
		expect(result).to.eql([]);
	});

	it('Provides scanWifiNetworks(); when valid networks are returned', async () => {
		sinon.stub(wifiDevice, 'sendProtobufRequest').resolves(fakeScanNetworksReply);
		const networks = await wifiDevice.scanWifiNetworks();
		expect(networks).to.have.lengthOf(fakeScanNetworksReply.networks.length);
	});

	it('implements scanWifiNetworks() in a way that sets ssid to null if reply is undefined', async () => {
		sinon.stub(wifiDevice, 'sendProtobufRequest').resolves(fakeScanNetworksReply);
		const networks = await wifiDevice.scanWifiNetworks();
		expect(networks[2].bssid).to.eql(fakeNetworkWithoutSSID.bssid, 'targeting correct fixture');
		expect(fakeNetworkWithoutSSID).to.not.have.haveOwnProperty('ssid');
		expect(networks[2].ssid).to.eql(null);
	});

	it('implements scanWifiNetworks() in a way that sets security to null if reply is undefined', async () => {
		sinon.stub(wifiDevice, 'sendProtobufRequest').resolves(fakeScanNetworksReply);
		const networks = await wifiDevice.scanWifiNetworks();
		expect(networks[3].bssid).to.eql(fakeNetworkWithoutSecurity.bssid, 'targeting correct fixture');
		expect(fakeNetworkWithoutSecurity).to.not.have.haveOwnProperty('security');
		expect(networks[3].security).to.eql(null);
	});
});
