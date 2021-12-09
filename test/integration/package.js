const path = require('path');
const fs = require('fs-extra');
const { expect } = require('../support');


describe('package artifacts', () => {
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

		it(`includes node-usb binary for: '${platform}' [spec: ${index}]`, async () => {
			for (const file of files){
				const filename = path.join(pathToBinaries, platform, file);
				const exists = await fs.pathExists(filename);

				expect(exists).to.equal(true, `Not found: ${filename}`);
			}
		});
	});
});

