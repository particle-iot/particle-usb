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

	it('provides sendProtobufRequest() (this is the low-level API that all higher level APIs use)', async () => {
		const encodedGetSerialNumberReply = DeviceOSProtobuf.encode('GetSerialNumberReply', { serial: exampleSerialNumber });
		sinon.stub(device, 'sendControlRequest').resolves({ result: Result.OK, data: encodedGetSerialNumberReply });
		const replyObject = await device.sendProtobufRequest('GetSerialNumberRequest');
		expect(replyObject).to.be.an('object');
		expect(replyObject.serial).to.eql(exampleSerialNumber);
	});
});
