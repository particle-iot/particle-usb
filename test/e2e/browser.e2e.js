/* global ParticleUsb */

const path = require('path');
const http = require('http');
const { URL } = require('url');
const fs = require('fs-extra');
const puppeteer = require('puppeteer');
const { expect } = require('../support');
const { ROOT_DIR, PROJ_WEB_DIR } = require('./lib/constants');
const pusb = require('../../');


describe('Browser Usage', () => {
	const BROWSER_DEBUG = false; // set this to `true` to debug browser-side automation
	const siteURL = new URL('http://localhost:4433');
	let assets, server, browser, page;
	const selectors = {
		ok: '#test-device-ok',
		error: '#test-device-error',
		selectDevice: '#btn-selectdevice',
		reset: '#btn-reset'
	};

	before(async () => {
		assets = await loadWebPageAssets(ROOT_DIR, PROJ_WEB_DIR);
		server = await createServer(assets);
		server.listen(siteURL.port);
		({ browser, page } = await launchBrowser(siteURL.href));
	});

	after(async () => {
		if (browser){
			await browser.close();
		}

		if (server){
			server.close();
		}
	});

	describe('Bundling & Loading', () => {
		it('Loads without error', async () => {
			const hasParticleUSB = await page.evaluate(() => {
				if (!window.ParticleUsb){
					return false;
				}
				return typeof window.ParticleUsb.getDevices === 'function';
			});

			expect(hasParticleUSB).to.equal(true);
		});
	});

	describe('Listing Devices [@device]', () => {
		before(async () => {
			await setupDevices(page);
		});

		afterEach(async () => {
			await page.click(selectors.reset);
		});

		// TODO (mirande): we can't programmatically access devices yet :(
		// track these issues:
		// https://bugs.chromium.org/p/chromium/issues/detail?id=831982
		// https://github.com/puppeteer/puppeteer/issues/8813
		it.skip('Authorizes and opens device', async () => {
			await page.click(selectors.selectDevice);
			await page.keyboard.press('Tab');
			await page.keyboard.press('Tab');
			await page.keyboard.press('Tab');
			await page.keyboard.press('ArrowDown');
			await page.keyboard.press('Enter');
			await page.waitForSelector(selectors.ok, { timeout: 2 * 1000 });
		});

		it('Throws when device connect prompt is cancelled', async () => {
			await page.click(selectors.selectDevice);
			await page.keyboard.press('Escape');
			await page.waitForSelector(selectors.error, { timeout: 2 * 1000 });
		});
	});

	// TODO (mirande): blocked on missing browser support - see above
	// these can be run by:
	// 1. set `BROWSER_DEBUG` to `true` above
	// 2. replace the `describe.skip` call below w/ `describe.only`
	// 3. run `npm run test:e2e`
	// 4. when prompted to approve a device in the browser that launches,
	//    select your device and click "connect"
	describe.skip('Changing Device Modes [@device]', () => {
		let deviceId;

		before(async () => {
			({ deviceId } = await setupDevices(page));
		});

		afterEach(async () => {
			await page.click(selectors.reset);
			await page.evaluate(async (id) => {
				const webDevice = await ParticleUsb.openDeviceById(id);
				await webDevice.reset();
				await webDevice.close();
			}, deviceId);
		});

		it('Enters listening mode', async () => {
			const mode = await page.evaluate(async () => {
				const webDevices = await ParticleUsb.getDevices();
				const webDevice = webDevices[0];
				await webDevice.open();
				await webDevice.enterListeningMode();
				return await webDevice.getDeviceMode();
			});

			expect(mode).to.equal('LISTENING');
		});

		it('Enters listening mode using a native webusb device reference', async () => {
			const mode = await page.evaluate(async () => {
				const filters = [
					{ vendorId: 0x2b04 }
				];

				const nativeUsbDevice = await navigator.usb.requestDevice({
					filters
				});

				const webDevice = await ParticleUsb.openNativeUsbDevice(nativeUsbDevice);

				await webDevice.enterListeningMode();
				return await webDevice.getDeviceMode();
			});

			expect(mode).to.equal('LISTENING');
		});
	});

	async function setupDevices(page){
		const devices = await pusb.getDevices();
		const device = devices[0];
		await device.open();
		const deviceId = device.id;
		await device.close();
		await page.evaluate((id) => window.__PRTCL_DEVICE_ID__ = id, deviceId);
		return { deviceId, device, devices };
	}

	function createServer(assets){
		return http.createServer((req, res) => {
			let requestedAsset;

			for (const key in assets){
				const asset = assets[key];

				if (asset.url === req.url){
					requestedAsset = asset;
					break;
				}
			}

			if (requestedAsset){
				res.writeHead(200, { 'Content-Type': requestedAsset.type });
				res.end(requestedAsset.data);
			} else {
				console.log(`:::: Unable to serve: ${req.url} - file not found`);
				res.writeHead(404, { 'Content-Type': 'text/html' });
				res.end('404: File not found');
			}
		});
	}

	async function launchBrowser(url){
		const options = getBrowserOptions();
		const browser = await puppeteer.launch(options);
		const page = await browser.newPage();

		page.on('console', msg => {
			console.log(':::: BROWSER LOG:', msg.text());
		});

		await Promise.all([
			page.waitForNavigation({ waitUntil: 'load' }),
			page.goto(url)
		]);

		return { browser, page };
	}

	function getBrowserOptions(){
		const height = 768;
		const width = 1024;
		const options = {
			args: [`--window-size=${width},${height}`, '--no-sandbox'],
			defaultViewport: { width, height }
		};

		if (BROWSER_DEBUG){
			options.headless = false;
			options.slowMo = 500;
		}

		return options;
	}

	async function loadWebPageAssets(rootPath, projPath){
		const assets = {
			index: {
				path: path.join(projPath, 'index.html'),
				type: 'text/html',
				url: '/',
				data: null
			},
			favicon: {
				path: path.join(projPath, 'favicon.ico'),
				type: 'image/x-icon',
				url: '/favicon.ico',
				data: null
			},
			js: {
				path: path.join(rootPath, 'dist', 'particle-usb.bundle.js'),
				type: 'text/javascript',
				url: '/particle-usb.js',
				data: null
			}
		};

		for (const key in assets){
			const asset = assets[key];
			asset.data = await fs.readFile(asset.path);
		}

		return assets;
	}
});

