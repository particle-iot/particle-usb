const { fakeUsb, expect } = require('./support');
const proxyquire = require('proxyquire');

const { getDevices } = proxyquire('../src/particle-usb', {
	'./device-base': proxyquire('../src/device-base', {
		'./usb-device-node': fakeUsb
	})
});

const proto = require('@particle/device-os-protobuf');
const controlProto = proto.particle.ctrl;

describe('device', () => {
	afterEach(() => {
		// "Detach" all USB devices
		fakeUsb.clearDevices();
	});

	describe('Device', () => {
		describe('with multiple devices', () => {
			beforeEach(async () => {
				fakeUsb.addPhoton({ dfu: true });
				fakeUsb.addP1({ dfu: true });
				fakeUsb.addElectron({ dfu: true });
				fakeUsb.addArgon({ dfu: true });
				fakeUsb.addBoron({ dfu: true });
				fakeUsb.addXenon({ dfu: true });
				fakeUsb.addArgonSom({ dfu: true });
				fakeUsb.addBoronSom({ dfu: true });
				fakeUsb.addXenonSom({ dfu: true });
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
				expect(devs).to.not.be.empty;

				for (const dev of devs) {
					await dev.open();
					expect(dev.isOpen).to.be.true;
				}

				for (const dev of devs) {
					await dev.reset();
				}

				for (const dev of devs) {
					await dev.close();
					expect(dev.isOpen).to.be.false;
				}
			});
		});
	});
});
