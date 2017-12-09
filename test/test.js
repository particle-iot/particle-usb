import { usb, expect } from './support';

// TODO: The tests below cover only basic functionality and require a real device connected to the host

const RequestType = {
  DIAGNOSTIC_INFO: 100
};

const DEVICE_ID = '2a0031000447343138333038';

describe('getDevices()', () => {
  it('enumerates Particle USB devices', async () => {
    const devs = await usb.getDevices();
    expect(devs).to.not.be.empty;
  });
});

describe('openDeviceById()', () => {
  it('opens a device with the specified ID', async () => {
    const dev = await usb.openDeviceById(DEVICE_ID);
    expect(dev.id).to.equal(DEVICE_ID);
    await dev.close(); // FIXME
  });
});

describe('DeviceBase', () => {
  describe('sendRequest()', () => {
    it('sends a request', async () => {
      const dev = await usb.openDeviceById(DEVICE_ID);
      const rep = await dev.sendRequest(RequestType.DIAGNOSTIC_INFO);
      await dev.close(); // FIXME
    });
  });
});
