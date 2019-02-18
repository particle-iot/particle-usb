import { getDevices, openDeviceById } from '../../src/particle-usb';

import { expect, optionalTest } from '../support';

describe('device-base', function() {
  // Mesh device operations may take a while
  this.timeout(60000);
  this.slow(45000);

  let devs = [];
  let devIds = [];

  before(function() {
    return optionalTest(this, async () => {
      devs = await getDevices();
      if (devs.length < 2) {
        throw new Error('This test requires 2 devices connected to the host via USB');
      }
      // Get device IDs
      for (let dev of devs) {
        await dev.open();
        devIds.push(dev.id);
        await dev.close();
      }
    });
  });

  after(async () => {
    for (let dev of devs) {
      await dev.close();
    }
  });

  describe('openDeviceById()', () => {
    it('does not affect devices which are already open', async () => {
      expect(devIds).to.have.lengthOf.at.least(2);
      const dev1 = await openDeviceById(devIds[0]);
      const dev2 = await openDeviceById(devIds[1]);
      await dev1.stopNyanSignal(); // Send a dummy request
      await dev1.close();
      await dev1.open();
      await dev2.stopNyanSignal();
    });
  });
});
