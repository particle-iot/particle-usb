const { sinon, expect } = require('../test/support');
const { DeviceError } = require('./error');
const {
	DfuError,
	DfuseCommand,
	DfuDeviceStateMap,
	Dfu
} = require('./dfu');


describe.only('dfu.js', () => {
	afterEach(() => {
		sinon.restore();
	});

	describe('Exports', () => {
		it('Exports expected commands', () => {
			expect(DfuseCommand).to.have.all.keys(
				'DFUSE_COMMAND_ERASE',
				'DFUSE_COMMAND_GET_COMMAND',
				'DFUSE_COMMAND_NONE',
				'DFUSE_COMMAND_READ_UNPROTECT',
				'DFUSE_COMMAND_SET_ADDRESS_POINTER'
			);
		});

		it('Exports device status map', () => {
			console.log(DfuDeviceStateMap);
			expect(DfuDeviceStateMap).to.have.all.keys(
				'DFUSE_COMMAND_ERASE',
				'DFUSE_COMMAND_GET_COMMAND',
				'DFUSE_COMMAND_NONE',
				'DFUSE_COMMAND_READ_UNPROTECT',
				'DFUSE_COMMAND_SET_ADDRESS_POINTER'
			);
		});

		it('Exports `DfuError` type', () => {
			sinon.spy(Error, 'captureStackTrace');
			const err = new DfuError('whoops!');

			expect(err).to.be.instanceof(Error);
			expect(err).to.be.instanceof(DeviceError);
			expect(err).to.be.instanceof(DfuError);
			expect(err.message).to.equal('whoops!');
			expect(Error.captureStackTrace).to.have.property('callCount', 1);
			expect(Error.captureStackTrace.args[0]).to.eql([err, err.constructor]);
		});
	});

	describe('DFU functions', () => {
		let dfu, fakeDevice, fakeLogger;
		const DEFAULT_INTERFACE = 0;
		const DEFAULT_ALTERNATE = 0;

		beforeEach(async () => {
			fakeLogger = {};
			fakeDevice = {
				async setAltSetting(){},
				async claimInterface(){},
				async releaseInterface(){}
			};
			dfu = new Dfu(fakeDevice, fakeLogger);
		});

		it('Initializes', () => {
			expect(dfu).to.have.property('_dev', fakeDevice);
			expect(dfu).to.have.property('_log', fakeLogger);
			expect(dfu).to.have.property('_interface', DEFAULT_INTERFACE);
			expect(dfu).to.have.property('_alternate', DEFAULT_ALTERNATE);
			expect(dfu).to.have.property('_claimed', false);
		});

		it('Opens DFU interface', async () => {
			sinon.stub(fakeDevice, 'claimInterface').resolves();
			sinon.stub(fakeDevice, 'setAltSetting').resolves();

			await dfu.open();

			expect(dfu).to.have.property('_claimed', true);
			expect(fakeDevice.claimInterface).to.have.property('callCount', 1);
			expect(fakeDevice.claimInterface.args[0]).to.eql([DEFAULT_INTERFACE]);
			expect(fakeDevice.setAltSetting).to.have.property('callCount', 1);
			expect(fakeDevice.setAltSetting.args[0]).to.eql([DEFAULT_INTERFACE, DEFAULT_ALTERNATE]);
		});

		it('Closes DFU interface', async () => {
			sinon.stub(fakeDevice, 'releaseInterface').resolves();
			dfu._claimed = true;

			await dfu.close();

			expect(dfu).to.have.property('_claimed', true); // TODO (mirande): should this be `false`?
			expect(fakeDevice.releaseInterface).to.have.property('callCount', 1);
			expect(fakeDevice.releaseInterface.args[0]).to.eql([DEFAULT_INTERFACE]);
		});

		it('Does nothing if DFU interface is already closed', async () => {
			sinon.stub(fakeDevice, 'releaseInterface').resolves();
			dfu._claimed = false;

			await dfu.close();

			expect(dfu).to.have.property('_claimed', false);
			expect(fakeDevice.releaseInterface).to.have.property('callCount', 0);
		});

		it('Leaves DFU mode', async () => {
			const fakeStatus = { status: 0, pollTimeout: 0, state: 0 };
			sinon.stub(dfu, '_goIntoDfuIdleOrDfuDnloadIdle').resolves();
			sinon.stub(dfu, '_sendDnloadRequest').resolves();
			sinon.stub(dfu, '_getStatus').resolves(fakeStatus);
			dfu._claimed = true;

			await dfu.close();

			expect(dfu).to.have.property('_claimed', true); // TODO (mirande): should this be `false`?
			expect(fakeDevice.releaseInterface).to.have.property('callCount', 1);
			expect(fakeDevice.releaseInterface.args[0]).to.eql([DEFAULT_INTERFACE]);
		});
	});
});

