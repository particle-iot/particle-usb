const { expect } = require('../test/support');

const { Dfu } = require('./dfu');

describe('dfu', () => {
	describe('parseMemoryDescriptor', () => {
		it('returns the memory segments from a memory descriptor', () => {
			const dfu = new Dfu();
			const memoryDescStr = '@Internal Flash   /0x08000000/03*016Ka,01*016Kg,01*064Kg,07*128Kg';
			const expectedDescriptor = {
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

			expect(dfu.parseMemoryDescriptor(memoryDescStr)).to.deep.equal(expectedDescriptor);
		});
	});
});
