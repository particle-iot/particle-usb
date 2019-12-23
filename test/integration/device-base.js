import { getDevices, openDeviceById } from '../../src/particle-usb';
import { MAX_CONTROL_TRANSFER_DATA_SIZE } from '../../src/usb-device-node';

import { expect, randomString, integrationTest } from '../support';

const RequestType = {
  ECHO: 1 // ctrl_request_type::CTRL_REQUEST_ECHO
};

describe('device-base', function() {
  this.timeout(60000);
  this.slow(45000);

  let devs = [];
  let dev = null;

  before(function() {
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

  describe('openDeviceById()', () => {
    it('does not affect devices which are already open', async () => {
      if (devs.length < 2) {
        throw new Error('This test requires 2 devices');
      }
      // Get device IDs
      const devIds = [];
      for (let i = 0; i < 2; ++i) {
        const dev = devs[i];
        await dev.open();
        devIds.push(dev.id);
        await dev.close();
      }
      const dev1 = await openDeviceById(devIds[0]);
      const dev2 = await openDeviceById(devIds[1]);
      await dev1.stopNyanSignal(); // Send a dummy request
      await dev1.close();
      await dev1.open();
      await dev2.stopNyanSignal();
    });
  });

  describe('DeviceBase', () => {
    describe('sendControlRequest()', async () => {
      it('can process multiple requests', async () => {
        await dev.open();
        const ps = [];
        for (let i = 0; i < 100; ++i) {
          const data = randomString(0, 512);
          const p = dev.sendControlRequest(RequestType.ECHO, data).then(rep => {
            expect(rep.data).to.equal(data);
          });
          ps.push(p);
        }
        await Promise.all(ps);
      });
    });

    describe('sendControlRequest()', async () => {
      it('can send a request and receive a reply larger than 4096 bytes', async () => {
        await dev.open();
        for (let i = 0; i < 10; ++i) {
          const data = randomString(MAX_CONTROL_TRANSFER_DATA_SIZE + 1);
          const rep = await dev.sendControlRequest(RequestType.ECHO, data);
          expect(rep.data).to.equal(data);
        }
      });
    });
  });
});
