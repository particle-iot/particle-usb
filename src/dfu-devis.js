/* istanbul ignore file */
/* eslint-disable */
/* dfu.js must be included before dfuse.js */
const { DfuDeviceState, DfuseCommand, DfuDeviceStatus } = require('./dfu');
const BinaryReader = require('binary-version-reader').HalModuleParser;
const fs = require('fs-extra');
const { DeviceBase, openDeviceById } = require('./device-base');

const DfuDevis = (base) => class extends base {
    _getTransferSizeFromIfaces(ifaces) {
        // Each interface has a transferSize property, get the first one with a value
        for (const iface in ifaces) {
            if (ifaces[iface].transferSize) {
                return ifaces[iface].transferSize;
            }
        }
    }

// TODO: Writing to DCT

// Dont care about device-constants. I will tell you where to write this into - pass dct address, alt setting
// Slightly lower level approach - instead of wiritng modules, we will write arb buffer into externally speciied locations
// Alternatively, add aspeate method to write to DCT
// `particle update` writes to ota section for bootloader?
// we still need to be able to write to dct for keys etc - writeToDfu dfu-util replacement
// Example:

    async updateDctFirmwareOverDfu(file, addr, leave) {
        try {
            // check if file is a file path or a file buffer

            // functions should be opinionated about the interface.
            // Make it be a buffer. Upto the caller to handle that
            // Dont make the interface wishy washy
            // Dont need to check if its a buffer or not!
            // Extract a different method. Get file content.
            let buffer;
            if (typeof file === 'string' && fs.existsSync(file)) {
                buffer = await fs.readFile(file);
            } else if (!fs.existsSync(file)) {
                throw new Error('File does not exist');
            } else if (file instanceof Buffer) {
                buffer = file;
            } else {
                throw new Error('Invalid file type');
            }

            const intrfaces = await this._dfu.getInterfaces();
            const transferSize = this._getTransferSizeFromIfaces(intrfaces);
            await this._dfu.setAltInterface(1); // Un-hardcode this
            const memoryInfo = this._dfu.parseMemoryDescriptor(intrfaces[1].name);
            let options = {};
            if (leave) {
                options = { doManifestation: true };
            }
            await this._dfu.do_download(memoryInfo, addr, transferSize, buffer, options);
        } catch (e) {
            throw new Error(e);
        }
    }

    async updateFirmwareOverDfu(file, options) {	// -> this belogn to dfuDeviceclass? and DfuParse also belong to dfuDeviceCLass?
        //knoow the specicsi of particle firmware is and know what the memory addresses are after it;s parsed and know the dfu alt to use
        // next layer: you have a do_download where i can pass th einterface and at that layer - it should go and download
        // Add a new layer for the above - you take an interface number, moduleStart, moduleEnd, buffer and options and etc

        try {
            const binReader = new BinaryReader();
            let fileInfo;
            // check if file is a file path or a file buffer
            if (typeof file === 'string' && fs.existsSync(file)) {
                fileInfo = await binReader.parseFile(file);
            } else if (!fs.existsSync(file)) {
                throw new Error('File does not exist');
            } else if (file instanceof Buffer) {
                fileInfo = await binReader.parseBuffer(file);
            } else {
                throw new Error('Invalid file type');
            }

            const intrfaces = await this._dfu.getInterfaces();
            const transferSize = this._getTransferSizeFromIfaces(intrfaces);
            await this._dfu.setAltInterface(0); // Un-hardcode this

            // TODO: device constants
            // pass file buffer instead of filepath
            // Always single interface in dfu mode. For now, hardcode it to 0
            const memoryInfo = this._dfu.parseMemoryDescriptor(intrfaces[0].name);
            const moduleStartAddr = parseInt(fileInfo.prefixInfo.moduleStartAddy, 16);
            const moduleEndAddr = parseInt(fileInfo.prefixInfo.moduleEndAddy, 16);
            console.log('moduleStartAddr', moduleStartAddr);
            console.log('moduleEndAddr', moduleEndAddr);
            await this._dfu.do_download(memoryInfo, moduleStartAddr, transferSize, fileInfo.fileBuffer, options);

        } catch (err) {
            throw new Error(err);
        }
    }

    // Scott changed device-os-test-runner to access p-usb device object directly.
    // From JS side of tests, access pusb directly.
    // on-device tests

    // unit tests with fake usb
    // copy over descriptors so it imitates real device
    //



};

module.exports = {
    DfuDevis
};
