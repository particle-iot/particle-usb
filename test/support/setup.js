import * as usb from '../../src/particle-usb';

import chai from 'chai';
import util from 'util';

class Logger {
  trace(...args) {
    // console.log(...args);
  }

  info(...args) {
    // console.log(...args);
  }

  warn(...args) {
    console.log(...args);
  }

  error(...args) {
    console.log(...args);
  }
}

function dump(val) {
  const opts = {
    depth: null
  };
  console.log(util.inspect(val, opts));
}

const expect = chai.expect;

usb.DeviceBase.config({
  logger: new Logger()
});

export {
  usb,
  chai,
  expect,
  dump
};
