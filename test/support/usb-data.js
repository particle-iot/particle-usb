const iInterface7 = {
	_dev: {
		interfaces: [
			{
				altSetting: 1,
				interfaceNumber: 0,
				descriptor: {
					extra: [0x09, 0x21, 0x0b, 0xff, 0, 0, 0x10, 0x1A, 0x01],
					iInterface: 7
				}
			}
		],

		// Add the 'interface' function
		interface: function (interfaceNumber) {
			const interfaceObj = this.interfaces.find(
				(iface) => iface.interfaceNumber === interfaceNumber
			);

			if (interfaceObj) {
				return interfaceObj.altSetting;
			} else {
				return undefined; // Or any default value for interface not found
			}
		}
	}
};

const iInterface6 = {
	_dev: {
		interfaces: [
			{
				altSetting: 1,
				interfaceNumber: 0,
				descriptor: {
					extra: [],
					iInterface: 7
				}
			}
		],

		// Add the 'interface' function
		interface: function (interfaceNumber) {
			const interfaceObj = this.interfaces.find(
				(iface) => iface.interfaceNumber === interfaceNumber
			);

			if (interfaceObj) {
				return interfaceObj.altSetting;
			} else {
				return undefined; // Or any default value for interface not found
			}
		}
	}
};

const InternalFlashParsedElectron = {
	'name': 'Internal Flash',
	'segments': [
		{
			'start': 134217728,
			'sectorSize': 16384,
			'end': 134266880,
			'readable': true,
			'erasable': false,
			'writable': false
		},
		{
			'start': 134266880,
			'sectorSize': 16384,
			'end': 134283264,
			'readable': true,
			'erasable': true,
			'writable': true
		},
		{
			'start': 134283264,
			'sectorSize': 65536,
			'end': 134348800,
			'readable': true,
			'erasable': true,
			'writable': true
		},
		{
			'start': 134348800,
			'sectorSize': 131072,
			'end': 135266304,
			'readable': true,
			'erasable': true,
			'writable': true
		}
	]
};

const InternalFlashParsedP2 = {
	'name': 'Internal Flash',
	'segments': [
		{
			'start': 134217728,
			'sectorSize': 4096,
			'end': 142606336,
			'readable': true,
			'erasable': true,
			'writable': true
		}
	]
};

module.exports = {
	iInterface7,
	iInterface6,
	InternalFlashParsedElectron,
	InternalFlashParsedP2
};
