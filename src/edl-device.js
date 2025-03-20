const { getUsbDevices } = require('./usb-device-node');

const VENDOR_ID_QUALCOMM = 0x05c6;
const PRODUCT_ID_EDL_DEVICE = 0x9008;

class EdlDevice {
	constructor({ serialNumber }) {
		this.serialNumber = serialNumber;
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
				return new EdlDevice({ serialNumber });
			} finally {
				dev.close();
			}
		}));
	}
}

module.exports = {
	EdlDevice
};
