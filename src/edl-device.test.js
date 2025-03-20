const { fakeUsb, expect } = require('../test/support');
const proxyquire = require('proxyquire');

const { EdlDevice } = proxyquire('./edl-device', {
	'./usb-device-node': fakeUsb
});

describe('EdlDevice', () => {
	afterEach(() => {
		// "Detach" all USB devices
		fakeUsb.clearDevices();
	});

	describe('getEdlDevices()', () => {
		it('enumerates EDL devices with their serial number', async () => {
			fakeUsb.addDevice({ vendorId: 0xaaaa, productId: 0xaaaa });
			fakeUsb.addDevice({ vendorId: 0x05c6, productId: 0x9008, productName: 'QUSB_BULK_CID:042F_SN:C6ACF5F8' });
			const serialNumbers = ['C6ACF5F8'];

			const devs = await EdlDevice.getEdlDevices();

			expect(devs.map(dev => dev.serialNumber)).to.have.all.members(serialNumbers);
		});
	});
});
