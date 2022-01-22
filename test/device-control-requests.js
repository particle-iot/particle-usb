/**
 * We deliberately don't use fakeUSB in these tests because it mocks out src/device.js
 * which is the object under test in this file. Instead, we take a different mocking
 * strategy that also mocks out USB hardware, but doesn't mock src/device.js.
 */
const { sinon, expect } = require('./support');
const { UsbDevice } = require('../src/usb-device-node');
const { PLATFORMS } = require('../src/platforms');
const { Device } = require('../src/device');
const DeviceOSProtobuf = require('@particle/device-os-protobuf');
const { Result } = require('../src/result');
const { RequestError } = require('../src/error');

describe('Control Requests', () => {
	const exampleSerialNumber = 'P046AF1450000FC';
	let usbDevice, p2Platform, device;
	beforeEach(async () => {
		usbDevice = new UsbDevice({});
		p2Platform = PLATFORMS.find(element => element.name === 'p2');
		device = new Device(usbDevice, p2Platform);
	});
	afterEach(() => {
		sinon.restore();
	});

	it('provides getSerialNumber()', async () => {
		sinon.stub(device, 'sendProtobufRequest').resolves({ serial: exampleSerialNumber });
		const result = await device.getSerialNumber();
		expect(device.sendProtobufRequest).to.have.property('callCount', 1);
		expect(result).to.eql(exampleSerialNumber);
	});

	it('provides enterListeningMode()', async () => {
		sinon.stub(device, 'sendProtobufRequest');
		device.sendProtobufRequest.onCall(0).resolves({});
		device.sendProtobufRequest.onCall(1).resolves({ mode: 1 });
		const result = await device.enterListeningMode();
		expect(result).to.eql(undefined);
		expect(device.sendProtobufRequest.callCount).to.greaterThanOrEqual(2);
	});

	it('implements enterListeningMode() in a way that will catch errors if the device does not support this request type', async () => {
		sinon.stub(device, 'sendProtobufRequest');
		device.sendProtobufRequest.onCall(0).resolves({});
		device.sendProtobufRequest.onCall(1).throws(new RequestError());
		const result = await device.enterListeningMode();
		expect(result).to.eql(undefined);
		expect(device.sendProtobufRequest.callCount).to.greaterThanOrEqual(2);
	});

	it('provides sendProtobufRequest() (this is the low-level API that all higher level APIs use)', async () => {
		const encodedGetSerialNumberReply = DeviceOSProtobuf.encode('GetSerialNumberReply', { serial: exampleSerialNumber });
		sinon.stub(device, 'sendControlRequest').resolves({ result: Result.OK, data: encodedGetSerialNumberReply });
		const replyObject = await device.sendProtobufRequest('GetSerialNumberRequest');
		expect(replyObject).to.be.an('object');
		expect(replyObject.serial).to.eql(exampleSerialNumber);
	});

	it('implements sendProtobufRequest() in a way that throws RequestError when control request is not OK', async () => {
		sinon.stub(device, 'sendControlRequest').resolves({ result: Result.ERROR });
		let error;
		try {
			await device.sendProtobufRequest('GetSerialNumberRequest');
		} catch (e) {
			error = e;
		}
		expect(error).to.be.an.instanceOf(RequestError);
	});

	it('implements sendProtobufRequest() in a way that creates a valid decoded protobuf message even if sendControlRequest does not return valid .data field', async () => {
		sinon.stub(device, 'sendControlRequest').resolves({ result: Result.OK /* no data field */ });
		const replyObject = await device.sendProtobufRequest('GetSerialNumberRequest');
		expect(replyObject).to.be.an('object');
		expect(replyObject.serial).to.be.a('string');
		expect(replyObject.serial).to.eql('');
	});
});
