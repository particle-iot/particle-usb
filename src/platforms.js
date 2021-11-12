const deviceConstants = require('@particle/device-constants');

const PLATFORMS = Object.values(clone(deviceConstants)); // TODO: (Julien) .filter((platform) => platform.features.include('usb-requests'));

PLATFORMS.forEach((platform) => {
	if (platform.usb) {
		platform.usb = parseUsbInfo(platform.usb);
	}
	if (platform.dfu) {
		platform.dfu = parseUsbInfo(platform.dfu);
	}
});

// Convert the "0x2b04" id strings to 0x2b04 numbers
function parseUsbInfo({ vendorId, productId, quirks }) {
	return {
		vendorId: Number(vendorId),
		productId: Number(productId),
		quirks: quirks || {}
	};
}

function clone(x) {
	return JSON.parse(JSON.stringify(x));
}

module.exports = {
	PLATFORMS
};
