const { DeviceBase } = require('./device-base');
const { DeviceMode } = require('./device');

/**
 * Base class for Linux devices.
 *
 * This class is not meant to be instantiated directly. Use {@link getDevices} and
 * {@link openDeviceById} to create device instances.
 */
class LinuxDevice extends DeviceBase {
	/**
	 * Get the device mode.
	 *
	 * @return {Promise<DeviceMode>}
	 */
	async getDeviceMode() {
		return DeviceMode.NORMAL;
	}
}

module.exports = {
	LinuxDevice
};
