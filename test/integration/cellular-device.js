import { getDevices } from '../../src/particle-usb';

import { expect, integrationTest } from '../support';

describe('cellular-device', function() {
  // Cellular device operations may take a while
  this.timeout(60000);
  this.slow(45000);

  let dev = null;

  before(function() {
    return integrationTest(this, async () => {
      let devs = await getDevices();
      devs = devs.filter(dev => dev.isCellularDevice);
      if (devs.length < 1) {
        throw new Error('This test requires a cellular device connected to the host via USB');
      }
      dev = devs[0];
      await dev.open();
    });
  });

  after(async () => {
    if (dev) {
      await dev.close();
    }
  });

  describe('CellularDevice', () => {
    describe('getIccid()', () => {
      it('gets ICCID of the active SIM card', async () => {
        const iccid = await dev.getIccid();
        expect(iccid).to.have.lengthOf.within(20, 22);
      });
    });
  });
});
