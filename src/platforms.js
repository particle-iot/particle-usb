import deviceConstants from '@particle/device-constants';

export const PLATFORMS = Object.values(clone(deviceConstants)); // TODO: (Julien) .filter((platform) => platform.features.include('usb-requests'));

PLATFORMS.forEach((platform) => {
	if (platform.usb) {
		platform.usb = parseIds(platform.usb);
	}
	if (platform.dfu) {
		platform.dfu = parseIds(platform.dfu);
	}
});

// Convert the "0x2b04" id strings to 0x2b04 numbers
function parseIds({ vendorId, productId }) {
	return {
		vendorId: Number(vendorId),
		productId: Number(productId)
	};
}

function clone(x) {
	return JSON.parse(JSON.stringify(x));
}
