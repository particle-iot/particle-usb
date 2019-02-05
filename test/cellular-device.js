import { getDevices } from '../src/particle-usb';

import { expect } from './support';

// Note: This test requires a physical device to be connected to the host via USB and is skipped by default
describe.skip('cellular-device', function() {
  // Cellular device operations may take a while
  this.timeout(60000);
  this.slow(45000);

  let dev = null;

  before(async () => {
    let devs = await getDevices();
    devs = devs.filter(dev => dev.isCellularDevice);
    if (devs.length != 1) {
      throw new Error('Make sure exactly one cellular device is connected to the host via USB');
    }
    dev = devs[0];
    await dev.open();
  });

  after(async () => {
    await dev.close();
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
