import * as usb from '../../src/particle-usb';
import * as fakeUsb from './fake-usb';

import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import sinonChai from 'sinon-chai';

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
    console.log(...args);
  }

  error(...args) {
    console.log(...args);
  }
}

usb.config({
  log: new Logger()
});

const expect = chai.expect;

export {
  usb,
  fakeUsb,
  expect
};
