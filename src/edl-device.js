const { getUsbDevices } = require('./usb-device-node');
const deviceConstants = require('@particle/device-constants');

const VENDOR_ID_QUALCOMM = 0x05c6;
const PRODUCT_ID_EDL_DEVICE = 0x9008;

class EdlDevice {
	constructor({ serialNumber, usbVersion }) {
		this.serialNumber = serialNumber;
		this.id = this._computeDeviceId();
		this.usbVersion = usbVersion;
	}

	_computeDeviceId() {
		// Assume all EDL devices are Tachyons and use the SOC machine ID type
		const platformId = deviceConstants.tachyon.id;
		const machineIdType = deviceConstants.linux.machineIdTypes.SOC;
		const platformAndMachineIdType = Buffer.from([platformId, machineIdType]).toString('hex');
		const suffix = this.serialNumber.toLowerCase().substring(0, 18).padStart(18, '0');
		return `42${platformAndMachineIdType}${suffix}`;
	}

	static async getEdlDevices() {
		const filters = [
			{
				vendorId: VENDOR_ID_QUALCOMM,
				productId: PRODUCT_ID_EDL_DEVICE
			}
		];
		const devs = await getUsbDevices(filters);
		return Promise.all(devs.map(async (dev) => {
			try {
				await dev.open();
				const serialNumber = dev.productName.replace(/.*_SN:/, '');
				return new EdlDevice({ serialNumber, usbVersion: dev.usbVersion });
			} finally {
				dev.close();
			}
		}));
	}
}

module.exports = {
	EdlDevice
};
