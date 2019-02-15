import { getDevices } from '../src/particle-usb';
import { RequestError } from '../src/error';

import { expect, optionalTest } from './support';

const NETWORK_ID = '000000000000000000000000'; // Dummy network ID
const NETWORK_NAME = 'TestNetwork'; // Test network name
const NETWORK_PASSWORD = '123456'; // Commissioner password
const NETWORK_CHANNEL = 11; // Network channel

describe('mesh-device', function() {
  // Mesh device operations may take a while
  this.timeout(60000);
  this.slow(45000);

  let dev1 = null;
  let dev2 = null;

  before(function() {
    return optionalTest(this, async () => {
      let devs = await getDevices();
      devs = devs.filter(dev => dev.isMeshDevice);
      if (devs.length < 2) {
        throw new Error('This test requires 2 mesh devices connected to the host via USB');
      }
      dev1 = devs[0];
      await dev1.open();
      await dev1.enterListeningMode();
      dev2 = devs[1];
      await dev2.open();
      await dev2.enterListeningMode();
    });
  });

  after(async () => {
    if (dev1) {
      await dev1.leaveMeshNetwork();
      await dev1.close();
    }
    if (dev2) {
      await dev2.leaveMeshNetwork();
      await dev2.close();
    }
  });

  describe('MeshDevice', () => {
    let panId = null;
    let extPanId = null;

    describe('createMeshNetwork()', () => {
      it('creates a new mesh network', async () => {
        const r = await dev1.createMeshNetwork({ // Device 1
          id: NETWORK_ID,
          name: NETWORK_NAME,
          password: NETWORK_PASSWORD,
          channel: NETWORK_CHANNEL
        });
        expect(r.panId).to.be.a('number');
        expect(r.extPanId).to.have.lengthOf(16); // A hex-encoded 64-bit value
        expect(r.channel).to.be.a('number');
        panId = r.panId;
        extPanId = r.extPanId;
      });
      it('throws an exception if the network name is too long or missing', async () => {
        let p = dev2.createMeshNetwork({ // Device 2
          id: NETWORK_ID,
          password: NETWORK_PASSWORD,
          channel: NETWORK_CHANNEL
        });
        await expect(p).to.be.rejectedWith(RangeError);
        p = dev2.createMeshNetwork({
          name: 'This network name is too long',
          id: NETWORK_ID,
          password: NETWORK_PASSWORD,
          channel: NETWORK_CHANNEL
        });
        await expect(p).to.be.rejectedWith(RangeError);
      });
      it('throws an exception if the network password is too short or missing', async () => {
        let p = dev2.createMeshNetwork({ // Device 2
          id: NETWORK_ID,
          name: NETWORK_NAME,
          channel: NETWORK_CHANNEL
        });
        await expect(p).to.be.rejectedWith(RangeError);
        p = dev2.createMeshNetwork({
          password: '1234',
          id: NETWORK_ID,
          name: NETWORK_NAME,
          channel: NETWORK_CHANNEL
        });
        await expect(p).to.be.rejectedWith(RangeError);
      });
      it('throws an exception if the network ID is missing or has an invalid length', async () => {
        let p = dev2.createMeshNetwork({ // Device 2
          name: NETWORK_NAME,
          password: NETWORK_PASSWORD,
          channel: NETWORK_CHANNEL
        });
        await expect(p).to.be.rejectedWith(RangeError);
        p = dev2.createMeshNetwork({
          id: '1234',
          name: NETWORK_NAME,
          password: NETWORK_PASSWORD,
          channel: NETWORK_CHANNEL
        });
        await expect(p).to.be.rejectedWith(RangeError);
      });
    });

    describe('getMeshNetworkInfo()', () => {
      it('gets info about the current mesh network', async () => {
        const r = await dev1.getMeshNetworkInfo(); // Device 1
        expect(r.id).to.equal(NETWORK_ID);
        expect(r.name).to.equal(NETWORK_NAME);
        expect(r.channel).to.equal(NETWORK_CHANNEL);
        expect(r.panId).to.equal(panId);
        expect(r.extPanId).to.equal(extPanId);
      });
      it('returns null if the device is not a member of a network', async () => {
        await dev2.leaveMeshNetwork(); // Device 2
        const r = await dev2.getMeshNetworkInfo();
        expect(r).to.be.null;
      });
    });

    describe('meshAuth()', () => {
      it('authenticates the host on the device', async () => {
        await dev1.meshAuth(NETWORK_PASSWORD); // Device 1
      });
      it('throws an exception if the password is incorrect', async () => {
        await expect(dev1.meshAuth('qwerty')).to.be.rejectedWith(RequestError); // Device 1
      });
    });

    describe('scanMeshNetworks()', () => {
      it('scans for mesh networks', async () => {
        const r = await dev2.scanMeshNetworks(); // Device 2
        expect(r).to.deep.include({
          name: NETWORK_NAME,
          channel: NETWORK_CHANNEL,
          panId: panId,
          extPanId: extPanId
        });
      });
    });

    describe('startCommissioner()', () => {
      it('starts the commissioner role on the device', async () => {
        await dev1.startCommissioner(); // Device 1
      });
    });

    describe('joinMeshNetwork()', () => {
      it('makes the device join the network', async () => {
        await dev2.joinMeshNetwork(dev1); // Device 1 is a commissioner
        const r = await dev2.getMeshNetworkInfo();
        expect(r.id).to.equal(NETWORK_ID);
        expect(r.name).to.equal(NETWORK_NAME);
        expect(r.channel).to.equal(NETWORK_CHANNEL);
        expect(r.panId).to.equal(panId);
        expect(r.extPanId).to.equal(extPanId);
      });
    });

    describe('stopCommissioner()', () => {
      it('stops the commissioner role', async () => {
        await dev1.stopCommissioner(); // Device 1
      });
    });

    describe('getNetworkDiagnostics()', () => {
      it('gets diagnostic info about the current mesh network from one of the nodes', async () => {
        const diag = await dev1.getNetworkDiagnostics({
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
        expect(diag.nodes).to.have.lengthOf(2);
        diag.nodes.forEach(node => {
            expect(node).to.have.property('rloc');
        });
        expect(diag.nodes).to.containSubset([
          { deviceId: Buffer.from(dev1.id, 'hex') },
          { deviceId: Buffer.from(dev2.id, 'hex') },
        ]);
      });
    })

    describe('leaveMeshNetwork()', () => {
      it('erases the network credentials', async () => {
        await dev1.leaveMeshNetwork(); // Device 1
      });
      it('succeeds if the device is not a member of a network', async () => {
        await dev1.leaveMeshNetwork(); // Device 1
      });
    });
  });
});
