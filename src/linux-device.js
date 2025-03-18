const { DeviceBase } = require('./device-base');

class LinuxDevice extends DeviceBase {

	async _getFirmwareVersion() {
		return {};
	}

	async getDeviceMode() {
		return 'NORMAL';
	}
}

module.exports = {
	LinuxDevice
};
