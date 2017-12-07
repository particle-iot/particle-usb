import * as usb from '../../src/particle-usb';

import chai from 'chai';

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

const expect = chai.expect;

usb.config({
  log: new Logger()
});

export {
  usb,
  chai,
  expect
};
