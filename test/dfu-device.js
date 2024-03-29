const { fakeUsb, expect } = require('./support');
const proxyquire = require('proxyquire');
const sinon = require('sinon');
const { DfuDeviceState, DfuseCommand } = require('../src/dfu');

const { getDevices } = proxyquire('../src/particle-usb', {
	'./device-base': proxyquire('../src/device-base', {
		'./usb-device-node': fakeUsb
	})
});

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

			it('_getInterfaces', async () => {
				// TODO: get the interfaces
				// this currently sets the alt setting on a given interface.
				// For example: set alt setting = 1 on interface number 5
				// which is Internal flash.
			});
		});

		describe('_pollUntil', () => {

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
				mockGetStatus.onCall(2).resolves({ state: DfuDeviceState.dfuDNLOAD_SYNC, pollTimeout: 100 });
				const statePredicate = (state) => state === DfuDeviceState.dfuDNLOAD_SYNC;

				// Act
				const result = await argonDev._dfu._pollUntil(statePredicate);

				// Assert
				expect(result.state).to.equal(DfuDeviceState.dfuDNLOAD_SYNC);
				expect(mockGetStatus.callCount).to.equal(3);

				fakeUsb.clearDevices();
			});
		});

		describe('_dfuseCommand', () => {
			it('sends a dfuSe command', async () => {
				fakeUsb.addArgon({ dfu: true });
				const devs = await getDevices();
				expect(devs).to.not.be.empty;
				const argonDev = devs[0];
				await argonDev.open();
				expect(argonDev.isOpen).to.be.true;
				let error;
				try {
					await argonDev._dfu._goIntoDfuIdleOrDfuDnloadIdle();
					await argonDev._dfu._dfuseCommand(0x21, 0x08060000);
				} catch (_error) {
					error = _error;
				}

				expect(error).to.not.be.an.instanceof(Error);
			});
		});

		describe('erase', () => {
			it('erases the memory on an electron', async () => {
				fakeUsb.addArgon({ dfu: true });
				const devs = await getDevices();
				expect(devs).to.not.be.empty;
				const argonDev = devs[0];
				await argonDev.open();
				expect(argonDev.isOpen).to.be.true;
				const segment = {
					'start': 134348800,
					'sectorSize': 131072,
					'end': 135266304,
					'readable': true,
					'erasable': true,
					'writable': true
				};
				argonDev._dfu._memoryInfo = {
					'name': 'Internal Flash',
					segments: [segment],
				};
				const startAddr = 134610944;
				const sectorAddr = 134610944;
				const length = 87468;
				const dfuseCommandStub = sinon.stub(argonDev._dfu, '_dfuseCommand');

				await argonDev._dfu._erase(startAddr, length);

				expect(dfuseCommandStub.calledOnce).to.be.true;
				expect(dfuseCommandStub.calledWithExactly(DfuseCommand.DFUSE_COMMAND_ERASE ,sectorAddr)).to.be.true;
			});

			it('erases the memory on a p2', async () => {
				fakeUsb.addP2({ dfu: true });
				const devs = await getDevices();
				expect(devs).to.not.be.empty;
				const p2Dev = devs[0];
				await p2Dev.open();
				expect(p2Dev.isOpen).to.be.true;
				p2Dev._dfu._memoryInfo = {
					'name': 'Internal Flash',
					'segments': [
						{
							'start': 134217728,
							'sectorSize': 4096,
							'end': 142606336,
							'readable': true,
							'erasable': true,
							'writable': true
						}
					]
				};
				const startAddr = 134610944;
				const length = 1009100;
				const dfuseCommandStub = sinon.stub(p2Dev._dfu, '_dfuseCommand');

				await p2Dev._dfu._erase(startAddr, length);

				expect(dfuseCommandStub.callCount).to.equal(247);
			});
		});
	});
});
