const { fakeUsb, expect } = require('./support');
const proxyquire = require('proxyquire');
const sinon = require('sinon');
const { InternalFlashParsedP2 } = require('./support/usb-data');

const { getDevices } = proxyquire('../src/particle-usb', {
	'./device-base': proxyquire('../src/device-base', {
		'./usb-device-node': fakeUsb
	})
});

const DfuDeviceState = {
	dfuIDLE: 0,
	dfuUPLOADING: 1,
	dfuERROR: 2,
	dfuDNLOAD_IDLE: 5
};
describe('dfu device', () => {	// actually tests src/dfu.js which is the dfu driver impl
	afterEach(() => {
		// "Detach" all USB devices
		fakeUsb.clearDevices();
	});

	describe('Dfu Device', () => {
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

			// it('getInterfaces', async () => {
			// 	const devs = await getDevices();
			// 	for (const dev of devs) {
			// 		if (dev._dev._opts.type === 'argon') {
			// 			await dev.open();
			// 			expect(dev.isOpen).to.be.true;
			// 			await dev.getInterfaces();
			// 		}
			// 	}
			//
			// });
		});

		describe('poll_until', () => {

			it('should resolve when statePredicate returns true', async () => {
				// Arrange
				fakeUsb.addArgon({ dfu: true });
				const devs = await getDevices();
				expect(devs).to.not.be.empty;
				const argonDev = devs[0];
				await argonDev.open();
				expect(argonDev.isOpen).to.be.true;
				const mockGetStatus = sinon.stub(argonDev._dfu, '_getStatus');
				mockGetStatus.onCall(0).resolves({ state: DfuDeviceState.dfuIDLE, pollTimeout: 100 });
				mockGetStatus.onCall(1).resolves({ state: DfuDeviceState.dfuIDLE, pollTimeout: 100 });
				mockGetStatus.onCall(2).resolves({ state: DfuDeviceState.dfuUPLOADING, pollTimeout: 100 });
				const statePredicate = (state) => state === DfuDeviceState.dfuUPLOADING;

				// Act
				const result = await argonDev._dfu.poll_until(statePredicate);

				// Assert
				expect(result.state).to.equal(DfuDeviceState.dfuUPLOADING);
				expect(mockGetStatus.callCount).to.equal(3);

				fakeUsb.clearDevices();
			});
		});

		describe('parseMemoryDescriptor', () => {
			it('should parse memory descriptor', async () => {
				const memoryDescStr = '@Internal Flash   /0x08000000/03*016Ka,01*016Kg,01*064Kg,07*128Kg';

				fakeUsb.addArgon({ dfu: true });
				const devs = await getDevices();
				expect(devs).to.not.be.empty;
				const argonDev = devs[0];
				await argonDev.open();
				expect(argonDev.isOpen).to.be.true;
				const parsedRes = argonDev._dfu.parseMemoryDescriptor(memoryDescStr);

				expect(parsedRes).to.eql(InternalFlashParsedP2);
			});
		});

		describe('dfuseCommand', () => {
			it('sends a dfuSe command', async () => {
				fakeUsb.addArgon({ dfu: true });
				const devs = await getDevices();
				expect(devs).to.not.be.empty;
				const argonDev = devs[0];
				await argonDev.open();
				expect(argonDev.isOpen).to.be.true;
				let error;
				try {
					await argonDev._dfu.dfuseCommand(0x21, 0x8006000, 5);
				} catch (_error) {
					error = _error;
					console.log('Error is', error);
				}

				expect(error).to.not.be.an.instanceof(Error);
			});
		});

		describe('parseMemoryDescriptor', () => {
			it('should parse memory descriptor', async () => {
				const memoryDescStr = '@Internal Flash   /0x08000000/03*016Ka,01*016Kg,01*064Kg,07*128Kg';

				fakeUsb.addArgon({ dfu: true });
				const devs = await getDevices();
				expect(devs).to.not.be.empty;
				const argonDev = devs[0];
				await argonDev.open();
				expect(argonDev.isOpen).to.be.true;
				const parsedRes = argonDev._dfu.parseMemoryDescriptor(memoryDescStr);

				expect(parsedRes).to.eql(InternalFlashParsedP2);
			});
		});

		describe('getSegemnt', () => {
			it('gets segment', async () => {
				const memoryDescStr = '@Internal Flash   /0x08000000/03*016Ka,01*016Kg,01*064Kg,07*128Kg';

				fakeUsb.addArgon({ dfu: true });
				const devs = await getDevices();
				expect(devs).to.not.be.empty;
				const argonDev = devs[0];
				await argonDev.open();
				expect(argonDev.isOpen).to.be.true;
				const parsedRes = argonDev._dfu.parseMemoryDescriptor(memoryDescStr);

				expect(parsedRes).to.eql(InternalFlashParsedP2);
			});

			it('errors when memory map is unavailable', async () => {
				const memoryDescStr = '@Internal Flash   /0x08000000/03*016Ka,01*016Kg,01*064Kg,07*128Kg';

				fakeUsb.addArgon({ dfu: true });
				const devs = await getDevices();
				expect(devs).to.not.be.empty;
				const argonDev = devs[0];
				await argonDev.open();
				expect(argonDev.isOpen).to.be.true;
				const parsedRes = argonDev._dfu.parseMemoryDescriptor(memoryDescStr);

				expect(parsedRes).to.eql(InternalFlashParsedP2);
			});
		});

	});
});
