import { getDevices } from '../../src/particle-usb';

import { expect, integrationTest } from '../support';

describe('device-quirks', function desc() {
	// Cellular device operations may take a while
	this.timeout(60000);
	this.slow(45000);

	let devs = [];
	let dev = null;

	before(function setup() {
		return integrationTest(this, async () => {
			devs = await getDevices();
			if (!devs.length) {
				throw new Error('This test suite requires at least one device');
			}
			dev = devs[0];
		});
	});

	afterEach(async () => {
		for (let dev of devs) {
			await dev.close();
		}
	});

    describe('controlOutTransfersRequireDataStage', () => {
        it('disconnectFromCloud() does not timeout', async () => {
            await dev.open();
            // Force controlOutTransfersRequireDataStage quirk
            let quirks = dev.usbDevice.quirks;
            quirks.controlOutTransfersRequireDataStage = true;
            dev.usbDevice.quirks = quirks;
            // This is one of the requests without a data stage
            await dev.disconnectFromCloud({force: true});
        });
    });
});
