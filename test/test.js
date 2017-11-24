import { usb, expect } from './support/setup';

// TODO: The tests below cover only basic functionality and require a real device connected to the host

describe('DeviceBase', function() {
  this.timeout(3000);
  this.slow(2000);

  describe('list()', () => {
    it('enumerates Particle USB devices', async () => {
      const devs = await usb.DeviceBase.list();
      expect(devs).to.not.be.empty;
    });
  });

  describe('openById()', () => {
    it('opens a device with the specified ID', async () => {
      const dev = await usb.DeviceBase.openById('2a0031000447343138333038');
      expect(dev.id).to.equal('2a0031000447343138333038');
    });
  });
});
