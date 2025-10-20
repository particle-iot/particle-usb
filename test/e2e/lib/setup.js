'use strict';
const fs = require('fs-extra');
const execa = require('execa');
const {
	ROOT_DIR,
	E2E_TMP_DIR,
	PROJ_NODE_SRC_DIR,
	PROJ_NODE_DIR,
	PROJ_WEB_SRC_DIR,
	PROJ_WEB_DIR,
	NPM_PACKAGE_PATH
} = require('./constants');


exports.mochaGlobalSetup = async () => {
	// eslint-disable-next-line no-console
	console.log([
		'::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::',
		':::: Particle USB | E2E Tests ::::::::::::::::::::::::::::::::::::::',
		':::: See: ./test/e2e :::::::::::::::::::::::::::::::::::::::::::::::',
		'::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::',
	].join('\n'));
	await fs.emptyDir(E2E_TMP_DIR);
	await fs.ensureDir(E2E_TMP_DIR);
	await fs.copy(PROJ_NODE_SRC_DIR, PROJ_NODE_DIR);
	await fs.copy(PROJ_WEB_SRC_DIR, PROJ_WEB_DIR);
	// TODO (mirande): use `['pack', '--pack-destination', E2E_TMP_DIR]` when
	// npm@6 is out of the question
	await execa('npm', ['pack'], { cwd: ROOT_DIR });
	await execa('npm', ['install'], { cwd: PROJ_NODE_DIR });
	await execa('npm', ['install', NPM_PACKAGE_PATH], { cwd: PROJ_NODE_DIR });

	if (needsParticleDevices(process.argv)){
		const usb = require(PROJ_NODE_DIR);
		const devices = await usb.getDevices();

		if (devices.length === 0){
			throw new Error('Unable to find Particle devices - please connect your device(s) via USB');
		}
	}
};

exports.mochaGlobalTeardown = async () => {
	// TODO (mirande): remove once packed tarball is able to be saved to temp dir
	await fs.remove(NPM_PACKAGE_PATH);
};

function needsParticleDevices(argv){
	if (!Array.isArray(argv)){
		return false;
	}

	if (argv.includes('--grep') && argv.includes('@device') && argv.includes('--invert')){
		return false;
	}

	return true;
}
