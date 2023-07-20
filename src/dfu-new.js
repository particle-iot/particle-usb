/* istanbul ignore file */
/* eslint-disable */
/* dfu.js must be included before dfuse.js */
const { DfuDeviceState, DfuseCommand, DfuDeviceStatus } = require('./dfu');

const DfuDeviceNew = (base) => class extends base {

    parseMemoryDescriptor(desc) {
        const nameEndIndex = desc.indexOf("/");
        if (!desc.startsWith("@") || nameEndIndex == -1) {
            throw new Error(`Not a DfuSe memory descriptor: "${desc}"`);
        }

        const name = desc.substring(1, nameEndIndex).trim();
        const segmentString = desc.substring(nameEndIndex);

        let segments = [];

        const sectorMultipliers = {
            ' ': 1,
            'B': 1,
            'K': 1024,
            'M': 1048576
        };

        let contiguousSegmentRegex = /\/\s*(0x[0-9a-fA-F]{1,8})\s*\/(\s*[0-9]+\s*\*\s*[0-9]+\s?[ BKM]\s*[abcdefg]\s*,?\s*)+/g;
        let contiguousSegmentMatch;
        while (contiguousSegmentMatch = contiguousSegmentRegex.exec(segmentString)) {
            let segmentRegex = /([0-9]+)\s*\*\s*([0-9]+)\s?([ BKM])\s*([abcdefg])\s*,?\s*/g;
            let startAddress = parseInt(contiguousSegmentMatch[1], 16);
            let segmentMatch;
            while (segmentMatch = segmentRegex.exec(contiguousSegmentMatch[0])) {
                let segment = {}
                let sectorCount = parseInt(segmentMatch[1], 10);
                let sectorSize = parseInt(segmentMatch[2]) * sectorMultipliers[segmentMatch[3]];
                let properties = segmentMatch[4].charCodeAt(0) - 'a'.charCodeAt(0) + 1;
                segment.start = startAddress;
                segment.sectorSize = sectorSize;
                segment.end = startAddress + sectorSize * sectorCount;
                segment.readable = (properties & 0x1) != 0;
                segment.erasable = (properties & 0x2) != 0;
                segment.writable = (properties & 0x4) != 0;
                segments.push(segment);

                startAddress += sectorSize * sectorCount;
            }
        }

        return {"name": name, "segments": segments};
    };

    async dfuseCommand(command, param, len) {
        if (typeof param === 'undefined' && typeof len === 'undefined') {
            param = 0x00;
            len = 1;
        }

        const commandNames = {
            0x00: "GET_COMMANDS",
            0x21: "SET_ADDRESS",
            0x41: "ERASE_SECTOR"
        };

        let payload = Buffer.alloc(5);
        payload[0] = command;
        payload[1] = param & 0xff;
        payload[2] = (param >> 8) & 0xff;
        payload[3] = (param >> 16) & 0xff;
        payload[4] = (param >> 24) & 0xff;

        for(let triesLeft = 4; triesLeft >= 0; triesLeft--) {
            try {
                await this._dfu._sendDnloadRequest(payload, 0);
                break;
            } catch (error) {
                if (triesLeft == 0 || error != 'stall') {
                    throw new Error("Error during special DfuSe command " + commandNames[command] + ":" + error);
                }
                console.log('dfuse error, retrying', error);

                await new Promise(function(resolve) {
                    setTimeout(function() {
                        resolve();
                    }, 1000);
                });
            }
        }
        let status;
        status = await this._dfu.poll_until(state => (state != DfuDeviceState.dfuDNBUSY));
        if (status.status != DfuDeviceStatus.OK) {
            throw new Error("Special DfuSe command failed");
        }
    };

    getSegment(memoryInfo, addr) {
        if (!memoryInfo || ! memoryInfo.segments) {
            throw new Error("No memory map information available");
        }

        for (let segment of memoryInfo.segments) {
            if (segment.start <= addr && addr < segment.end) {
                return segment;
            }
        }

        return null;
    };

    getSectorStart(memoryInfo, addr, segment) {
        if (typeof segment === 'undefined') {
            segment = this.getSegment(memoryInfo, addr);
        }

        if (!segment) {
            throw new Error(`Address ${addr.toString(16)} outside of memory map`);
        }

        const sectorIndex = Math.floor((addr - segment.start)/segment.sectorSize);
        return segment.start + sectorIndex * segment.sectorSize;
    };

    getSectorEnd(memoryInfo, addr, segment) {
        if (typeof segment === 'undefined') {
            segment = this.getSegment(memoryInfo, addr);
        }

        if (!segment) {
            throw new Error(`Address ${addr.toString(16)} outside of memory map`);
        }

        const sectorIndex = Math.floor((addr - segment.start)/segment.sectorSize);
        return segment.start + (sectorIndex + 1) * segment.sectorSize;
    };

    getFirstWritableSegment(memoryInfo) {
        if (!memoryInfo || ! memoryInfo.segments) {
            throw new Error('No memory map information available');
        }

        for (let segment of memoryInfo.segments) {
            if (segment.writable) {
                return segment;
            }
        }

        return null;
    };

    getMaxReadSize(memoryInfo, startAddr) {
        if (!memoryInfo || ! memoryInfo.segments) {
            throw new Error('No memory map information available');
        }

        let numBytes = 0;
        for (let segment of memoryInfo.segments) {
            if (segment.start <= startAddr && startAddr < segment.end) {
                // Found the first segment the read starts in
                if (segment.readable) {
                    numBytes += segment.end - startAddr;
                } else {
                    return 0;
                }
            } else if (segment.start == startAddr + numBytes) {
                // Include a contiguous segment
                if (segment.readable) {
                    numBytes += (segment.end - segment.start);
                } else {
                    break;
                }
            }
        }

        return numBytes;
    };

    // for internal and external flash, it will erase the whole page
    // for dct, it doesn't matter because its byte by byte
    // you can see if you parse memorylayout it doenst have pages

    async erase(memoryInfo, startAddr, length) {
        let segment = this.getSegment(memoryInfo, startAddr);
        let addr = this.getSectorStart(memoryInfo, startAddr, segment);
        const endAddr = this.getSectorEnd(memoryInfo, startAddr + length - 1);

        let bytesErased = 0;
        const bytesToErase = endAddr - addr;
        if (bytesToErase > 0) {
            console.log(bytesErased, bytesToErase, "erase");
        }

        while (addr < endAddr) {
            if (segment.end <= addr) {
                segment = this.getSegment(memoryInfo, addr);
            }
            if (!segment.erasable) {
                // Skip over the non-erasable section
                bytesErased = Math.min(bytesErased + segment.end - addr, bytesToErase);
                addr = segment.end;
                console.log(bytesErased, bytesToErase, "erase");
                continue;
            }
            const sectorIndex = Math.floor((addr - segment.start)/segment.sectorSize);
            const sectorAddr = segment.start + sectorIndex * segment.sectorSize;
            console.log(`Erasing ${segment.sectorSize}B at 0x${sectorAddr.toString(16)}`);
            await this.dfuseCommand(DfuseCommand.DFUSE_COMMAND_ERASE, sectorAddr, 4);
            addr = sectorAddr + segment.sectorSize;
            bytesErased += segment.sectorSize;
            console.log(bytesErased, bytesToErase, "erase");
        }
    };

    async do_download(memoryInfo, startAddr, xfer_size, data, options) {
        if (!memoryInfo || ! memoryInfo.segments) {
            throw new Error('No memory map available');
        }

        let startAddress = startAddr;
        if (isNaN(startAddress)) {
            startAddress = memoryInfo.segments[0].start;
            console.log("Using inferred start address 0x" + startAddress.toString(16));
        } else if (this.getSegment(memoryInfo, startAddress) === null) {
            console.log(`Start address 0x${startAddress.toString(16)} outside of memory map bounds`);
        }
        let expected_size = data.byteLength;

        if (!options.noErase) {
            console.log("Erasing DFU device memory");
            await this.erase(memoryInfo, startAddress, expected_size);
        }

        console.log("Copying binary data to DFU device startAddress=" + startAddress + " total_expected_size=" + expected_size);

        let bytes_sent = 0;
        let address = startAddress;
        while (bytes_sent < expected_size) {
            const bytes_left = expected_size - bytes_sent;
            const chunk_size = Math.min(bytes_left, xfer_size);

            let bytes_written = 0;
            let dfu_status;
            try {
                await this.dfuseCommand(DfuseCommand.DFUSE_COMMAND_SET_ADDRESS_POINTER, address, 4);
                console.log(`Set address to 0x${address.toString(16)}`);
                bytes_written = await this._dfu._sendDnloadRequest(data.slice(bytes_sent, bytes_sent+chunk_size), 2);
                dfu_status = await this._dfu.poll_until_idle(DfuDeviceState.dfuDNLOAD_SYNC);
                console.log("Sent " + bytes_written + " bytes");
                dfu_status = await this._dfu._goIntoDfuIdleOrDfuDnloadIdle();
                address += chunk_size;
            } catch (error) {
                throw new Error('Error during DfuSe download: ' + error);
            }

            if (dfu_status.status != DfuDeviceStatus.OK) {
                throw new Error(`DFU DOWNLOAD failed state=${dfu_status.state}, status=${dfu_status.status}`);
            }

            console.log("Wrote " + bytes_written + " bytes");
            bytes_sent += bytes_written;

            console.log(bytes_sent, expected_size, "program");
        }
        console.log(`Wrote ${bytes_sent} bytes`);

        if (options.doManifestation) {
            console.log("Manifesting new firmware");
            await this._dfu._goIntoDfuIdleOrDfuDnloadIdle();
            try {
                await this.dfuseCommand(DfuseCommand.DFUSE_COMMAND_SET_ADDRESS_POINTER, startAddress, 4);
                await this._dfu.leave();
            } catch (error) {
                throw new Error('Error during Dfu manifestation: ' + error);
            }
        }
    }

    // async do_upload(memoryInfo, startAddr, xfer_size, max_size) {
    //     let startAddress = startAddr;
    //     if (isNaN(startAddress)) {
    //         startAddress = memoryInfo.segments[0].start;
    //         console.log("Using inferred start address 0x" + startAddress.toString(16));
    //     } else if (this.getSegment(memoryInfo, startAddress) === null) {
    //         console.log(`Start address 0x${startAddress.toString(16)} outside of memory map bounds`);
    //     }
    //
    //     console.log(`Reading up to 0x${max_size.toString(16)} bytes starting at 0x${startAddress.toString(16)}`);
    //     let state = await this.getState();
    //     if (state != DfuDeviceState.dfuIDLE) {
    //         await this.abortToIdle();
    //     }
    //     await this.dfuseCommand(DfuseCommand.DFUSE_COMMAND_SET_ADDRESS_POINTER, startAddress, 4);
    //     await this.abortToIdle();
    //
    //     // DfuSe encodes the read address based on the transfer size,
    //     // the block number - 2, and the SET_ADDRESS pointer.
    //     return await dfu.Device.prototype.do_upload.call(this, xfer_size, max_size, 2);
    // }
};

module.exports = {
    DfuDeviceNew
};
