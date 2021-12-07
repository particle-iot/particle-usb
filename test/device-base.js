const { fakeUsb, sinon, expect, assert, nextTick } = require('./support');
const proxyquire = require('proxyquire');

const { getDevices, openDeviceById, PollingPolicy } = proxyquire('../src/device-base', {
	'./usb-device-node': fakeUsb
});
const usbImpl = require('../src/usb-device-node');
const proto = require('../src/usb-protocol');
const error = require('../src/error');

// Application-specific request types
const REQUEST_1 = 1;
const REQUEST_2 = 2;

describe('device-base', () => {
	beforeEach(function setup() {
		this.tick = async t => {
			// Wait for the next event loop iteration to ensure that all promise callbacks get invoked:
			// https://github.com/sinonjs/sinon/issues/738
			await nextTick();
			sinon.clock.tick(t);
		};
		// Number of CHECK requests sent to a USB device during the test
		this.checkCount = 0;
		// Current polling policy
		this.pollingPolicy = PollingPolicy.DEFAULT;
		// Fires the CHECK request timer depending on current polling policy
		this.checkTimeout = async () => {
			await this.tick(this.pollingPolicy(this.checkCount++));
		};
	});

	afterEach(() => {
		// "Detach" all USB devices
		fakeUsb.clearDevices();
		sinon.restore();
	});

	describe('getDevices()', () => {
		it('enumerates only Particle USB devices', async () => {
			// Register a bunch of Particle and non-Particle devices
			const usbDevs = [];
			fakeUsb.addDevice({ vendorId: 0xaaaa, productId: 0xaaaa });
			usbDevs.push(fakeUsb.addPhoton());
			fakeUsb.addDevice({ vendorId: 0xbbbb, productId: 0xbbbb });
			usbDevs.push(fakeUsb.addP1());
			usbDevs.push(fakeUsb.addElectron());
			fakeUsb.addDevice({ vendorId: 0xcccc, productId: 0xcccc });
			usbDevs.push(fakeUsb.addXenon());
			usbDevs.push(fakeUsb.addArgon());
			usbDevs.push(fakeUsb.addBoron());
			fakeUsb.addDevice({ vendorId: 0xdddd, productId: 0xdddd });
			usbDevs.push(fakeUsb.addXenonSom());
			fakeUsb.addDevice({ vendorId: 0xeeee, productId: 0xeeee });
			usbDevs.push(fakeUsb.addArgonSom());
			usbDevs.push(fakeUsb.addBoronSom());
			usbDevs.push(fakeUsb.addB5Som());
			usbDevs.push(fakeUsb.addAssetTracker());
			// Enumerate detected devices
			const devs = await getDevices();
			expect(devs.map(dev => dev.usbDevice)).to.have.all.members(usbDevs);
			expect(devs.map(dev => dev.vendorId)).to.have.all.members(usbDevs.map(dev => dev.vendorId));
			expect(devs.map(dev => dev.productId)).to.have.all.members(usbDevs.map(dev => dev.productId));
			expect(devs.map(dev => dev.type)).to.have.all.members(usbDevs.map(dev => dev.options.type));
			expect(devs.map(dev => dev.platformId)).to.have.all.members(usbDevs.map(dev => dev.options.platformId));
		});

		it('includes devices in the DFU mode by default', async () => {
			const usbDevs = [
				fakeUsb.addPhoton({ dfu: true }),
				fakeUsb.addP1({ dfu: true }),
				fakeUsb.addElectron({ dfu: true }),
				fakeUsb.addArgon({ dfu: true }),
				fakeUsb.addBoron({ dfu: true }),
				fakeUsb.addXenon({ dfu: true }),
				fakeUsb.addArgonSom({ dfu: true }),
				fakeUsb.addBoronSom({ dfu: true }),
				fakeUsb.addXenonSom({ dfu: true }),
				fakeUsb.addB5Som({ dfu: true }),
				fakeUsb.addAssetTracker({ dfu: true })
			];
			const devs = await getDevices();
			expect(devs.map(dev => dev.usbDevice)).to.have.all.members(usbDevs);
			expect(devs.map(dev => dev.vendorId)).to.have.all.members(usbDevs.map(dev => dev.vendorId));
			expect(devs.map(dev => dev.productId)).to.have.all.members(usbDevs.map(dev => dev.productId));
		});

		it('can optionally exclude devices in the DFU mode', async () => {
			const photon1 = fakeUsb.addPhoton({ dfu: true });
			const photon2 = fakeUsb.addPhoton({ dfu: false });
			const allDevices = await getDevices({ includeDfu: true });
			const nonDFUDevices = await getDevices({ includeDfu: false });
			expect(allDevices).to.have.lengthOf(2);
			expect(allDevices[0].usbDevice).to.equal(photon1);
			expect(allDevices[1].usbDevice).to.equal(photon2);
			expect(nonDFUDevices).to.have.lengthOf(1);
			expect(nonDFUDevices[0].usbDevice).to.equal(photon2);
		});

		// eslint-disable-next-line max-statements
		it('can filter detected devices by type', async () => {
			const photon = fakeUsb.addPhoton();
			const p1 = fakeUsb.addP1();
			const electron = fakeUsb.addElectron();
			const xenon = fakeUsb.addXenon();
			const argon = fakeUsb.addArgon();
			const boron = fakeUsb.addBoron();
			const xenonSom = fakeUsb.addXenonSom();
			const argonSom = fakeUsb.addArgonSom();
			const boronSom = fakeUsb.addBoronSom();
			const b5Som = fakeUsb.addB5Som();
			const assetTracker = fakeUsb.addAssetTracker();
			// Photon, P1, Electron
			let devs = await getDevices({ types: ['photon', 'p1', 'electron'] });
			expect(devs).to.have.lengthOf(3);
			devs = devs.map(dev => dev.usbDevice);
			expect(devs).to.have.all.members([photon, p1, electron]);
			// Argon, Boron, Xenon
			devs = await getDevices({ types: ['argon', 'boron', 'xenon'] });
			expect(devs).to.have.lengthOf(3);
			devs = devs.map(dev => dev.usbDevice);
			expect(devs).to.have.all.members([argon, boron, xenon]);
			// Argon-SoM, Boron-SoM, Xenon-SoM
			devs = await getDevices({ types: ['asom', 'bsom', 'b5som', 'xsom'] });
			expect(devs).to.have.lengthOf(4);
			devs = devs.map(dev => dev.usbDevice);
			expect(devs).to.have.all.members([argonSom, boronSom, b5Som, xenonSom]);
			// Asset Tracker
			devs = await getDevices({ types: ['tracker'] });
			expect(devs).to.have.lengthOf(1);
			devs = devs.map(dev => dev.usbDevice);
			expect(devs).to.have.all.members([assetTracker]);
		});

		it('matches device types in a case-insensitive manner', async () => {
			const photon = fakeUsb.addPhoton();
			let devs = await getDevices({ types: ['photon'] });
			expect(devs).to.have.lengthOf(1);
			expect(devs[0].usbDevice).to.equal(photon);
			devs = await getDevices({ types: ['PHOTON'] });
			expect(devs).to.have.lengthOf(1);
			expect(devs[0].usbDevice).to.equal(photon);
			devs = await getDevices({ types: ['PhOtOn'] });
			expect(devs).to.have.lengthOf(1);
			expect(devs[0].usbDevice).to.equal(photon);
		});

		it('ignores invalid device types', async () => {
			const photon = fakeUsb.addPhoton();
			fakeUsb.addBoron();
			let devs = await getDevices({ types: ['photoshka'] });
			expect(devs).to.be.empty;
			devs = await getDevices({ types: ['photon', 'boronchik'] });
			expect(devs).to.have.lengthOf(1);
			expect(devs[0].usbDevice).to.equal(photon);
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

		it('ignores non-Particle devices with a matching serial number', async () => {
			const unknown = fakeUsb.addDevice({
				vendorId: 0xaaaa,
				productId: 0xbbbb,
				serialNumber: '111111111111111111111111'
			});
			const open = sinon.spy(unknown, 'open');
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

		describe('with single device', () => {
			beforeEach(async () => {
				// Add a test USB device to work with
				usbDev = fakeUsb.addPhoton({
					id: '111111111111111111111111',
					firmwareVersion: '1.0.0'
				});
				const devs = await getDevices();
				assert(devs.length !== 0);
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

				it('filters out non-printable ASCII characters from the device ID string', async () => {
					usbDev.options.serialNumber = '222222222222222222222222\x00';
					await dev.open();
					expect(dev.id).to.equal('222222222222222222222222');
				});

				it('converts the device ID string to lower case', async () => {
					usbDev.options.serialNumber = 'AAAAAAAAAAAAAAAAAAAAAAAA';
					await dev.open();
					expect(dev.id).to.equal('aaaaaaaaaaaaaaaaaaaaaaaa');
				});

				it('does not require the USB device to support the firmware version request', async () => {
					usbDev.options.firmwareVersion = null;
					await dev.open();
					expect(dev.firmwareVersion).to.be.null;
				});

				it('resets all pending requests after opening the USB device', async () => {
					const resetAllRequests = sinon.spy(usbDev.protocol, 'resetAllRequests');
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
					const req1 = dev.sendControlRequest(REQUEST_1);
					const req2 = dev.sendControlRequest(REQUEST_2);
					const close = dev.close({ processPendingRequests: false });
					await expect(req1).to.be.rejectedWith(error.StateError);
					await expect(req2).to.be.rejectedWith(error.StateError);
					await close;
				});

				it('cancels pending requests when the timeout is reached', async function test() {
					sinon.useFakeTimers();
					sinon.stub(usbDev.protocol, 'checkRequest').returns(proto.Status.PENDING);
					await dev.open();
					const req1 = dev.sendControlRequest(REQUEST_1);
					const req2 = dev.sendControlRequest(REQUEST_2);
					const close = dev.close({ timeout: 1000 });
					await this.tick(1000);
					await close;
					await expect(req1).to.be.rejectedWith(error.StateError);
					await expect(req2).to.be.rejectedWith(error.StateError);
				});

				it('resets active requests when the timeout is reached', async function test() {
					sinon.useFakeTimers();
					sinon.stub(usbDev.protocol, 'checkRequest').returns(proto.Status.PENDING);
					const resetAllRequests = sinon.spy(usbDev.protocol, 'resetAllRequests');
					await dev.open();
					expect(resetAllRequests).to.have.been.calledOnce;
					const req = dev.sendControlRequest(REQUEST_1);
					const close = dev.close({ timeout: 1000 });
					await this.tick(1000);
					await close;
					await expect(req).to.be.rejectedWith(error.StateError);
					expect(resetAllRequests).to.have.been.calledTwice;
				});
			});

			describe('sendControlRequest()', () => {
				beforeEach(async () => {
					await dev.open();
				});

				it('can send a request without payload data', async function test() {
					sinon.useFakeTimers();
					const initRequest = sinon.spy(usbDev.protocol, 'initRequest');
					const sendRequest = sinon.spy(usbDev.protocol, 'sendRequest');
					const req = dev.sendControlRequest(REQUEST_1);
					await this.checkTimeout();
					await req;
					expect(initRequest).to.have.been.calledWith(sinon.match({
						type: REQUEST_1,
						size: 0
					}));
					expect(sendRequest).to.have.not.been.called;
				});

				it('can send a request with payload data', async function test() {
					sinon.useFakeTimers();
					const initRequest = sinon.spy(usbDev.protocol, 'initRequest');
					const sendRequest = sinon.spy(usbDev.protocol, 'sendRequest');
					const reqData = Buffer.from('request data');
					const reqId = usbDev.protocol.nextRequestId;
					const req = dev.sendControlRequest(REQUEST_1, reqData);
					await this.checkTimeout();
					await req;
					expect(initRequest).to.have.been.calledWith(sinon.match({
						type: REQUEST_1,
						size: reqData.length
					}));
					expect(sendRequest).to.have.been.calledWith(sinon.match({
						id: reqId,
						data: reqData
					}));
				});

				it('can send request data in multiple chunks', async function test() {
					sinon.useFakeTimers();
					const initRequest = sinon.spy(usbDev.protocol, 'initRequest');
					const sendRequest = sinon.spy(usbDev.protocol, 'sendRequest');
					const chunk1 = Buffer.from('A'.repeat(usbImpl.MAX_CONTROL_TRANSFER_DATA_SIZE));
					const chunk2 = Buffer.from('B'.repeat(usbImpl.MAX_CONTROL_TRANSFER_DATA_SIZE - 1));
					const reqId = usbDev.protocol.nextRequestId;
					const req = dev.sendControlRequest(REQUEST_1, Buffer.concat([chunk1, chunk2]));
					await this.checkTimeout();
					await req;
					expect(initRequest).to.have.been.calledWith(sinon.match({
						type: REQUEST_1,
						size: chunk1.length + chunk2.length
					}));
					expect(sendRequest).to.have.been.calledTwice;
					expect(sendRequest.firstCall.args).to.deep.equal([{
						id: reqId,
						data: chunk1
					}]);
					expect(sendRequest.secondCall.args).to.deep.equal([{
						id: reqId,
						data: chunk2
					}]);
				});

				it('can receive a reply without payload data', async function test() {
					sinon.useFakeTimers();
					const recvRequest = sinon.spy(usbDev.protocol, 'recvRequest');
					const req = dev.sendControlRequest(REQUEST_1);
					await this.checkTimeout();
					await req;
					expect(recvRequest).to.have.not.been.called;
				});

				it('can receive a reply with payload data', async function test() {
					sinon.useFakeTimers();
					const repData = Buffer.from('reply data');
					sinon.stub(usbDev.protocol, 'replyData').returns(repData);
					const recvRequest = sinon.spy(usbDev.protocol, 'recvRequest');
					const reqId = usbDev.protocol.nextRequestId;
					const req = dev.sendControlRequest(REQUEST_1);
					await this.checkTimeout();
					await req;
					expect(recvRequest).to.have.been.calledWith({
						id: reqId,
						size: repData.length
					});
				});

				it('can receive reply data in multiple chunks', async function test() {
					sinon.useFakeTimers();
					const chunk1 = Buffer.from('A'.repeat(usbImpl.MAX_CONTROL_TRANSFER_DATA_SIZE));
					const chunk2 = Buffer.from('B'.repeat(usbImpl.MAX_CONTROL_TRANSFER_DATA_SIZE - 1));
					sinon.stub(usbDev.protocol, 'replyData').returns(Buffer.concat([chunk1, chunk2]));
					const recvRequest = sinon.spy(usbDev.protocol, 'recvRequest');
					const reqId = usbDev.protocol.nextRequestId;
					const req = dev.sendControlRequest(REQUEST_1);
					await this.checkTimeout();
					await req;
					expect(recvRequest).to.have.been.calledTwice;
					expect(recvRequest.firstCall.args).to.deep.equal([{
						id: reqId,
						size: chunk1.length
					}]);
					expect(recvRequest.secondCall.args).to.deep.equal([{
						id: reqId,
						size: chunk2.length
					}]);
				});

				it('polls the USB device until it allocates a buffer for the request data', async function test() {
					sinon.useFakeTimers();
					sinon.stub(usbDev.protocol, 'initRequest')
						.returns(proto.Status.PENDING);
					const checkBuffer = sinon.stub(usbDev.protocol, 'checkBuffer')
						.onFirstCall().returns(proto.Status.PENDING)
						.onSecondCall().returns(proto.Status.PENDING)
						.returns(proto.Status.OK);
					const req = dev.sendControlRequest(REQUEST_1, Buffer.from('request data'));
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

				it('polls the USB device until it completes processing of a request', async function test() {
					sinon.useFakeTimers();
					const checkRequest = sinon.stub(usbDev.protocol, 'checkRequest')
						.onFirstCall().returns(proto.Status.PENDING)
						.onSecondCall().returns(proto.Status.PENDING)
						.returns(proto.Status.OK);
					const req = dev.sendControlRequest(REQUEST_1);
					await this.checkTimeout();
					expect(checkRequest).to.have.been.calledOnce;
					await this.checkTimeout();
					expect(checkRequest).to.have.been.calledTwice;
					await this.checkTimeout();
					expect(checkRequest).to.have.been.calledThrice;
					await req;
				});

				it('resolves to an object containing the result code', async function test() {
					sinon.useFakeTimers();
					sinon.stub(usbDev.protocol, 'replyResult').returns(1234);
					const req = dev.sendControlRequest(REQUEST_1);
					await this.checkTimeout();
					const rep = await req;
					expect(rep).to.have.property('result');
					expect(rep.result).to.equal(1234);
					expect(rep).not.to.have.property('data');
				});

				it('resolves to an object containing the reply data', async function test() {
					sinon.useFakeTimers();
					sinon.stub(usbDev.protocol, 'replyResult').returns(0);
					sinon.stub(usbDev.protocol, 'replyData').returns(Buffer.from('reply data'));
					const req = dev.sendControlRequest(REQUEST_1);
					await this.checkTimeout();
					const rep = await req;
					expect(rep).to.have.property('result');
					expect(rep.result).to.equal(0);
					expect(rep).to.have.property('data');
					expect(rep.data).to.deep.equal(Buffer.from('reply data'));
				});

				it('sends requests to the USB device concurrently', async function test() {
					sinon.useFakeTimers();
					sinon.stub(usbDev.protocol, 'checkRequest').returns(proto.Status.PENDING);
					const initRequest = sinon.spy(usbDev.protocol, 'initRequest');
					dev.sendControlRequest(REQUEST_1);
					dev.sendControlRequest(REQUEST_2);
					await this.checkTimeout();
					expect(initRequest).to.have.been.calledWith(sinon.match({ type: REQUEST_1 }));
					expect(initRequest).to.have.been.calledWith(sinon.match({ type: REQUEST_2 }));
				});

				it('limits the maximum number of concurrent requests', async function test() {
					// Reopen the device with different settings
					await dev.close();
					await dev.open({ concurrentRequests: 1 });
					sinon.useFakeTimers();
					sinon.stub(usbDev.protocol, 'checkRequest').returns(proto.Status.PENDING);
					const initRequest = sinon.spy(usbDev.protocol, 'initRequest');
					dev.sendControlRequest(REQUEST_1);
					dev.sendControlRequest(REQUEST_2);
					await this.checkTimeout();
					expect(initRequest).to.have.been.calledWith(sinon.match({ type: REQUEST_1 }));
					expect(initRequest).to.not.have.been.calledWith(sinon.match({ type: REQUEST_2 }));
				});

				it('times out after a specified amount of time', async function test() {
					sinon.useFakeTimers();
					const req = dev.sendControlRequest(REQUEST_1, null, { timeout: 1000 });
					await this.tick(1000);
					await expect(req).to.be.rejectedWith(error.TimeoutError);
				});

				it('resets an active request when it times out', async function test() {
					sinon.useFakeTimers();
					sinon.stub(usbDev.protocol, 'checkRequest').returns(proto.Status.PENDING);
					const resetRequest = sinon.spy(usbDev.protocol, 'resetRequest');
					const req = dev.sendControlRequest(REQUEST_1, null, { timeout: 1000 });
					await this.tick(1000);
					await expect(req).to.be.rejectedWith(error.TimeoutError);
					expect(resetRequest).to.have.been.called;
				});

				it('converts the reply data to a string if the request data is a string', async function test() {
					sinon.useFakeTimers();
					sinon.stub(usbDev.protocol, 'replyData').returns(Buffer.from('reply data'));
					const req = dev.sendControlRequest(REQUEST_1, 'request data');
					await this.checkTimeout();
					const rep = await req;
					expect(rep.data).to.be.string;
					expect(rep.data).to.equal('reply data');
				});

				it('fails if the device is closed or being closed', async () => {
					const close = dev.close();
					const req1 = dev.sendControlRequest(REQUEST_1);
					await expect(req1).to.be.rejectedWith(error.StateError);
					await close;
					const req2 = dev.sendControlRequest(REQUEST_2);
					await expect(req2).to.be.rejectedWith(error.StateError);
				});

				it('fails if the request type is not within the range of valid values', async () => {
					const req1 = dev.sendControlRequest(-1);
					await expect(req1).to.be.rejectedWith(RangeError);
					const req2 = dev.sendControlRequest(65536);
					await expect(req2).to.be.rejectedWith(RangeError);
				});

				it('fails if the request data is too large', async () => {
					const req = dev.sendControlRequest(REQUEST_1, Buffer.alloc(65536));
					await expect(req).to.be.rejectedWith(RangeError);
				});
			});
		});

		describe('with multiple devices', () => {
			beforeEach(async () => {
				fakeUsb.addPhoton({ dfu: true });
				fakeUsb.addP1({ dfu: true });
				fakeUsb.addElectron({ dfu: true });
				fakeUsb.addArgon({ dfu: true });
				fakeUsb.addBoron({ dfu: true });
				fakeUsb.addXenon({ dfu: true });
				fakeUsb.addArgonSom({ dfu: true });
				fakeUsb.addBoronSom({ dfu: true });
				fakeUsb.addXenonSom({ dfu: true });
				fakeUsb.addPhoton();
				fakeUsb.addP1();
				fakeUsb.addElectron();
				fakeUsb.addArgon();
				fakeUsb.addBoron();
				fakeUsb.addXenon();
				fakeUsb.addArgonSom();
				fakeUsb.addBoronSom();
				fakeUsb.addXenonSom();
			});

			it('open and close', async () => {
				const devs = await getDevices();
				expect(devs).to.not.be.empty;

				for (const dev of devs) {
					await dev.open();
					expect(dev.isOpen).to.be.true;
				}

				for (const dev of devs) {
					await dev.close();
					expect(dev.isOpen).to.be.false;
				}
			});
		});
	});
});
