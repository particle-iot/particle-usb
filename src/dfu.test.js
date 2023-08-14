const { expect } = require('../test/support');

const { Dfu } = require('./dfu');

describe('dfu', () => {
	describe('_parseMemoryDescriptor', () => {
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

			expect(dfu._parseMemoryDescriptor(memoryDescStr)).to.deep.equal(expectedDescriptor);
		});

		it('errors when memory descriptor string is not valid', () => {
			const dfu = new Dfu();
			const memoryDescStr = '';
			let error;
			try {
				dfu._parseMemoryDescriptor(memoryDescStr);
			} catch (_error) {
				error = _error;
			}

			expect(error).to.be.an.instanceof(Error);
		});
	});

	describe('_getSegment', () => {
		it('gets memory segment', () => {
			const dfu = new Dfu();
			dfu._memoryInfo = {
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
			const expectedRes = {
				'end': 135266304,
				'erasable': true,
				'readable': true,
				'sectorSize': 131072,
				'start': 134348800,
				'writable': true,
			};

			const parsedRes = dfu._getSegment(134348800);

			expect(parsedRes).to.deep.equal(expectedRes);
		});
	});

	describe('_getSectorStart', () => {
		it('gets sector start', () => {
			const dfu = new Dfu();
			dfu._memoryInfo = {
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
			const segment = dfu._getSegment(134348800);

			const parsedRes = dfu._getSectorStart(134348800, segment);

			expect(parsedRes).to.eql(134348800);
		});
	});

	describe('_getSectorEnd', () => {
		it('gets sector end', () => {
			const dfu = new Dfu();
			dfu._memoryInfo = {
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
			const segment = dfu._getSegment(134348800);

			const parsedRes = dfu._getSectorEnd(134348800, segment);

			expect(parsedRes).to.eql(134479872);
		});
	});

});
