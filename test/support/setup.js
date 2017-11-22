import chai from 'chai';
import util from 'util';

const expect = chai.expect;

function dump(val) {
  const opts = {
    depth: null
  };
  console.log(util.inspect(val, opts));
}

export {
  chai,
  expect,
  dump
};
