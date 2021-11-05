import deviceConstants from '@particle/device-constants';

export const PLATFORMS = Object.values(deviceConstants); // TODO: (Julien) .filter((platform) => platform.features.include('usb-requests'));

// Convert the "0x2b04" id strings to 0x2b04 numbers
const parseIds = ({ vendorId, productId }) => {
	return {
		vendorId: parseInt(vendorId.replace(/0x/, ''), 16),
		productId: parseInt(productId.replace(/0x/, ''), 16)
	};
};
PLATFORMS.forEach((platform) => {
	if (platform.usb) {
		platform.usb = parseIds(platform.usb);
	}
	if (platform.dfu) {
		platform.dfu = parseIds(platform.dfu);
	}
});
