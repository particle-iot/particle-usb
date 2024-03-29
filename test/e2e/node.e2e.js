const path = require('path');
const fs = require('fs-extra');
const { expect } = require('../support');
const { PROJ_NODE_DIR } = require('./lib/constants');


describe('Node.js Usage', () => {
	describe('Package Artifacts', () => {
		const pathToNodeUSB = path.dirname(require.resolve('usb/package.json'));
		const pathToBinaries = path.join(pathToNodeUSB, 'prebuilds');
		const specs = [
			{
				platform: 'darwin-x64+arm64',
				files: [
					'node.napi.node'
				]
			},
			{
				platform: 'linux-arm',
				files: [
					'node.napi.armv6.node',
					'node.napi.armv7.node'
				]
			},
			{
				platform: 'linux-arm64',
				files: [
					'node.napi.armv8.node'
				]
			},
			{
				platform: 'linux-x64',
				files: [
					'node.napi.glibc.node',
					'node.napi.musl.node'
				]
			},
			{
				platform: 'win32-ia32',
				files: [
					'node.napi.node'
				]
			},
			{
				platform: 'win32-x64',
				files: [
					'node.napi.node'
				]
			}
		];

		specs.forEach((spec, index) => {
			const { platform, files } = spec;

			it(`Includes node-usb binary for: '${platform}' [spec: ${index}]`, async () => {
				for (const file of files){
					const filename = path.join(pathToBinaries, platform, file);
					const exists = await fs.pathExists(filename);

					expect(exists).to.equal(true, `Not found: ${filename}`);
				}
			});
		});
	});

	describe('NPM Package', () => {
		it('Works when published to npm', async () => {
			const usb = require(PROJ_NODE_DIR);
			expect(usb).to.have.property('getDevices').that.is.a('function');
		});
	});

	describe('Basic Device Interactions [@device]', () => {
		let device, devices, deviceId;

		beforeEach(async () => {
			const usb = require(PROJ_NODE_DIR);
			devices = await usb.getDevices();
			device = devices[0];
			await device.open();
			deviceId = device.id;
		});

		afterEach(async () => {
			if (device){
				await device.close();
			}
		});

		it('Gets device cloud connection status', async () => {
			const status = await device.getCloudConnectionStatus();
			expect(status).to.be.oneOf([
				'DISCONNECTING',
				'DISCONNECTED',
				'CONNECTING',
				'CONNECTED'
			]);
		});

		it('Opens device using a native usb device reference', async () => {
			const { openNativeUsbDevice } = require(PROJ_NODE_DIR);
			await device.close();
			const nativeUsbDevice = device._dev._dev;
			device = await openNativeUsbDevice(nativeUsbDevice);
			expect(deviceId).to.equal(device.id);
		});
	});
});

