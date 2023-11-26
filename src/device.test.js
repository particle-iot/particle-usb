/**
 * We deliberately don't use fakeUSB in these tests because it mocks out src/device.js
 * which is the object under test in this file. Instead, we take a different mocking
 * strategy that also mocks out USB hardware, but doesn't mock src/device.js.
 */
const { sinon, expect } = require('../test/support');
const { UsbDevice } = require('./usb-device-node');
const { PLATFORMS } = require('./platforms');
const { Device } = require('./device');
const DeviceOSProtobuf = require('@particle/device-os-protobuf');
const { Result } = require('./result');
const { RequestError, StateError } = require('./error');

describe('Device', () => {
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

	it('implements getFirmwareModuleInfo() returning all kind of module types and dependencies', async () => {
		const moduleInfo = [
			{ dependencies:[
				{ type:1,index:1,version:2 },
				{ type:1,index:2,version:3 },
			], index: 0, type:1, version:2001, size:52568 },
			{ dependencies:[], type:1, index:1, version:2, size:3996 },
			{ dependencies:[], type:1, index:2, version:3, size:19592 },
			{ dependencies:[{ type:1, version:2001, index: 2 }], type:2, index:1, version:5003, size:971242 },
			{ dependencies:[],type:4, index:0, version:6, size:28668 },
			{ dependencies:[],type:5, index:0, version:6, size:28668 },
			{ dependencies:[],type:6, index:0, version:6, size:28668 },
			{ dependencies:[{ type:2, index:1, version:5003 }],type:3, index:1, version:6, size:28668 },
		];
		const expectedModuleInfo = [
			{ type: 'BOOTLOADER', index: 0, version: 2001, size: 52568, dependencies: [{ type: 'BOOTLOADER', index: 1, version: 2 }, { type: 'BOOTLOADER', index: 2, version: 3 }] },
			{ type: 'BOOTLOADER', index: 1, version: 2, size: 3996, dependencies: [] },
			{ type: 'BOOTLOADER', index: 2, version: 3, size: 19592, dependencies: [] },
			{ type: 'SYSTEM_PART', index: 1, version: 5003, size: 971242, dependencies: [{ type: 'BOOTLOADER', version: 2001, index: 2 }] },
			{ type: 'MONO_FIRMWARE', index: 0, version: 6, size: 28668, dependencies: [] },
			{ type: 'NCP_FIRMWARE', index: 0, version: 6, size: 28668, dependencies: [] },
			{ type: 'RADIO_STACK', index: 0, version: 6, size: 28668, dependencies: [] },
			{ type: 'USER_PART', index: 1, version: 6, size: 28668, dependencies: [{ type: 'SYSTEM_PART', index: 1, version: 5003 }] },
		];

		sinon.stub(device, 'sendProtobufRequest').resolves({ modulesDeprecated: moduleInfo });
		sinon.stub(device, 'isInDfuMode').value(false);
		const result = await device.getFirmwareModuleInfo();
		expect(device.sendProtobufRequest).to.have.property('callCount', 1);
		expect(result).to.eql(expectedModuleInfo);
	});

	it('implements getFirmwareModuleInfo() and throws an error when the device is in dfu', async () => {
		const moduleInfo = [
			{ dependencies:[{ type:1,index:2,version:3 }], type:1, version:2001, size:52568 },
			{ dependencies:[], type:1, index:1, version:2, size:3996 },
			{ dependencies:[], type:1, index:2, version:3, size:19592 },
			{ dependencies:[{ type:1, version:2001 }], type:2, index:1, version:5003, size:971242 },
			{ dependencies:[{ type:2, index:1, version:5003 }],type:3, index:1, version:6, size:28668 }
		];

		sinon.stub(device, 'sendProtobufRequest').resolves({ modulesDeprecated: moduleInfo });
		await expect(device.getFirmwareModuleInfo()).to.be.eventually.rejectedWith(StateError, 'Cannot get information when the device is in DFU mode');
	});

	it('implements getAssetInfo()', async () => {
		const expectedAssetInfo =
		{
			'available': [
				{
					name: 'foo.txt',
					hash: '0x1234',
					size: 64,
					storageSize: 64
				},
				{
					name: 'bar.txt',
					hash: '0x5678',
					size: 64,
					storageSize: 64
				}
			],
			'required': [
				{
					name: 'foo.txt',
					hash: '0x1234'
				},
				{
					name: 'bar.txt',
					hash: '0x5678'
				}
			]
		};
		sinon.stub(device, 'sendProtobufRequest').resolves(expectedAssetInfo);
		sinon.stub(device, 'isInDfuMode').value(false);

		const result = await device.getAssetInfo();

		expect(device.sendProtobufRequest).to.have.property('callCount', 1);
		expect(result).to.eql(expectedAssetInfo);
	});

	it('implements getAssetInfo() and returns error if device is in dfu mode', async () => {
		const expectedAssetInfo =
		{
			'available': [
				{
					name: 'foo.txt',
					hash: '0x1234',
					size: 64,
					storageSize: 64
				},
				{
					name: 'bar.txt',
					hash: '0x5678',
					size: 64,
					storageSize: 64
				}
			],
			'required': [
				{
					name: 'foo.txt',
					hash: '0x1234'
				},
				{
					name: 'bar.txt',
					hash: '0x5678'
				}
			]
		};
		sinon.stub(device, 'sendProtobufRequest').resolves(expectedAssetInfo);
		sinon.stub(device, 'isInDfuMode').value(true);

		await expect(device.getAssetInfo()).to.be.eventually.rejectedWith(StateError, 'Cannot get information when the device is in DFU mode');		
	});
});
