import { PollingPolicy } from '../src/device-base';
import { getDevices } from '../src/particle-usb';
import * as usbImpl from '../src/usb-device-node';
import * as error from '../src/error';

import { fakeUsb, sinon, expect, nextTick } from './support';

describe('device', () => {
	before(() => {
		// Stub the USB implementation used by the library
		sinon.stub(usbImpl, 'getUsbDevices').callsFake(fakeUsb.getDevices);
	});

	after(() => {
		usbImpl.getUsbDevices.restore();
	});

	beforeEach(function setup() {
		this.tick = async t => {
			// Wait for the next event loop iteration to ensure that all promise callbacks get invoked:
			// https://github.com/sinonjs/sinon/issues/738
			await nextTick();
			this.sinon.clock.tick(t);
		};
		// Number of CHECK requests sent to a USB device during the test
		this.checkCount = 0;
		// Current polling policy
		this.pollingPolicy = PollingPolicy.DEFAULT;
		// Fires the CHECK request timer depending on current polling policy
		this.checkTimeout = async () => {
			await this.tick(this.pollingPolicy(this.checkCount++));
		};
		// "Detach" all USB devices
		fakeUsb.clearDevices();
	});

	describe('Device', () => {
		describe('with multiple devices', () => {
			beforeEach(async () => {
				fakeUsb.addCore({ dfu: true });
				fakeUsb.addPhoton({ dfu: true });
				fakeUsb.addP1({ dfu: true });
				fakeUsb.addElectron({ dfu: true });
				fakeUsb.addArgon({ dfu: true });
				fakeUsb.addBoron({ dfu: true });
				fakeUsb.addXenon({ dfu: true });
				fakeUsb.addArgonSom({ dfu: true });
				fakeUsb.addBoronSom({ dfu: true });
				fakeUsb.addXenonSom({ dfu: true });
				fakeUsb.addCore();
				fakeUsb.addPhoton();
				fakeUsb.addP1();
				fakeUsb.addElectron();
				fakeUsb.addArgon();
				fakeUsb.addBoron();
				fakeUsb.addXenon();
				fakeUsb.addArgonSom();
				fakeUsb.addBoronSom();
				fakeUsb.addXenonSom();
			});

			it('open, reset, close', async () => {
				const devs = await getDevices();
				for (let dev of devs) {
					await dev.open();
					expect(dev.isOpen).to.be.true;
				}

				for (let dev of devs) {
					if (dev.isCore && !dev.isInDfuMode) {
						// Core can only be reset from DFU mode
						expect(dev.reset()).to.be.rejectedWith(error.StateError);
					} else {
						await dev.reset();
					}
				}

				for (let dev of devs) {
					await dev.close();
					expect(dev.isOpen).to.be.false;
				}
			});
		});
	});
});
