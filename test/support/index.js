import * as usb from '../../src/particle-usb';
import * as fakeUsb from './fake-usb';
import { config } from '../../src/config';

import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import chaiSubset from 'chai-subset';
import sinon from 'sinon';
import sinonChai from 'sinon-chai';
import 'mocha-sinon';

chai.use(chaiAsPromised);
chai.use(sinonChai);
chai.use(chaiSubset);

const PRINTABLE_CHARS = ' !"#$%&\'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~';

class Logger {
  trace(...args) {
    // console.log(...args);
  }

  info(...args) {
    // console.log(...args);
  }

  warn(...args) {
    // console.log(...args);
  }

  error(...args) {
    console.log(...args);
  }
}

function integrationTest(test, check) {
  if (!process.env.RUN_INTEGRATION_TESTS) {
    console.log(`    This test is skipped by default, define RUN_INTEGRATION_TESTS to run it`);
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

config({
  log: new Logger()
});

const expect = chai.expect;
const assert = chai.assert;

export {
  fakeUsb,
  sinon,
  expect,
  assert,
  nextTick,
  randomString,
  integrationTest
};
