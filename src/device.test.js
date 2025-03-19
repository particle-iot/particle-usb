/**
 * We deliberately don't use fakeUSB in these tests because it mocks out src/device.js
 * which is the object under test in this file. Instead, we take a different mocking
 * strategy that also mocks out USB hardware, but doesn't mock src/device.js.
 */
const { sinon, expect } = require('../test/support');
const { UsbDevice } = require('./usb-device-node');
const { PLATFORMS } = require('./platforms');
const { Device } = require('./device');
const { platformForUsbIds } = require('./device-base');
const DeviceOSProtobuf = require('@particle/device-os-protobuf');
const { Result } = require('./result');
const { RequestError, StateError } = require('./error');

describe('Device', () => {
	const exampleSerialNumber = 'P046AF1450000FC';
	let usbDevice, p2Platform, device;
	beforeEach(async () => {
		usbDevice = new UsbDevice({});
		p2Platform = platformForUsbIds(0x2b04, 0xc020); // P2
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

	it('provides getDeviceId()', async () => {
		const exampleDeviceId = '0123456789abcdef';
		sinon.stub(device, 'sendProtobufRequest').resolves({ id: exampleDeviceId });
		const result = await device.getDeviceId();
		expect(device.sendProtobufRequest).to.have.property('callCount', 1);
		expect(result).to.eql(exampleDeviceId);
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
				{ type:1,index:1,version:2,validity: 0 },
				{ type:1,index:2,version:3,validity: 0 },
			], index: 0, type:1, version:2001, size:52568, validity: 0 },
			{ dependencies:[], type:1, index:1, version:2, size:3996, validity: 0 },
			{ dependencies:[], type:1, index:2, version:3, size:19592, validity: 0 },
			{ dependencies:
				[{ type:1, version:2001, index: 2 }],
					type:2, index:1, version:5003, size:971242, validity: 0
			},
			{ dependencies:[],type:4, index:0, version:6, size:28668, validity: 0 },
			{ dependencies:[],type:5, index:0, version:6, size:28668, validity: 0 },
			{ dependencies:[],type:6, index:0, version:6, size:28668, validity: 1 },
			{ dependencies:[{ type:2, index:1, version:5003 }],type:3, index:1, version:6, size:28668, validity: 0 },
		];
		const expectedModuleInfo = [
			{ type: 'BOOTLOADER', index: 0, version: 2001, size: 52568, validity: 0, validityErrors: [], dependencies: [{ type: 'BOOTLOADER', index: 1, version: 2 }, { type: 'BOOTLOADER', index: 2, version: 3 }] },
			{ type: 'BOOTLOADER', index: 1, version: 2, size: 3996, validity: 0, validityErrors: [], dependencies: [] },
			{ type: 'BOOTLOADER', index: 2, version: 3, size: 19592, validity: 0, validityErrors: [], dependencies: [] },
			{ type: 'SYSTEM_PART', index: 1, version: 5003, size: 971242, validity: 0, validityErrors: [], dependencies: [{ type: 'BOOTLOADER', version: 2001, index: 2 }] },
			{ type: 'MONO_FIRMWARE', index: 0, version: 6, size: 28668, validity: 0, validityErrors: [], dependencies: [] },
			{ type: 'NCP_FIRMWARE', index: 0, version: 6, size: 28668, validity: 0, validityErrors: [], dependencies: [] },
			{ type: 'RADIO_STACK', index: 0, version: 6, size: 28668, validity: 1, validityErrors: ['INTEGRITY_CHECK_FAILED'], dependencies: [] },
			{ type: 'USER_PART', index: 1, version: 6, size: 28668, validity: 0, validityErrors: [], dependencies: [{ type: 'SYSTEM_PART', index: 1, version: 5003 }] },
		];

		sinon.stub(device, 'sendProtobufRequest').resolves({ modulesDeprecated: moduleInfo });
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
		sinon.stub(device, 'isInDfuMode').value(true);
		await expect(device.getFirmwareModuleInfo()).to.be.eventually.rejectedWith(StateError, 'Cannot get information when the device is in DFU mode');
	});

	it('implements getFirmwareModuleInfo() and returns modules for devices >= 5.6.0', async() => {
		const modulesInfo = [ // arbitrary values
			{
				'dependencies': [{ 'type': 2, 'index': 2, 'version': 7 }],
				'assetDependencies': [],
				'type': 2,
				'version': 2300,
				'maxSize': 65536,
				'checkedFlags': 30,
				'passedFlags': 30,
				'index': undefined,
				'hash': Buffer.from([113, 79, 81, 180]),
				'size': 53420
			},
			{
				'dependencies': [{ 'type': 2, 'version': 2300 }],
				'assetDependencies': [],
				'type': 4,
				'index': 1,
				'version': 5501,
				'maxSize': 1572864,
				'checkedFlags': 30,
				'passedFlags': 30,
				'hash': Buffer.from([223, 27, 59, 243]),
				'size': 1037320
			},
			{
				'dependencies': [
					{
						'type': 4,
						'index': 1,
						'version': 5501
					}
				],
				'assetDependencies': [],
				'type': 5,
				'index': 1,
				'version': 6,
				'maxSize': 1572864,
				'checkedFlags': 30,
				'passedFlags': 28,
				'hash': Buffer.from([170, 88, 124, 97]),
				'size': 12288
			}
		];
		const expectedModules = [
			{
				'type': 'BOOTLOADER',
				'store': 'UNKNOWN',
				'version': 2300,
				'index': undefined,
				'size': 53420,
				'maxSize': 65536,
				'failedFlags': 0,
				'validityErrors': [],
				'hash': '714f51b4',
				'dependencies': [{ 'index': 2, 'version': 7, 'type': 'BOOTLOADER' }],
				'assetDependencies': []
			},
			{
				'type': 'SYSTEM_PART',
				'store': 'UNKNOWN',
				'index': 1,
				'version': 5501,
				'size': 1037320,
				'maxSize': 1572864,
				'failedFlags': 0,
				'validityErrors': [],
				'hash': 'df1b3bf3',
				'dependencies': [{ 'version': 2300, 'type': 'BOOTLOADER', 'index': undefined }],
				'assetDependencies': []
			},
			{
				'type': 'USER_PART',
				'store': 'UNKNOWN',
				'index': 1,
				'version': 6,
				'size': 12288,
				'maxSize': 1572864,
				'failedFlags': 2,
				'validityErrors': ['INTEGRITY_CHECK_FAILED'],
				'hash': 'aa587c61',
				'dependencies': [{ 'index': 1, 'version': 5501, 'type': 'SYSTEM_PART' }],
				'assetDependencies': []
			}
		];
		sinon.stub(device, 'sendProtobufRequest').resolves({ modules: modulesInfo });

		const result = await device.getFirmwareModuleInfo();

		expect(device.sendProtobufRequest).to.have.property('callCount', 1);
		expect(result).to.eql(expectedModules);
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

	describe('Device', () => {
		let device;

		beforeEach(() => {
			const platform = platformForUsbIds(0x2b04, 0xc020); // P2
			device = new Device(null /* dev */, platform);
		});

		describe('sendProtobufRequest', () => {
			it('sends a protobuf encoded request and decodes the response', async () => {
				const protobufMessageName = 'SomeProtobufMessage';
				const protobufMessageData = { foo: 'bar' };
				const encodedProtobufBuffer = Buffer.from('encodedProtobufBuffer');
				const responseMessage = { baz: 'qux' };

				// Stub the necessary methods
				sinon.stub(DeviceOSProtobuf, 'getDefinition').returns({ id: 123, replyMessage: 'SomeReplyMessage' });
				sinon.stub(DeviceOSProtobuf, 'encode').returns(encodedProtobufBuffer);
				sinon.stub(device, 'sendControlRequest').resolves({ result: Result.OK, data: Buffer.from('responseData') });
				sinon.stub(DeviceOSProtobuf, 'decode').returns(responseMessage);

				const result = await device.sendProtobufRequest(protobufMessageName, protobufMessageData);

				expect(DeviceOSProtobuf.getDefinition).to.have.been.calledOnceWith(protobufMessageName);
				expect(DeviceOSProtobuf.encode).to.have.been.calledOnceWith(protobufMessageName, protobufMessageData);
				expect(device.sendControlRequest).to.have.been.calledOnceWith(123, encodedProtobufBuffer, undefined);
				expect(DeviceOSProtobuf.decode).to.have.been.calledOnceWith('SomeReplyMessage', Buffer.from('responseData'));
				expect(result).to.eql(responseMessage);
			});
		});

		describe('sendRequest', () => {
			it('sends a request and decodes the response', async () => {
				const request = { id: 123, request: { create: sinon.stub(), encode: sinon.stub().returns({ finish: sinon.stub().returns('encodedRequestBuffer') }) }, reply: { create: sinon.stub(), decode: sinon.stub() } };
				const message = { foo: 'bar' };
				const response = { baz: 'qux' };

				// Stub the necessary methods
				sinon.stub(device, 'sendControlRequest').resolves({ result: Result.OK, data: Buffer.from('responseData') });
				request.request.create.returns(message);
				request.reply.decode.returns(response);

				const result = await device.sendRequest(request, message);

				expect(device.sendControlRequest).to.have.been.calledOnceWith(123, 'encodedRequestBuffer', undefined);
				expect(request.request.create).to.have.been.calledOnceWith(message);
				expect(request.request.encode).to.have.been.calledOnceWith(message);
				expect(request.request.encode().finish).to.have.been.calledOnce;
				expect(request.reply.decode).to.have.been.calledOnceWith(Buffer.from('responseData'));
				expect(result).to.eql(response);
			});
		});
	});
});
