import { usb, expect, dump } from './support/setup';

describe('DeviceBase', function() {
  this.timeout(3000);
  this.slow(2000);
/*
  describe('list()', () => {
    it('enumerates Particle USB devices', async () => {
      const devs = await usb.DeviceBase.list();
      expect(devs).to.not.be.empty;
    });
  });

  describe('openById()', () => {
    it('opens a device with the specified ID', async () => {
      const dev = await usb.DeviceBase.openById('2a0031000447343138333038');
    });
  });
*/

  describe('test', () => {
    it('test', async () => {
      const devs = await usb.DeviceBase.list();
      expect(devs).to.not.be.empty;
      const dev = devs[0];
      // await dev.open();
    });
  });
});
