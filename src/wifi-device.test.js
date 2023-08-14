const { sinon, expect } = require('../test/support');
const { setDevicePrototype } = require('./set-device-prototype');
const { PLATFORMS } = require('./platforms');
const { TimeoutError } = require('./error');

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

			let fakeReply;
			beforeEach(() => {
				fakeReply = {
					pass: true,
					replyObject: {
						constructor: {
							name: 'wifi.ScanNetworksReply'
						},
						networks: [
							fakeValidNetwork1,
							fakeValidNetwork2,
							fakeNetworkWithoutSSID,
							fakeNetworkWithoutSecurity
						]
					}
				};
			});

			it('returns empty when no networks are returned', async () => {
				const fakeNetworks = [];
				fakeReply.replyObject.networks = fakeNetworks;
				sinon.stub(wifiDevice, '_sendAndHandleProtobufRequest').resolves(fakeReply);
				const networks = await wifiDevice.scanWifiNetworks();
				expect(networks).to.eql(fakeNetworks);
			});

			it('returns empty when pass:false (failure for known/normal reasons like TimeoutError or wrong reply message)', async () => {
				fakeReply.pass = false;
				sinon.stub(wifiDevice, '_sendAndHandleProtobufRequest').resolves(fakeReply);
				const networks = await wifiDevice.scanWifiNetworks();
				expect(networks).to.eql([]);
			});

			it('returns valid networks with strings for security fields rather than integers', async () => {
				sinon.stub(wifiDevice, '_sendAndHandleProtobufRequest').resolves(fakeReply);
				const networks = await wifiDevice.scanWifiNetworks();
				expect(networks).to.not.eql(fakeReply.replyObject.networks);
				expect(networks).to.have.lengthOf(fakeReply.replyObject.networks.length);
				const firstNetwork = networks[0];
				expect(firstNetwork.security).to.eql('WPA2_PSK');
			});

			it('converts security integer values to meaningful values based on existing protobuf enum', async () => {
				expect(wifiDevice._mapSecurityValueToString(undefined)).to.eql('UNKNOWN');
				expect(wifiDevice._mapSecurityValueToString(0)).to.eql('NO_SECURITY');
				expect(wifiDevice._mapSecurityValueToString(1)).to.eql('WEP');
				expect(wifiDevice._mapSecurityValueToString(2)).to.eql('WPA_PSK');
				expect(wifiDevice._mapSecurityValueToString(3)).to.eql('WPA2_PSK');
				expect(wifiDevice._mapSecurityValueToString(4)).to.eql('WPA_WPA2_PSK');
				expect(wifiDevice._mapSecurityValueToString(444)).to.eql('UNKNOWN');
			});

			it('sets ssid to null if Device OS returns with undefined', async () => {
				sinon.stub(wifiDevice, '_sendAndHandleProtobufRequest').resolves(fakeReply);
				const networks = await wifiDevice.scanWifiNetworks();
				expect(networks[2].bssid).to.eql(fakeNetworkWithoutSSID.bssid, 'targeting correct fixture');
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
					pass: true,
					replyObject: {
						constructor: {
							name: 'JoinNewNetworkReply'
						}
					}
				};
				sinon.stub(wifiDevice, '_sendAndHandleProtobufRequest').resolves(fakeReply);
				const result = await wifiDevice.joinNewWifiNetwork({ ssid, password });
				expect(result).to.eql(fakeReply);
				expect(wifiDevice._sendAndHandleProtobufRequest).to.have.property('callCount', 1);
				expect(wifiDevice._sendAndHandleProtobufRequest.firstCall.args).to.have.lengthOf(3);
				expect(wifiDevice._sendAndHandleProtobufRequest.firstCall.args[0]).to.eql('wifi.JoinNewNetworkRequest');
				expect(wifiDevice._sendAndHandleProtobufRequest.firstCall.args[1]).to.eql(
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
				expect(wifiDevice._sendAndHandleProtobufRequest.firstCall.args[2]).to.eql(undefined);
			});

			// sc-96826: Once sc-TODO is fixed, this test should start working with some mods
			xit('Can Join open Wifi network without security/password', async () => {
				const fakeReply = {
					pass: true,
					replyObject: {
						constructor: {
							name: 'JoinNewNetworkReply'
						}
					}
				};
				sinon.stub(wifiDevice, '_sendAndHandleProtobufRequest').resolves(fakeReply);

				const result = await wifiDevice.joinNewWifiNetwork({ ssid, password: null });
				expect(result).to.eql(fakeReply);
				expect(wifiDevice._sendAndHandleProtobufRequest).to.have.property('callCount', 1);
				expect(wifiDevice._sendAndHandleProtobufRequest.firstCall.args).to.have.lengthOf(3);
				expect(wifiDevice._sendAndHandleProtobufRequest.firstCall.args[0]).to.eql('wifi.JoinNewNetworkRequest');
				expect(wifiDevice._sendAndHandleProtobufRequest.firstCall.args[1]).to.eql(
					{
						ssid,
						bssid: null,
						security: 0
					}
				);
				expect(wifiDevice._sendAndHandleProtobufRequest.firstCall.args[2]).to.eql(undefined);
			});
		});

		describe('clearWifiNetworks()', () => {
			it('Sends wifi.ClearKnownNetworksRequest protobuf message', async () => {
				const fakeReply = {
					pass: true,
					replyObject: {
						constructor: {
							name: 'ClearKnownNetworksReply'
						}
					}
				};
				sinon.stub(wifiDevice, '_sendAndHandleProtobufRequest').resolves(fakeReply);
				const result = await wifiDevice.clearWifiNetworks();
				expect(result).to.eql(fakeReply);
				expect(wifiDevice._sendAndHandleProtobufRequest).to.have.property('callCount', 1);
				expect(wifiDevice._sendAndHandleProtobufRequest.firstCall.args).to.have.lengthOf(3);
				expect(wifiDevice._sendAndHandleProtobufRequest.firstCall.args[0]).to.eql('wifi.ClearKnownNetworksRequest');
				expect(wifiDevice._sendAndHandleProtobufRequest.firstCall.args[1]).to.eql({});
				expect(wifiDevice._sendAndHandleProtobufRequest.firstCall.args[2]).to.eql(undefined);
			});
		});

		describe('_sendAndHandleProtobufRequest', () => {
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
				const result = await wifiDevice._sendAndHandleProtobufRequest(
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
				expect(result.pass).to.eql(true);
			});

			it('Does not pass when sendProtobufRequest returns undefined', async () => {
				sinon.stub(wifiDevice, 'sendProtobufRequest').resolves(undefined); // This is one way that Device OS can reply
				const result = await wifiDevice._sendAndHandleProtobufRequest(
					protobufMessageName,
					protobufMessageData,
					options
				);
				expect(result).to.be.an('object');
				expect(result.pass).to.eql(false);
				expect(result.error).to.eql(`Device did not return a valid reply. expected=${protobufMessageReplyConstructorName} actual=undefined`);
			});

			it('Does not pass when sendProtobufRequest throws TimeoutError with the default timeout', async () => {
				sinon.stub(wifiDevice, 'sendProtobufRequest').throws(new TimeoutError());
				const result = await wifiDevice._sendAndHandleProtobufRequest(
					protobufMessageName,
					protobufMessageData,
					options
				);
				expect(result).to.be.an('object');
				expect(result.pass).to.eql(false);
				expect(result.error).to.eql('Request timed out, exceeded default timeout');
			});

			it('Does not pass when sendProtobufRequest throws TimeoutError with an override timeout message', async () => {
				sinon.stub(wifiDevice, 'sendProtobufRequest').throws(new TimeoutError());
				const result = await wifiDevice._sendAndHandleProtobufRequest(
					protobufMessageName,
					protobufMessageData,
					{ timeout: 20000 }
				);
				expect(result).to.be.an('object');
				expect(result.pass).to.eql(false);
				expect(result.error).to.eql('Request timed out, exceeded 20000ms');
				expect(wifiDevice.sendProtobufRequest.firstCall.args[2]).to.eql({ timeout: 20000 });
			});

			it('Throws errors other than TimeoutError', async () => {
				sinon.stub(wifiDevice, 'sendProtobufRequest').throws(new Error('hihihi'));

				let error;
				try {
					await wifiDevice._sendAndHandleProtobufRequest(
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
