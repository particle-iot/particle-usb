import * as usb from '../src/particle-usb';
import { expect, dump } from './support/setup';

describe('Client', function() {
  this.timeout(3000);
  this.slow(2000);

  describe('list()', () => {
    it('enumerates Particle USB devices', async () => {
      const devs = await usb.Device.list();
      expect(devs).to.not.be.empty;
    });
  });

  describe('openById()', () => {
    it('opens a device with the specified ID', async () => {
      const dev = await usb.Device.openById('2a0031000447343138333038');
    });
  });
});
