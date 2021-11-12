const fakeUsb = require('./fake-usb');
const { config } = require('../../src/config');

const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
const chaiSubset = require('chai-subset');
const sinon = require('sinon');
const sinonChai = require('sinon-chai');

require('mocha-sinon');

const { expect, assert } = chai;

const PRINTABLE_CHARS = ' !"#$%&\'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~';

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
		setImmediate(resolve);
	});
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
	integrationTest
};
