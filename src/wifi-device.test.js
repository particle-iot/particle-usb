const { sinon, expect } = require('../test/support');
const { setDevicePrototype } = require('./set-device-prototype');
const { PLATFORMS } = require('./platforms');
const { TimeoutError } = require('./error');
const { convertBufferToMacAddress } = require('./address-util');

describe('WifiDevice', () => {
	afterEach(() => {
		sinon.restore();
	});

	describe('expected interface for gen3+ wifi devices', () => {
		const relevantPlatformNames = PLATFORMS
			.filter(x => x.generation >= 3 && x.features.includes('wifi'))
			.map(x => x.name);

		const wifiDeviceInterface = [
			'scanWifiNetworks',
			'joinNewWifiNetwork',
			'clearWifiNetworks'
		];

		for (const platformName of relevantPlatformNames) {
			for (const func of wifiDeviceInterface) {
				it(`includes ${func} Function for ${platformName} platform`, () => {
					const fakeDevice = { type: platformName };
					const result = setDevicePrototype(fakeDevice);
					expect(result[func]).to.be.a('Function');
				});
			}
		}
	});

	describe('behaviors', () => {
		// TODO: Add helper functions for easily creating device instances in tests
		const fakeUSBDevice = { type: 'p2', _info : { dfu : false } };
		let wifiDevice;

		beforeEach(async () => {
			wifiDevice = setDevicePrototype(fakeUSBDevice);
		});

		afterEach(() => {
			sinon.restore();
		});

		describe('scanWifiNetworks()', () => {
			// this is a hidden network associated with a
			// TP-Link N300 Wireless Portable Nano Travel Router
			// note it does not have an ssid
			const fakeNetworkWithoutSSID = {
				'bssid': Buffer.alloc(6, 'c0c9e376992f', 'hex'),
				'security': 3,
				'channel': 1,
				'rssi': -20
			};

			// This is the actual 2.4 GHz network in Joe's House
			const fakeValidNetwork1 = {
				'ssid': 'how24ghz',
				'bssid': Buffer.alloc(6, '382c4a6a9040', 'hex'),
				'security': 3,
				'channel': 1,
				'rssi': -58
			};

			// This is the actual 5 GHz network in Joe's House
			const fakeValidNetwork2 = {
				'ssid': 'how5ghz',
				'bssid': Buffer.alloc(6, '382c4a6a9044', 'hex'),
				'security': 3,
				'channel': 157,
				'rssi': -66
			};

			// Note; no security field set for Comcast's WiFI
			const fakeNetworkWithoutSecurity = {
				'ssid': 'xfinitywifi',
				'bssid': Buffer.alloc(6, '1e9ecc0bed24', 'hex'),
				'channel': 157,
				'rssi': -88
			};

			beforeEach(() => {
			});

			it('returns empty when no networks are returned', async () => {
				sinon.stub(wifiDevice, 'sendProtobufRequest').resolves({ networks: [] });
				const networks = await wifiDevice.scanWifiNetworks();
				expect(networks).to.eql([]);
			});

			it('returns an error when request failed on the device side)', async () => {
				sinon.stub(wifiDevice, 'sendProtobufRequest').rejects(new Error('Request failed'));
				let error;
				try {
					await wifiDevice.scanWifiNetworks();
				} catch (e) {
					error = e;
				}
				expect(error).to.be.an.instanceof(Error);
				expect(error.message).to.eql('Request failed');
			});

			it('returns valid networks with strings for security fields rather than integers', async () => {
				const expectedNetworks = [
					fakeValidNetwork1,
					fakeValidNetwork2,
					fakeNetworkWithoutSSID,
					fakeNetworkWithoutSecurity
				];
				sinon.stub(wifiDevice, 'sendProtobufRequest').resolves({ networks: expectedNetworks });
				const networks = await wifiDevice.scanWifiNetworks();
				expect(networks).to.not.eql(expectedNetworks);
				expect(networks).to.have.lengthOf(expectedNetworks.length);
				const firstNetwork = networks[0];
				expect(firstNetwork.security).to.eql('WPA2_PSK');
			});

			it('sets ssid to null if Device OS returns with undefined', async () => {
				const expectedNetworks = [
					fakeValidNetwork1,
					fakeValidNetwork2,
					fakeNetworkWithoutSSID,
					fakeNetworkWithoutSecurity
				];
				sinon.stub(wifiDevice, 'sendProtobufRequest').resolves({ networks: expectedNetworks });
				const networks = await wifiDevice.scanWifiNetworks();
				expect(networks[2].bssid).to.eql(convertBufferToMacAddress(fakeNetworkWithoutSSID.bssid));
				expect(fakeNetworkWithoutSSID).to.not.have.haveOwnProperty('ssid');
				expect(networks[2].ssid).to.eql(null);
			});
		});

		describe('joinNewWifiNetwork()', () => {
			let ssid, password;
			beforeEach(() => {
				ssid = 'ssid';
				password = 'password';
			});

			it('Sends wifi.JoinNewNetworkRequest protobuf message with correct data', async () => {
				const fakeReply = {
					constructor: {
						name: 'JoinNewNetworkReply'
					}
				};
				sinon.stub(wifiDevice, 'sendProtobufRequest').resolves(fakeReply);
				const result = await wifiDevice.joinNewWifiNetwork({ ssid, password });

				expect(result).to.eql(fakeReply);
				expect(wifiDevice.sendProtobufRequest).to.have.property('callCount', 1);
				expect(wifiDevice.sendProtobufRequest.firstCall.args).to.have.lengthOf(3);
				expect(wifiDevice.sendProtobufRequest.firstCall.args[0]).to.eql('wifi.JoinNewNetworkRequest');
				expect(wifiDevice.sendProtobufRequest.firstCall.args[1]).to.eql(
					{
						ssid,
						bssid: null,
						security: null,
						credentials: {
							type: 1,
							password
						},
					}
				);
				expect(wifiDevice.sendProtobufRequest.firstCall.args[2]).to.eql(undefined);
			});

			it('Can Join open Wifi network without security/password', async () => {
				const fakeReply = {
					constructor: {
						name: 'JoinNewNetworkReply'
					}
				};
				sinon.stub(wifiDevice, 'sendProtobufRequest').resolves(fakeReply);

				const result = await wifiDevice.joinNewWifiNetwork({ ssid, password: null });
				expect(result).to.eql(fakeReply);
				expect(wifiDevice.sendProtobufRequest).to.have.property('callCount', 1);
				expect(wifiDevice.sendProtobufRequest.firstCall.args).to.have.lengthOf(3);
				expect(wifiDevice.sendProtobufRequest.firstCall.args[0]).to.eql('wifi.JoinNewNetworkRequest');
				expect(wifiDevice.sendProtobufRequest.firstCall.args[1]).to.eql(
					{
						ssid,
						bssid: null,
						security: 0
					}
				);
				expect(wifiDevice.sendProtobufRequest.firstCall.args[2]).to.eql(undefined);
			});
		});

		describe('clearWifiNetworks()', () => {
			it('Sends wifi.ClearKnownNetworksRequest protobuf message', async () => {
				const fakeReply = {
					constructor: {
						name: 'ClearKnownNetworksReply'
					}
				};
				sinon.stub(wifiDevice, 'sendProtobufRequest').resolves(fakeReply);
				const result = await wifiDevice.clearWifiNetworks();
				expect(result).to.eql(fakeReply);
				expect(wifiDevice.sendProtobufRequest).to.have.property('callCount', 1);
				expect(wifiDevice.sendProtobufRequest.firstCall.args).to.have.lengthOf(3);
				expect(wifiDevice.sendProtobufRequest.firstCall.args[0]).to.eql('wifi.ClearKnownNetworksRequest');
				expect(wifiDevice.sendProtobufRequest.firstCall.args[1]).to.eql({});
				expect(wifiDevice.sendProtobufRequest.firstCall.args[2]).to.eql(undefined);
			});
		});

		describe('sendProtobufRequest', () => {
			// We use the wifi.ClearKnownNetworksRequest as the example here
			// it could be any protobuf message though
			const protobufMessageName = 'wifi.ClearKnownNetworksRequest';
			const protobufMessageReplyConstructorName = 'ClearKnownNetworksReply';
			const protobufMessageData = {};
			const options = undefined;

			beforeEach(() => {

			});
			it('Calls sendProtobufRequest with correct arguments', async () => {
				sinon.stub(wifiDevice, 'sendProtobufRequest').resolves({
					constructor: {
						name: protobufMessageReplyConstructorName
					}
				});
				const result = await wifiDevice.sendProtobufRequest(
					protobufMessageName,
					protobufMessageData,
					options
				);
				expect(wifiDevice.sendProtobufRequest).to.have.property('callCount', 1);
				expect(wifiDevice.sendProtobufRequest.firstCall.args).to.have.lengthOf(3);
				expect(wifiDevice.sendProtobufRequest.firstCall.args[0]).to.eql(protobufMessageName);
				expect(wifiDevice.sendProtobufRequest.firstCall.args[1]).to.eql(protobufMessageData);
				expect(wifiDevice.sendProtobufRequest.firstCall.args[2]).to.eql(options);
				expect(result).to.be.an('object');
			});

			it('Does not pass when sendProtobufRequest returns undefined', async () => {
				sinon.stub(wifiDevice, 'sendProtobufRequest').resolves(undefined); // This is one way that Device OS can reply
				const result = await wifiDevice.sendProtobufRequest(
					protobufMessageName,
					protobufMessageData,
					options
				);
				expect(result).to.eql(undefined);
			});

			it('Does not pass when sendProtobufRequest throws TimeoutError with the default timeout', async () => {
				sinon.stub(wifiDevice, 'sendProtobufRequest').throws(new TimeoutError());
				let error;
				try {
					await wifiDevice.sendProtobufRequest(
						protobufMessageName,
						protobufMessageData,
						options
					);
				} catch (e) {
					error = e;
				}

				expect(error).to.be.an.instanceof(TimeoutError);
			});

			it('Does not pass when sendProtobufRequest throws TimeoutError with an override timeout message', async () => {
				sinon.stub(wifiDevice, 'sendProtobufRequest').throws(new TimeoutError());

				let error;
				try {
					await wifiDevice.sendProtobufRequest(
						protobufMessageName,
						protobufMessageData,
						{ timeout: 20000 }
					);
				} catch (e) {
					error = e;
				}

				expect(error).to.be.an.instanceof(TimeoutError);
				expect(wifiDevice.sendProtobufRequest.firstCall.args[2]).to.eql({ timeout: 20000 });
			});

			it('Throws errors other than TimeoutError', async () => {
				sinon.stub(wifiDevice, 'sendProtobufRequest').throws(new Error('hihihi'));

				let error;
				try {
					await wifiDevice.sendProtobufRequest(
						protobufMessageName,
						protobufMessageData,
						{ timeout: 20000 }
					);
				} catch (e) {
					error = e;
				}
				expect(error.message).to.eql('hihihi');
			});
		});
	});
});
