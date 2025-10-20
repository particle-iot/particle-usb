'use strict';
const os = require('os');
const path = require('path');
const { version } = require('../../../package.json');

const ROOT_DIR = path.join(__dirname, '..', '..', '..');
const E2E_DIR = path.join(ROOT_DIR, 'test', 'e2e');
const E2E_TMP_DIR = path.join(os.tmpdir(), 'particle-usb', 'e2e');
const FIXTURES_DIR = path.join(E2E_DIR, '__fixtures__');
const PROJ_NODE_SRC_DIR = path.join(FIXTURES_DIR, 'node-proj');
const PROJ_NODE_DIR = path.join(E2E_TMP_DIR, 'node-proj');
const PROJ_WEB_SRC_DIR = path.join(FIXTURES_DIR, 'web-proj');
const PROJ_WEB_DIR = path.join(E2E_TMP_DIR, 'web-proj');
const NPM_PACKAGE_PATH = path.join(ROOT_DIR, `particle-usb-${version}.tgz`);

module.exports = {
	ROOT_DIR,
	E2E_TMP_DIR,
	FIXTURES_DIR,
	NPM_PACKAGE_PATH,
	PROJ_NODE_SRC_DIR,
	PROJ_NODE_DIR,
	PROJ_WEB_SRC_DIR,
	PROJ_WEB_DIR
};

