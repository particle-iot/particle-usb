# particle-usb

![CI](https://github.com/particle-iot/particle-usb/workflows/CICD/badge.svg?branch=main)

A library for accessing Particle USB devices.

**Note:** This library requires [Particle firmware](https://github.com/particle-iot/firmware) 0.8.0 or later.

[Installation](#installation) | [Usage](#usage) | [API Reference](docs/reference.md) | [Development](#development) | [Testing](#testing) | [Releasing](./RELEASE.md) | [License](#license)


## Installation

Using npm:

```sh
$ npm install particle-usb @particle/device-constants
```

_NOTE: `particle-usb` declares `@particle/device-constants` as a [`peerDependency`](https://docs.npmjs.com/cli/v6/configuring-npm/package-json#peerdependencies) - this ensures your app only ever has one copy of that dependency_

## Usage

In Node.js:

```js
import * as usb from 'particle-usb';
```

### Enumerating devices

```js
const devices = await usb.getDevices();
for (let device of devices) {
  console.log(device.type); // Prints device type, e.g. "Photon"
}
```

### Opening devices

Most of the device methods, such as `reset()`, require the device to be open:

```js
const devices = await usb.getDevices();
if (devices.length == 0) {
  throw new Error('No devices found');
}
const device = devices[0];
await device.open();
await device.reset(); // Resets the device
```

It is possible to open a device by ID:

```js
const device = await usb.openDeviceById('0123456789abcdef01234567');
await device.reset();
```

The device should be closed when it is no longer needed:

```js
await device.close();
```

## API reference

For more information, read the [API reference on GitHub](docs/reference.md).


## Development

### Installing

1. Install Node.js [`node@12.x` and `npm@8.x` are required]
1. Clone this repository `$ git clone git@github.com:particle-iot/particle-usb.git && cd ./particle-usb`
1. Install dependencies `$ npm install`
1. View available commands `$ npm run`
1. Run the tests `$ npm test`
1. Start Hacking!


## Testing

Particle USB has a number of automated test suites and related commands. The most important are:

* `npm test` - run all tests
* `npm run test:e2e` - run all end-to-end tests _NOTE: [Requires additional setup](test/e2e/README.md)_
* `npm run test:ci` - run all tests excluding device-dependent end-to-end tests as CI does
* `npm run lint` - run the linter and print any errors to your terminal
* `npm run coverage` - report code coverage stats

All tests use [mocha](https://mochajs.org), [chai](https://www.chaijs.com), and [sinon](https://sinonjs.org/) with coverage handled by [nyc](https://github.com/istanbuljs/nyc).

We recommend running locally if you can as it greatly shortens your feedback loop. However, CI also runs against every PR and [error reporting is publicly available](https://travis-ci.org/particle-iot/particle-usb).


## Releasing

For release instructions, see [RELEASE.md](./RELEASE.md)


## License

This library is released under the Apache 2.0 license. See [LICENSE](LICENSE) for details.

