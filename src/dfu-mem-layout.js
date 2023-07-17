const { Dfu } = require('./dfu');
// memory layout of the USB device
// get the addresses needed for different dfu functionalities like download, read, write

const DFUSE_READABLE  = 1;
const DFUSE_ERASABLE  = 2;
const DFUSE_WRITEABLE = 4;


/**
 * DFU with ST Microsystems extensions.
 *
 * AN3156: USB DFU protocol used in the STM32 bootloader.
 */
const DfuseCommand = {
    DFUSE_COMMAND_NONE: 0xff,
    DFUSE_COMMAND_GET_COMMAND: 0x00,
    DFUSE_COMMAND_SET_ADDRESS_POINTER: 0x21,
    DFUSE_COMMAND_ERASE: 0x41,
    DFUSE_COMMAND_READ_UNPROTECT: 0x92
};
class MemSegment {
  constructor(start, end, pageSize, memType, next) {
    this.start = start;
    this.end = end;
    this.pageSize = pageSize;
    this.memType = memType;
    this.next = next;
  }
}

const DfuDevice = (base) => class extends base {
  // constructor(dev) {
	// 	this._dev = dev;
	// 	this._dev.timeout = 5000; // Use longer timeout for control transfers
	// 	this._transferSize = 0;
	// 	if (!this._dev.particle) {
	// 		this._dev.particle = {
	// 			isOpen: false,
	// 			serialNumber: null
	// 		};
	// 	}
	// 	this._quirks = {};
	// }

  parseMemoryLayoutDesc(desc) {
    const nameEndIndex = desc.indexOf("/");
    if (!desc.startsWith("@") || nameEndIndex == -1) {
        throw `Not a DfuSe memory descriptor: "${desc}"`;
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

  verifyBinary(memoryInfo, addr) {
      if (!memoryInfo || !memoryInfo.segments) {
          throw "No memory map information available";
      }

      for (const segment of memoryInfo.segments) {
          // TODO: should we put end address here for segment.end?
          if (!(segment.start <= addr && addr < segment.end)) {
              return false;
          }
      }
      return true;
  }

  getSegment(memoryInfo, addr) {
      if (!memoryInfo || ! memoryInfo.segments) {
          throw "No memory map information available";
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
        throw `Address ${addr.toString(16)} outside of memory map`;
    }

    const sectorIndex = Math.floor((addr - segment.start)/segment.sectorSize);
    return segment.start + sectorIndex * segment.sectorSize;
};

    getSectorEnd(memoryInfo, addr) {
        const segment = this.getSegment(memoryInfo, addr);
        // if (typeof segment === 'undefined') {
        //     segment = this.getSegment(memoryInfo, addr);
        // }

        if (!segment) {
            throw `Address ${addr.toString(16)} outside of memory map`;
        }

        const sectorIndex = Math.floor((addr - segment.start)/segment.sectorSize);
        return segment.start + (sectorIndex + 1) * segment.sectorSize;
    };

    getFirstWritableSegment(memoryInfo) {
        if (!memoryInfo || ! memoryInfo.segments) {
            throw "No memory map information available";
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
            throw "No memory map information available";
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

    async poll_until(state_predicate) {
        let dfu_status = await this.getStatus();

        let device = this;
        function async_sleep(duration_ms) {
            return new Promise(function(resolve, reject) {
                device.logDebug("Sleeping for " + duration_ms + "ms");
                setTimeout(resolve, duration_ms);
            });
        }

        while (!state_predicate(dfu_status.state) && dfu_status.state != dfu.dfuERROR) {
            await async_sleep(dfu_status.pollTimeout);
            dfu_status = await this.getStatus();
        }

        return dfu_status;
    }

    async poll_until_idle(idle_state) {
        return this.poll_until(state => (state == idle_state));
    }

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
            // await this.dfuseCommand(dfuse.ERASE_SECTOR, sectorAddr, 4);

            // build a req packet
            const req = {};
            req.data = Buffer.alloc(5);
            req.data[0] = DfuseCommand.DFUSE_COMMAND_ERASE;
            req.data[1] = addr & 0xff;
            req.data[2] = (addr >> 8) & 0xff;
            req.data[3] = (addr >> 16) & 0xff;
            req.data[4] = (addr >> 24) & 0xff;

            // await this._dfu.claimInterfaceImpl(0);
            await this._dfu._sendEraseReq(req);
            // await this._dfu.relInterfaceImpl(0);

            addr = sectorAddr + segment.sectorSize;
            bytesErased += segment.sectorSize;
            console.log(bytesErased, bytesToErase, "erase");
        }
  }
  async downloadBinary(memoryInfo, startAddress, fileBuffer) {
      let xfer_size = fileBuffer.length;
      let data = fileBuffer;
      let bytes_sent = 0;
      let address = startAddress;
      while (bytes_sent < expected_size) {
          const bytes_left = expected_size - bytes_sent;
          const chunk_size = Math.min(bytes_left, xfer_size);

          let bytes_written = 0;
          let dfu_status;
          try {
              const req = {};
              req.data = Buffer.alloc(5);
              req.data[0] = DfuseCommand.DFUSE_COMMAND_SET_ADDRESS_POINTER;
              req.data[1] = addr & 0xff;
              req.data[2] = (addr >> 8) & 0xff;
              req.data[3] = (addr >> 16) & 0xff;
              req.data[4] = (addr >> 24) & 0xff;
              // await this._dfu._sendDnloadRequest(req);
              console.log(`Set address to 0x${address.toString(16)}`);
              bytes_written = await this.downloadImpl(data.slice(bytes_sent, bytes_sent+chunk_size), 2);
              console.log("Sent " + bytes_written + " bytes");
              dfu_status = await this.poll_until_idle(dfu.dfuDNLOAD_IDLE);
              address += chunk_size;
          } catch (error) {
              throw "Error during DfuSe download: " + error;
          }

          if (dfu_status.status != dfu.STATUS_OK) {
              throw `DFU DOWNLOAD failed state=${dfu_status.state}, status=${dfu_status.status}`;
          }

          this.logDebug("Wrote " + bytes_written + " bytes");
          bytes_sent += bytes_written;

          this.logProgress(bytes_sent, expected_size, "program");
      }
      this.logInfo(`Wrote ${bytes_sent} bytes`);

      if (options.doManifestation) {
          this.logInfo("Manifesting new firmware");
          try {
              await this.dfuseCommand(dfuse.SET_ADDRESS, startAddress, 4);
              await this.download(new ArrayBuffer(), 0);
          } catch (error) {
              throw "Error during DfuSe manifestation: " + error;
          }

          try {
              await this.poll_until(state => (state == dfu.dfuMANIFEST));
          } catch (error) {
              this.logError(error);
          }
      }
  }
}

// // export this class
// module.exports = {
//   MemSegment,
//   parseMemoryLayout
// }
module.exports = {
	DfuDevice
};