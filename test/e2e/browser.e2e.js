const path = require('path');
const http = require('http');
const fs = require('fs-extra');
const puppeteer = require('puppeteer');
const { expect } = require('../support');

const repoPath = path.join(__dirname, '..', '..');
const projPath = path.join(__dirname, '__fixtures__', 'web-proj');
const webpageURL = 'http://localhost:4433'; // 'chrome://usb-internals/';
const webpagePort = 4433;


describe('Browser Usage', () => {
	let assets, server, browser, page;

	before(async () => {
		assets = await loadWebPageAssets(repoPath, projPath);
		server = await createServer(assets);
		server.listen(webpagePort);
		({ browser, page } = await launchBrowser(webpageURL));
	});

	after(async () => {
		server && server.close();

		if (browser){
			await browser.close();
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
				res.writeHead(404, { 'Content-Type': 'text/html' });
				res.end('404: File not found');
			}
		});
	}

	async function launchBrowser(url){
		// to debug, use options like: `{ headless: false, slowMo: 1000 }`
		const browser = await puppeteer.launch();
		const page = await browser.newPage();
		await await Promise.all([
			page.waitForNavigation({ waitUntil: 'load' }),
			page.goto(url)
		]);
		return { browser, page };
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

