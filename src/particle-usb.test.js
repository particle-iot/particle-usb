const { /*sinon*/ expect } = require('../test/support');
const particleUSB = require('./particle-usb');
describe('Public interface of npm module', () => {
	it('exports expected objects and functions', () => {
		expect(particleUSB.getDevices).to.be.a('Function');
		expect(particleUSB.openDeviceById).to.be.a('Function');
		expect(particleUSB.PollingPolicy).to.be.an('object');
		expect(particleUSB.PollingPolicy.DEFAULT).to.be.a('Function');

		// Deliberately, omitting a lot of stuff below that is true below
		// Given device-os-protobuf/DeviceOSProtobuf.getDefinition(), why do we need to export this stuff?
		// expect(particleUSB.FirmwareModule).to.be.an('object');
		// expect(particleUSB.FirmwareModule.BOOTLOADER).to.eql('BOOTLOADER');
		// expect(particleUSB.FirmwareModule.SYSTEM_PART).to.eql('SYSTEM_PART');
		// expect(particleUSB.FirmwareModule.USER_PART).to.eql('USER_PART');
		// expect(particleUSB.FirmwareModule.MONO_FIRMWARE).to.eql('MONO_FIRMWARE');
		// expect(particleUSB.NetworkStatus).to.be.an('object');
		// expect(particleUSB.WifiAntenna).to.be.an('object');
		// expect(particleUSB.WifiCipher).to.be.an('object');
		// expect(particleUSB.EapMethod).to.be.an('object');

		expect(particleUSB.CloudConnectionStatus).to.be.an('object');
		expect(particleUSB.Result).to.be.an('object');
		expect(particleUSB.DeviceError).to.be.a('Function');
		expect(particleUSB.NotFoundError).to.be.a('Function');
		expect(particleUSB.NotAllowedError).to.be.a('Function');
		expect(particleUSB.StateError).to.be.a('Function');
		expect(particleUSB.TimeoutError).to.be.a('Function');
		expect(particleUSB.MemoryError).to.be.a('Function');
		expect(particleUSB.ProtocolError).to.be.a('Function');
		expect(particleUSB.UsbError).to.be.a('Function');
		expect(particleUSB.InternalError).to.be.a('Function');
		expect(particleUSB.RequestError).to.be.a('Function');
		expect(particleUSB.config).to.be.a('Function');
	});
});
