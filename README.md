# particle-usb

A library for accessing Particle USB devices.

**Note:** This library requires [Particle firmware](https://github.com/particle-iot/firmware) 0.8.0 or later.

## Installation

Using npm:

```sh
$ npm install particle-usb
```

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

### API reference

For more information, read the [API reference on GitHub](docs/reference.md).

### License

This library is released under the Apache 2.0 license. See [LICENSE](LICENSE) for details.
