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

	// TODO (mirande): it doesn't look like we can programmatically access
	// devices yet :( - track these issues:
	// https://github.com/puppeteer/puppeteer/issues/8813
	// https://github.com/microsoft/playwright/issues/16626
	describe('Listing Devices [@device]', () => {
		let devices, device, deviceId;
		const selectors = {
			ok: '#test-device-ok',
			error: '#test-device-error',
			selectDevice: '#btn-selectdevice',
			reset: '#btn-reset'
		};

		before(async () => {
			devices = await pusb.getDevices();

			if (!devices.length){
				throw new Error('Unable to find devices - please connect your device via USB');
			}

			device = devices[0];
			await device.open();
			deviceId = device.id;
			await device.close();
			await page.evaluate((id) => window.__PRTCL_DEVICE_ID__ = id, deviceId);
		});

		afterEach(async () => {
			await page.click(selectors.reset);
		});

		it('Authorizes and opens device', async () => {
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
			args: [`--window-size=${width},${height}`],
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

