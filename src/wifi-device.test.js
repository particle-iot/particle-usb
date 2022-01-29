/**
 * We deliberately don't use fakeUSB here because it mocks out too much
 */
const { sinon, expect, getFakeWifiDevice } = require('../test/support');
const { UsbDevice } = require('./usb-device-node');
const { PLATFORMS } = require('./platforms');
const { TimeoutError } = require('./error');

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

	describe('scanWifiNetworks()', () => {
		it('returns empty when no networks are returned', async () => {
			sinon.stub(wifiDevice, 'sendProtobufRequest').resolves({ networks: [] });
			const result = await wifiDevice.scanWifiNetworks();
			expect(result).to.eql([]);
		});

		it('returns valid networks', async () => {
			sinon.stub(wifiDevice, 'sendProtobufRequest').resolves(fakeScanNetworksReply);
			const networks = await wifiDevice.scanWifiNetworks();
			expect(networks).to.have.lengthOf(fakeScanNetworksReply.networks.length);
		});

		it('sets ssid to null if Device OS returns with undefined', async () => {
			sinon.stub(wifiDevice, 'sendProtobufRequest').resolves(fakeScanNetworksReply);
			const networks = await wifiDevice.scanWifiNetworks();
			expect(networks[2].bssid).to.eql(fakeNetworkWithoutSSID.bssid, 'targeting correct fixture');
			expect(fakeNetworkWithoutSSID).to.not.have.haveOwnProperty('ssid');
			expect(networks[2].ssid).to.eql(null);
		});

		it('sets security to null if Device OS returns with undefined', async () => {
			sinon.stub(wifiDevice, 'sendProtobufRequest').resolves(fakeScanNetworksReply);
			const networks = await wifiDevice.scanWifiNetworks();
			expect(networks[3].bssid).to.eql(fakeNetworkWithoutSecurity.bssid, 'targeting correct fixture');
			expect(fakeNetworkWithoutSecurity).to.not.have.haveOwnProperty('security');
			expect(networks[3].security).to.eql(null);
		});
	});

	describe('joinNewWifiNetwork()', () => {
		let ssid, password;
		beforeEach(() => {
			ssid = 'ssid';
			password = 'password';
		});

		it('Connects to network with valid SSID and password', async () => {
			sinon.stub(wifiDevice, 'sendProtobufRequest').resolves({
				constructor: {
					name: 'JoinNewNetworkReply'
				}
			});
			const result = await wifiDevice.joinNewWifiNetwork({
				ssid, password
			});
			expect(result).to.be.an('object');
			expect(result.pass).to.eql(true);
		});

		it('Does not connect to network when sendProtobufRequest returns undefined', async () => {
			sinon.stub(wifiDevice, 'sendProtobufRequest').resolves(undefined); // This is one way that Device OS can reply
			const result = await wifiDevice.joinNewWifiNetwork({
				ssid, password
			});
			expect(result).to.be.an('object');
			expect(result.pass).to.eql(false);
			expect(result.error).to.eql('Device did not return a valid reply. expected=JoinNewNetworkReply actual=undefined');
		});

		it('Does not connect to network when sendProtobufRequest throws TimeourError', async () => {
			sinon.stub(wifiDevice, 'sendProtobufRequest').throws(new TimeoutError());
			const result = await wifiDevice.joinNewWifiNetwork({
				ssid, password
			});
			expect(result).to.be.an('object');
			expect(result.pass).to.eql(false);
			expect(result.error).to.eql('Request timed out, exceeded 20000ms');
		});

		it('Throws errors other than TimeoutError', async () => {
			sinon.stub(wifiDevice, 'sendProtobufRequest').throws(new Error('hihihi'));

			let error;
			try {
				await wifiDevice.joinNewWifiNetwork({
					ssid, password
				});
			} catch (e) {
				error = e;
			}
			expect(error.message).to.eql('hihihi');
		});
	});
});
