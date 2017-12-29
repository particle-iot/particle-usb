import { getDevices, openDeviceById, PollingPolicy } from '../src/device-base';
import { DeviceType } from '../src/device-type';
import * as usbImpl from '../src/node-usb';
import * as proto from '../src/usb-protocol';
import * as error from '../src/error';

import { fakeUsb, sinon, expect, assert, nextTick } from './support';

// Application-specific request types
const REQUEST_1 = 1;
const REQUEST_2 = 2;

describe('device-base', () => {
  before(() => {
    // Stub the USB implementation used by the library
    sinon.stub(usbImpl, 'getDevices').callsFake(fakeUsb.getDevices);
  });

  after(() => {
    usbImpl.getDevices.restore();
  });

  beforeEach(function() {
    this.tick = async t => {
      // Wait for the next event loop iteration to ensure that all promise callbacks get invoked:
      // https://github.com/sinonjs/sinon/issues/738
      await nextTick();
      this.sinon.clock.tick(t);
    };
    // Number of CHECK requests sent to a USB device during the test
    this.checkCount = 0;
    // Current polling policy
    this.pollingPolicy = PollingPolicy.DEFAULT;
    // Fires the CHECK request timer depending on current polling policy
    this.checkTimeout = async () => {
      await this.tick(this.pollingPolicy(this.checkCount++));
    };
    // "Detach" all USB devices
    fakeUsb.clearDevices();
  });

  describe('getDevices()', () => {
    it('enumerates only Particle USB devices', async () => {
      // Register a bunch of Particle and non-Particle devices
      const usbDevs = [];
      fakeUsb.addDevice({ vendorId: 0xaaaa, productId: 0xaaaa });
      usbDevs.push(fakeUsb.addCore());
      usbDevs.push(fakeUsb.addPhoton());
      fakeUsb.addDevice({ vendorId: 0xbbbb, productId: 0xbbbb });
      usbDevs.push(fakeUsb.addP1());
      usbDevs.push(fakeUsb.addElectron());
      fakeUsb.addDevice({ vendorId: 0xcccc, productId: 0xcccc });
      // Enumerate detected devices
      let devs = await getDevices();
      devs = devs.map(dev => dev.usbDevice);
      expect(devs).to.have.all.members(usbDevs);
    });

    it('includes devices in the DFU mode by default', async () => {
      const usbDevs = [
        fakeUsb.addCore({ dfu: true }),
        fakeUsb.addPhoton({ dfu: true }),
        fakeUsb.addP1({ dfu: true }),
        fakeUsb.addElectron({ dfu: true })
      ];
      let devs = await getDevices();
      devs = devs.map(dev => dev.usbDevice);
      expect(devs).to.have.all.members(usbDevs);
    });

    it('can optionally exclude devices in the DFU mode', async () => {
      const photon1 = fakeUsb.addPhoton({ dfu: true });
      const photon2 = fakeUsb.addPhoton({ dfu: false });
      const devs = await getDevices({ includeDfu: false });
      expect(devs).to.have.lengthOf(1);
      expect(devs[0].usbDevice).to.equal(photon2);
    });

    it('can filter detected devices by type', async () => {
      const core = fakeUsb.addCore();
      const photon = fakeUsb.addPhoton();
      const p1 = fakeUsb.addP1();
      const electron = fakeUsb.addElectron();
      let devs = await getDevices({ types: [DeviceType.DUO] });
      expect(devs).to.be.empty;
      devs = await getDevices({ types: [DeviceType.CORE] });
      expect(devs).to.have.lengthOf(1);
      expect(devs[0].usbDevice).to.equal(core);
      devs = await getDevices({ types: [DeviceType.PHOTON, DeviceType.P1, DeviceType.ELECTRON] });
      expect(devs).to.have.lengthOf(3);
      devs = devs.map(dev => dev.usbDevice);
      expect(devs).to.have.all.members([photon, p1, electron]);
    });
  });

  describe('openDeviceById()', () => {
    it('opens a device by ID', async () => {
      const photon1 = fakeUsb.addPhoton({ id: '111111111111111111111111' });
      const photon2 = fakeUsb.addPhoton({ id: '222222222222222222222222' });
      const photon3 = fakeUsb.addPhoton({ id: '333333333333333333333333' });
      const dev = await openDeviceById('222222222222222222222222');
      expect(dev.usbDevice).to.equal(photon2);
      expect(photon1.isOpen).to.be.false;
      expect(photon2.isOpen).to.be.true;
      expect(photon3.isOpen).to.be.false;
    });

    it('fails if the device cannot be found', async () => {
      const photon = fakeUsb.addPhoton({ id: '111111111111111111111111' });
      const dev = openDeviceById('222222222222222222222222');
      await expect(dev).to.be.rejectedWith(error.NotFoundError);
      expect(photon.isOpen).to.be.false;
    });

    it('ignores non-Particle devices with a matching serial number', async function() {
      const unknown = fakeUsb.addDevice({
        vendorId: 0xaaaa,
        productId: 0xbbbb,
        serialNumber: '111111111111111111111111'
      });
      const open = this.sinon.spy(unknown, 'open');
      const dev = openDeviceById('111111111111111111111111');
      await expect(dev).to.be.rejectedWith(error.NotFoundError);
      expect(open).to.have.not.been.called;
    });

    it('matches serial numbers in a case-insensitive manner', async () => {
      fakeUsb.addPhoton({ id: 'ABCDABCDABCDABCDABCDABCD' });
      fakeUsb.addElectron({ id: 'cdefcdefcdefcdefcdefcdef' });
      await openDeviceById('abcdabcdabcdabcdabcdabcd');
      await openDeviceById('CDEFCDEFCDEFCDEFCDEFCDEF');
    });
  });

  describe('DeviceBase', () => {
    let dev = null;
    let usbDev = null;

    beforeEach(async () => {
      // Add a test USB device to work with
      usbDev = fakeUsb.addPhoton({
        id: '111111111111111111111111',
        firmwareVersion: '1.0.0'
      });
      const devs = await getDevices();
      assert(devs.length != 0);
      dev = devs[0];
    });

    describe('open()', () => {
      it('opens the device', async () => {
        await dev.open();
        expect(dev.isOpen).to.be.true;
        expect(usbDev.isOpen).to.be.true;
      });

      it('initializes the device ID and firmware version properties of the device object', async () => {
        expect(dev.id).to.be.null;
        expect(dev.firmwareVersion).to.be.null;
        await dev.open();
        expect(dev.id).to.equal('111111111111111111111111');
        expect(dev.firmwareVersion).to.equal('1.0.0');
      });

      it('does not require the USB device to support the firmware version request', async () => {
        usbDev.options.firmwareVersion = null;
        await dev.open();
        expect(dev.firmwareVersion).to.be.null;
      });

      it('resets all pending requests after opening the USB device', async function() {
        const resetAllRequests = this.sinon.spy(usbDev.protocol, 'resetAllRequests');
        await dev.open();
        expect(resetAllRequests).to.have.been.calledOnce;
      });

      it('fails if the USB device was detached from the host', async () => {
        fakeUsb.removeDevice(usbDev);
        const open = dev.open();
        await expect(open).to.be.rejectedWith(error.UsbError);
      });

      it('fails if the device is already open', async () => {
        await dev.open();
        const open = dev.open();
        await expect(open).to.be.rejectedWith(error.StateError);
      });
    });

    describe('close()', () => {
      it('closes the device', async () => {
        await dev.open();
        await dev.close();
        expect(dev.isOpen).to.be.false;
        expect(usbDev.isOpen).to.be.false;
      });

      it('succeeds if the device is already closed', async () => {
        await dev.open();
        await dev.close();
        await dev.close();
      });

      it('can cancel pending requests before closing the device', async () => {
        await dev.open();
        const req1 = dev.sendRequest(REQUEST_1);
        const req2 = dev.sendRequest(REQUEST_2);
        const close = dev.close({ processPendingRequests: false });
        await expect(req1).to.be.rejectedWith(error.StateError);
        await expect(req2).to.be.rejectedWith(error.StateError);
        await close;
      });

      it('cancels pending requests when the timeout is reached', async function() {
        this.sinon.useFakeTimers();
        this.sinon.stub(usbDev.protocol, 'checkRequest').returns(proto.Status.PENDING);
        await dev.open();
        const req1 = dev.sendRequest(REQUEST_1);
        const req2 = dev.sendRequest(REQUEST_2);
        const close = dev.close({ timeout: 1000 });
        await this.tick(1000);
        await close;
        await expect(req1).to.be.rejectedWith(error.StateError);
        await expect(req2).to.be.rejectedWith(error.StateError);
      });

      it('resets active requests when the timeout is reached', async function() {
        this.sinon.useFakeTimers();
        this.sinon.stub(usbDev.protocol, 'checkRequest').returns(proto.Status.PENDING);
        const resetAllRequests = this.sinon.spy(usbDev.protocol, 'resetAllRequests');
        await dev.open();
        expect(resetAllRequests).to.have.been.calledOnce;
        const req = dev.sendRequest(REQUEST_1);
        const close = dev.close({ timeout: 1000 });
        await this.tick(1000);
        await close;
        await expect(req).to.be.rejectedWith(error.StateError);
        expect(resetAllRequests).to.have.been.calledTwice;
      });
    });

    describe('sendRequest()', () => {
      beforeEach(async () => {
        await dev.open();
      });

      it('can send a request without payload data', async function() {
        this.sinon.useFakeTimers();
        const initRequest = this.sinon.spy(usbDev.protocol, 'initRequest');
        const req = dev.sendRequest(REQUEST_1);
        await this.checkTimeout();
        await req;
        expect(initRequest).to.have.been.calledWith(sinon.match({ type: REQUEST_1 }));
      });

      it('can send a request with payload data', async function() {
        this.sinon.useFakeTimers();
        const initRequest = this.sinon.spy(usbDev.protocol, 'initRequest');
        const req = dev.sendRequest(REQUEST_1, Buffer.from('request data'));
        await this.checkTimeout();
        await req;
        expect(initRequest).to.have.been.calledWith(sinon.match({
          type: REQUEST_1,
          data: Buffer.from('request data')
        }));
      });

      it('polls the USB device until it allocates a buffer for the request data', async function() {
        this.sinon.useFakeTimers();
        const initRequest = this.sinon.stub(usbDev.protocol, 'initRequest')
            .returns(proto.Status.PENDING);
        const checkBuffer = this.sinon.stub(usbDev.protocol, 'checkBuffer')
            .onFirstCall().returns(proto.Status.PENDING)
            .onSecondCall().returns(proto.Status.PENDING)
            .returns(proto.Status.OK);
        const req = dev.sendRequest(REQUEST_1, Buffer.from('request data'));
        await this.checkTimeout();
        expect(checkBuffer).to.have.been.calledOnce;
        await this.checkTimeout();
        expect(checkBuffer).to.have.been.calledTwice;
        await this.checkTimeout();
        expect(checkBuffer).to.have.been.calledThrice;
        this.checkCount = 0;
        await this.checkTimeout();
        await req;
      });

      it('polls the USB device until it completes processing of a request', async function() {
        this.sinon.useFakeTimers();
        const checkRequest = this.sinon.stub(usbDev.protocol, 'checkRequest')
            .onFirstCall().returns(proto.Status.PENDING)
            .onSecondCall().returns(proto.Status.PENDING)
            .returns(proto.Status.OK);
        const req = dev.sendRequest(REQUEST_1);
        await this.checkTimeout();
        expect(checkRequest).to.have.been.calledOnce;
        await this.checkTimeout();
        expect(checkRequest).to.have.been.calledTwice;
        await this.checkTimeout();
        expect(checkRequest).to.have.been.calledThrice;
        await req;
      });

      it('resolves to an object containing the result code property', async function() {
        this.sinon.useFakeTimers();
        this.sinon.stub(usbDev.protocol, 'replyResult').returns(1234);
        const req = dev.sendRequest(REQUEST_1);
        await this.checkTimeout();
        const rep = await req;
        expect(rep).to.have.property('result');
        expect(rep.result).to.equal(1234);
        expect(rep).not.to.have.property('data');
      });

      it('resolves to an object containing the reply data property', async function() {
        this.sinon.useFakeTimers();
        this.sinon.stub(usbDev.protocol, 'replyResult').returns(0);
        this.sinon.stub(usbDev.protocol, 'replyData').returns(Buffer.from('reply data'));
        const req = dev.sendRequest(REQUEST_1);
        await this.checkTimeout();
        const rep = await req;
        expect(rep).to.have.property('result');
        expect(rep.result).to.equal(0);
        expect(rep).to.have.property('data');
        expect(rep.data).to.deep.equal(Buffer.from('reply data'));
      });

      it('sends requests to the USB device concurrently', async function() {
        this.sinon.useFakeTimers();
        this.sinon.stub(usbDev.protocol, 'checkRequest').returns(proto.Status.PENDING);
        const initRequest = this.sinon.spy(usbDev.protocol, 'initRequest');
        const req1 = dev.sendRequest(REQUEST_1);
        const req2 = dev.sendRequest(REQUEST_2);
        await this.checkTimeout();
        expect(initRequest).to.have.been.calledWith(sinon.match({ type: REQUEST_1 }));
        expect(initRequest).to.have.been.calledWith(sinon.match({ type: REQUEST_2 }));
      });

      it('limits the maximum number of concurrent requests', async function() {
        // Reopen the device with different settings
        await dev.close();
        await dev.open({ concurrentRequests: 1 });
        this.sinon.useFakeTimers();
        this.sinon.stub(usbDev.protocol, 'checkRequest').returns(proto.Status.PENDING);
        const initRequest = this.sinon.spy(usbDev.protocol, 'initRequest');
        const req1 = dev.sendRequest(REQUEST_1);
        const req2 = dev.sendRequest(REQUEST_2);
        await this.checkTimeout();
        expect(initRequest).to.have.been.calledWith(sinon.match({ type: REQUEST_1 }));
        expect(initRequest).to.not.have.been.calledWith(sinon.match({ type: REQUEST_2 }));
      });

      it('times out after a specified amount of time', async function() {
        this.sinon.useFakeTimers();
        const req = dev.sendRequest(REQUEST_1, null, { timeout: 1000 });
        this.tick(1000);
        await expect(req).to.be.rejectedWith(error.TimeoutError);
      });

      it('resets an active request when it times out', async function() {
        this.sinon.useFakeTimers();
        this.sinon.stub(usbDev.protocol, 'checkRequest').returns(proto.Status.PENDING);
        const resetRequest = this.sinon.spy(usbDev.protocol, 'resetRequest');
        const req = dev.sendRequest(REQUEST_1, null, { timeout: 1000 });
        await this.tick(1000);
        await expect(req).to.be.rejectedWith(error.TimeoutError);
        expect(resetRequest).to.have.been.called;
      });

      it('converts the reply data to a string if the request data is a string', async function() {
        this.sinon.useFakeTimers();
        this.sinon.stub(usbDev.protocol, 'replyData').returns(Buffer.from('reply data'));
        const req = dev.sendRequest(REQUEST_1, 'request data');
        await this.checkTimeout();
        const rep = await req;
        expect(rep.data).to.be.string;
        expect(rep.data).to.equal('reply data');
      });

      it('fails if the device is closed or being closed', async () => {
        const close = dev.close();
        const req1 = dev.sendRequest(REQUEST_1);
        await expect(req1).to.be.rejectedWith(error.StateError);
        await close;
        const req2 = dev.sendRequest(REQUEST_2);
        await expect(req2).to.be.rejectedWith(error.StateError);
      });

      it('fails if the request type is not within the range of valid values', async () => {
        const req1 = dev.sendRequest(-1);
        await expect(req1).to.be.rejectedWith(error.DeviceError);
        const req2 = dev.sendRequest(65536);
        await expect(req2).to.be.rejectedWith(error.DeviceError);
      });

      it('fails if the request data is too large', async () => {
        const req = dev.sendRequest(REQUEST_1, Buffer.alloc(65536));
        await expect(req).to.be.rejectedWith(error.DeviceError);
      });
    });
  });
});
