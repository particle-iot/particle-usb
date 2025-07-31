const { platforms } = require('@particle/device-constants');

const PLATFORMS = [];

for (let p of Object.values(platforms)) {
	if (!p.usb && !p.dfu) {
		continue;
	}
	p = clone(p);
	if (p.usb) {
		p.usb = parseUsbInfo(p.usb);
	}
	if (p.dfu) {
		p.dfu = parseUsbInfo(p.dfu);
	}
	PLATFORMS.push(p);
}

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
