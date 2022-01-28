const fakeUsb = require('./fake-usb');
const { config } = require('../../src/config');

const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
const chaiSubset = require('chai-subset');
const sinon = require('sinon');
const sinonChai = require('sinon-chai');

const { expect, assert } = chai;

const PRINTABLE_CHARS = ' !"#$%&\'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~';

// to support getFakeWifiDevice
const { DeviceBase } = require('../../src/device-base');
const { Device } = require('../../src/device');
const { NetworkDevice } = require('../../src/network-device');
const { WifiDevice } = require('../../src/wifi-device');

class Logger {
	trace(/* ...args */) {
		// console.log(...args);
	}

	info(/* ...args */) {
		// console.log(...args);
	}

	warn(/* ...args */) {
		// console.log(...args);
	}

	error(...args) {
		console.log(...args);
	}
}

function integrationTest(test, check) {
	if (!process.env.RUN_INTEGRATION_TESTS) {
		console.log('    This test is skipped by default, define RUN_INTEGRATION_TESTS to run it');
		// https://github.com/mochajs/mocha/issues/2683#issuecomment-375629901
		test.test.parent.pending = true;
		test.skip();
	} else if (check) {
		return check();
	}
}

function randomString(minLen = 6, maxLen = -1) {
	if (maxLen < 0) {
		maxLen = minLen;
	}
	const len = minLen + Math.round(Math.random() * (maxLen - minLen));
	let str = '';
	for (let i = 0; i < len; ++i) {
		str += PRINTABLE_CHARS.charAt(Math.floor(Math.random() * PRINTABLE_CHARS.length));
	}
	return str;
}

function nextTick() {
	return new Promise(resolve => {
		process.nextTick(resolve);
	});
}


/**
 * This helper is a substitute for how getDevices uses 
 * setDevicePrototype to set up the correct inheritance chain.
 * 
 * It would be nice if we could just do `new WifiDevice()`, but alas that is not possible now
 */
 function getFakeWifiDevice(usbDevice, platform) {
	const device = new DeviceBase(usbDevice, platform);
	let klass = class extends NetworkDevice(Device) {};
	klass = class extends WifiDevice(klass) {};
	wifiDevice = Object.setPrototypeOf(device, klass.prototype);
	return wifiDevice;
}

chai.use(chaiAsPromised);
chai.use(sinonChai);
chai.use(chaiSubset);

config({
	log: new Logger()
});

module.exports = {
	fakeUsb,
	sinon,
	expect,
	assert,
	nextTick,
	randomString,
	integrationTest,
	getFakeWifiDevice
};
