import * as usb from '../../src/particle-usb';
import * as fakeUsb from './fake-usb';

import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import sinon from 'sinon';
import sinonChai from 'sinon-chai';
import 'mocha-sinon';

import * as util from 'util';

chai.use(chaiAsPromised);
chai.use(sinonChai);

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

function nextTick() {
  return new Promise(resolve => {
    setImmediate(resolve);
  });
}

function dump(val) {
  console.log(util.inspect(val, { depth: null }));
}

usb.config({
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
  dump
};
