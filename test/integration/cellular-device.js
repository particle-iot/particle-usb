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
			devs = await getDevices();
			devs = devs.filter(dev => dev.isCellularDevice);
			if (!devs.length) {
				throw new Error('This test suite requires at least one cellular device');
			}
			dev = devs[0];
		});
	});

	afterEach(async () => {
		for (const dev of devs) {
			await dev.close();
		}
	});

	describe('CellularDevice', () => {
		describe('getCellularInfo()', () => {
			it('gets ICCID and IMEI of the cell radio', async () => {
				await dev.open();
				const iccidResp = await dev.getCellularInfo();

				expect(iccidResp).to.be.an('string');
				expect(iccidResp).to.have.lengthOf.within(20, 22);
			});
		});

		describe('getIccid()', () => {
			it('gets ICCID and IMEI of the cell radio', async () => {
				await dev.open();
				const iccidResp = await dev.getIccid();

				expect(iccidResp).to.be.an('object');
				expect(iccidResp).to.have.all.keys('iccid', 'imei');
				expect(iccidResp.iccid).to.have.lengthOf.within(20, 22);
				expect(iccidResp.imei).to.have.lengthOf(15);
			});
		});
	});
});
