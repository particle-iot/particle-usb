const { setDevicePrototype } = require('./set-device-prototype');
const { fakeUsb, sinon, expect } = require('../test/support');
const proxyquire = require('proxyquire');
const { NotFoundError } = require('./error');

const { getDevices } = proxyquire('../src/device-base', {
	'./usb-device-node': fakeUsb
});

describe('NetworkDevice', () => {
	beforeEach(async () => {
		const usbDevs = [];fakeUsb.addDevice({ vendorId: 0xaaaa, productId: 0xaaaa });
		usbDevs.push(fakeUsb.addP2());
	});

	afterEach(() => {
		sinon.restore();
	});

	describe('NetworkDevice (all deprecated methods)', () => {

		const deprecatedMethods = ['getNetworkStatus', 'getNetworkConfig', 'setNetworkConfig'];
		for (const method of deprecatedMethods) {
			it(`provides ${method}`, async () => {
				const fakeDevice = { type: 'p2' }; // could be any device type
				const result = setDevicePrototype(fakeDevice);
				expect(result[method]).to.be.a('Function');
			});
		}
	});

	describe('getNetworkInfo', () => {
		let dev;
		beforeEach(async () => {
			const devs = await getDevices();
			dev = setDevicePrototype(devs[0]);
			await dev.open();
		});

		afterEach(async () => {
			await dev.close();
		});

		it('parses the result', async () => {
			const input = {
				'index': 4,
				'name': 'wl3',
				'type': 8,
				'flags': 98307,
				'extFlags': 1048576,
				'ipv4Config': {
					'dns': [
						{
							'address': 3232257567
						}
					],
					'addresses': [
						{
							'address': {
								'v4': {
									'address': 3232257567
								}
							},
							'prefixLength': 24
						}
					]
				},
				'ipv6Config': {
					'dns': [
						{
							'address': Buffer.from([2, 1, 4, 3, 6, 5, 8, 7, 10, 9, 12, 11, 14, 13, 15])
						}
					],
					'addresses': [
						{
							'address': {
								'v6': {
									'address': Buffer.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15])
								}
							},
							'prefixLength': 24
						}
					]
				},
				'hwAddress': Buffer.from([48,174,164,229,83,16]),
				'mtu': 1500,
				'metric': 0,
				'profile': Buffer.from([])
			};

			const expectedOutput = {
				'index': 4,
				'name': 'wl3',
				'type': 'WIFI',
				'hwAddress': '30:ae:a4:e5:53:10',
				'ipv4Config': {
					'addresses': ['192.168.86.31/24'],
					'gateway': undefined,
					'peer': undefined,
					'dns': ['192.168.86.31'],
					'source': 'UNKNOWN'
				},
				'ipv6Config': {
					'addresses': ['0001:0203:0405:0607:0809:0a0b:0c0d:0e0f/24'],
					'gateway': undefined,
					'dns': ['0002:0104:0306:0508:070a:090c:0b0e:0d0f'],
					'source': 'UNKNOWN'
				},
				'mtu': 1500,
				'flagsVal': 98307,
				'extFlags': 1048576,
				'flagsStrings': ['UP', 'BROADCAST', 'MULTICAST', 'NOND6'],
				'metric': 0,
				'profile': Buffer.from([])
			};
			sinon.stub(dev, 'sendRequest').resolves({ interface: input });

			const res = await dev.getNetworkInterface({ index: 4 });

			expect(res).to.eql(expectedOutput);
		});

		it('returns an error if the interface is invalid', async () => {
			sinon.stub(dev, 'sendRequest').resolves({});

			let error;
			try {
				await dev.getNetworkInterface({ index: 4 });
			} catch (_e) {
				error = _e;
			}

			expect(error).to.be.an.instanceOf(NotFoundError);
		});
	});
});
