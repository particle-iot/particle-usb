import { getDevices } from '../src/particle-usb';
import { RequestError } from '../src/error';

import { expect } from './support';

// Note: This test requires physical device to be connected to the host via USB and is skipped by default
describe.skip('mesh-network-diagnostics', function() {
  // Mesh device operations may take a while
  this.timeout(60000);
  this.slow(45000);

  let dev = null;

  before(async () => {
    let devs = await getDevices();
    devs = devs.filter(dev => dev.isMeshDevice);
    dev = devs[0];
    await dev.open();
  });

  after(async () => {
    await dev.close();
  });

  describe('MeshDevice', () => {
    describe('getNetworkDiagnostics()', () => {
      it('gets diagnostic info about the current mesh network from one of the nodes', async () => {
        const diag = await dev.getNetworkDiagnostics({
          queryChildren: true,
          resolveDeviceId: true,
          diagnosticTypes: [
              'MAC_EXTENDED_ADDRESS',
              'RLOC',
              'MAC_ADDRESS',
              'MODE',
              'TIMEOUT',
              'CONNECTIVITY',
              'ROUTE64',
              'LEADER_DATA',
              'NETWORK_DATA',
              'IPV6_ADDRESS_LIST',
              'MAC_COUNTERS',
              'BATTERY_LEVEL',
              'SUPPLY_VOLTAGE',
              'CHILD_TABLE',
              'CHANNEL_PAGES',
              'MAX_CHILD_TIMEOUT'
          ]
        });
        expect(diag).to.be.an('object');
        expect(diag).to.have.key('nodes');
        expect(diag.nodes).to.be.an('array');
        expect(diag.nodes).to.have.lengthOf.above(0);
        diag.nodes.forEach(node => {
            expect(node).to.have.property('rloc');
        });
        expect(diag.nodes).to.containSubset([{ deviceId: Buffer.from(dev.id, 'hex') }]);
      });
    })
  });
});
