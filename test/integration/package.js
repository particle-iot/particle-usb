const os = require('os');
const path = require('path');
const fs = require('fs-extra');
const execa = require('execa');
const { expect } = require('../support');
const { version, peerDependencies } = require('../../package.json');


const TMP_DIR_PREFIX = 'particle-usb-';
const ROOT_DIR = path.join(__dirname, '..', '..');
const NPM_PACKAGE_PATH = path.join(ROOT_DIR, `${TMP_DIR_PREFIX}${version}.tgz`);

describe('package artifacts', function desc(){
	this.timeout(60000);

	let tempDir;
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

	before(async () => {
		tempDir = await createTempDirectory();
		await createFakeNodeProject(tempDir);
		await execa('npm', ['pack'], { cwd: ROOT_DIR });
		await installPackageDependencies(tempDir, peerDependencies);
	});

	after(async () => {
		await fs.remove(NPM_PACKAGE_PATH);
	});

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

	it('works when published to npm', async () => {
		const usb = require(tempDir);
		expect(usb).to.have.property('getDevices').that.is.a('function');
	});

	async function createTempDirectory(){
		try {
			const prefix = path.join(os.tmpdir(), TMP_DIR_PREFIX);
			return await fs.mkdtemp(prefix);
		} catch (err) {
			throw new Error(`Failed to create temporary working directory: ${err}`);
		}
	}

	async function createFakeNodeProject(dir){
		const sourcePath = path.join(dir, 'src', 'index.js');
		const source = 'const usb = require("particle-usb");module.exports = usb';
		const pkgJSONPath = path.join(dir, 'package.json');
		const pkgJSON = {
			name: 'particle-usb-user-pkg',
			version: '1.0.0',
			main: 'src/index.js'
		};

		await fs.writeJson(pkgJSONPath, pkgJSON);
		await fs.outputFile(sourcePath, source);
	}

	async function installPackageDependencies(cwd, deps){
		const options = { cwd };

		for (const dep in deps){
			const pkg = `${dep}@${deps[dep]}`;
			await execa('npm', ['install', pkg], options);
		}

		await execa('npm', ['install', NPM_PACKAGE_PATH], { cwd });
	}
});

