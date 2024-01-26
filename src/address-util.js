function convertBufferToMacAddress(buffer) {
	if (!buffer) {
		return buffer;
	}

	const bytes = Array.from(buffer);
	return bytes.map(byte => byte.toString(16).padStart(2, '0')).join(':');
}

module.exports = {
	convertBufferToMacAddress
};
