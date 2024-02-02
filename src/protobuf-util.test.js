const { expect } = require('../test/support');
const { extractBits, fromProtobufEnum } = require('./protobuf-util');
const { cloudDefinitions: protoCloud } = require('@particle/device-os-protobuf');

describe('protobuf-util', () => {
	describe('extractBits', () => {
		const FirmwareModuleValidityFlag = fromProtobufEnum(protoCloud.FirmwareModuleValidityFlag, {
			INTEGRITY_CHECK_FAILED: 'MODULE_INTEGRITY_VALID_FLAG',
			DEPENDENCY_CHECK_FAILED: 'MODULE_DEPENDENCIES_VALID_FLAG',
			RANGE_CHECK_FAILED: 'MODULE_RANGE_VALID_FLAG',
			PLATFORM_CHECK_FAILED: 'MODULE_PLATFORM_VALID_FLAG'
		});

		it('returns an empty array when no bits are set', () => {
			expect(extractBits(0, FirmwareModuleValidityFlag)).to.eql([]);
		});

		it('returns one value when one bit is set', () => {
			expect(extractBits(2, FirmwareModuleValidityFlag)).to.eql(['INTEGRITY_CHECK_FAILED']);
		});

		it('returns several values when several bits are set', () => {
			expect(extractBits(10, FirmwareModuleValidityFlag)).to.eql(['INTEGRITY_CHECK_FAILED', 'RANGE_CHECK_FAILED']);
		});

		it('parses known bits and ignores unknown bits', () => {
			expect(extractBits(3, FirmwareModuleValidityFlag)).to.eql(['INTEGRITY_CHECK_FAILED']);
		});

		it('ignores bits that are unknown', () => {
			expect(extractBits(1, FirmwareModuleValidityFlag)).to.eql([]);
		});
	});
});
