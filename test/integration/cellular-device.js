const { getDevices } = require('../../src/particle-usb');

const { expect, integrationTest } = require('../support');

describe('cellular-device', function desc() {
	// Cellular device operations may take a while
	this.timeout(60000);
	this.slow(45000);

	let devs = [];
	let dev = null;

	before(function setup() {
		return integrationTest(this, async () => {
			let devs = await getDevices();
			devs = devs.filter(dev => dev.isCellularDevice);
			if (!devs.length) {
				throw new Error('This test suite requires at least one cellular device');
			}
			dev = devs[0];
		});
	});

	afterEach(async () => {
		for (let dev of devs) {
			await dev.close();
		}
	});

	describe('CellularDevice', () => {
		describe('getIccid()', () => {
			it('gets ICCID of the active SIM card', async () => {
				await dev.open();
				const iccid = await dev.getIccid();
				expect(iccid).to.have.lengthOf.within(20, 22);
			});
		});
	});
});
