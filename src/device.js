import { DeviceBase } from './device-base';
import { RequestType } from './request-type';
import { RequestResult, messageForResultCode } from './request-result';
import { fromProtobufEnum } from './protobuf-util';
import { RequestError, NotFoundError, TimeoutError } from './error';
import { globalOptions } from './config';

import proto from './protocol';

/**
 * Firmware module types.
 */
export const FirmwareModule = fromProtobufEnum(proto.FirmwareModuleType, {
  BOOTLOADER: 'BOOTLOADER',
  SYSTEM_PART: 'SYSTEM_PART',
  USER_PART: 'USER_PART',
  MONO_FIRMWARE: 'MONO_FIRMWARE'
});

/**
 * Device modes.
 */
export const DeviceMode = fromProtobufEnum(proto.DeviceMode, {
  NORMAL: 'NORMAL_MODE',
  LISTENING: 'LISTENING_MODE'
});

// Helper class used by Device.timeout()
class RequestSender {
  constructor(dev, timeout) {
    this._dev = dev;
    this._timeoutTime = Date.now() + timeout;
  }

  async sendRequest(type, msg, opts) {
    if (!opts || !opts.timeout) {
      const t = this._timeoutTime - Date.now();
      if (t <= 0) {
        throw new TimeoutError();
      }
      opts = Object.assign({}, opts, { timeout: t });
    } else if (Date.now() + opts.timeout >= this._timeoutTime) {
      throw new TimeoutError();
    }
    return this._dev.sendRequest(type, msg, opts);
  }

  async delay(ms) {
    if (Date.now() + ms >= this._timeoutTime) {
      throw new TimeoutError();
    }
    return new Promise((resolve, reject) => {
      setTimeout(() => resolve(), ms);
    });
  }
}

/**
 * Basic functionality supported by all Particle devices.
 */
export class Device extends DeviceBase {
  /**
   * Perform the system reset.
   *
   * @return {Promise}
   */
  reset() {
    return this.sendRequest(RequestType.RESET);
  }

  /**
   * Perform the factory reset.
   *
   * @return {Promise}
   */
  factoryReset() {
    return this.sendRequest(RequestType.FACTORY_RESET);
  }

  /**
   * Reset and enter the DFU mode.
   *
   * @return {Promise}
   */
  enterDfuMode() {
    return this.sendRequest(RequestType.DFU_MODE);
  }

  /**
   * Reset and enter the safe mode.
   *
   * @return {Promise}
   */
  enterSafeMode() {
    return this.sendRequest(RequestType.SAFE_MODE);
  }

  /**
   * Enter the listening mode.
   *
   * @return {Promise}
   */
  async enterListeningMode() {
    return this.timeout(async (s) => {
      await s.sendRequest(RequestType.START_LISTENING);
      // Wait until the device enters the listening mode
      while (true) {
        const r = await s.sendRequest(RequestType.GET_DEVICE_MODE, null, {
          dontThrow: true // This request may not be supported by the device
        });
        if (r.result != RequestResult.OK || r.mode == proto.DeviceMode.LISTENING_MODE) {
          break;
        }
        await s.delay(500);
      }
    });
  }

  /**
   * Leave the listening mode.
   *
   * @return {Promise}
   */
  leaveListeningMode() {
    return this.timeout(async (s) => {
      await s.sendRequest(RequestType.STOP_LISTENING);
      // Wait until the device leaves the listening mode
      while (true) {
        const r = await s.sendRequest(RequestType.GET_DEVICE_MODE, null, {
          dontThrow: true // This request may not be supported by the device
        });
        if (r.result != RequestResult.OK || r.mode != proto.DeviceMode.LISTENING_MODE) {
          break;
        }
        await s.delay(500);
      }
    });
  }

  /**
   * Get device mode.
   */
  async getDeviceMode() {
    const r = await this.sendRequest(RequestType.GET_DEVICE_MODE);
    return DeviceMode.fromProtobuf(r.mode);
  }

  /**
   * Start the Nyan LED indication.
   *
   * @return {Promise}
   */
  startNyanSignal() {
    return this.sendRequest(RequestType.START_NYAN_SIGNAL);
  }

  /**
   * Stop the Nyan LED indication.
   *
   * @return {Promise}
   */
  stopNyanSignal() {
    return this.sendRequest(RequestType.STOP_NYAN_SIGNAL);
  }

  /**
   * Perform the firmware update.
   *
   * @param {Buffer} data Firmware data.
   * @return {Promise}
   */
  updateFirmware(data) {
    return this.sendRequest(RequestType.START_FIRMWARE_UPDATE, {
      size: data.length
    }).then(rep => {
      let chunkSize = rep.chunkSize;
      let chunkOffs = 0;
      const writeChunk = () => {
        if (chunkOffs + chunkSize > data.length) {
          chunkSize = data.length - chunkOffs;
        }
        if (chunkSize == 0) {
          return Promise.resolve();
        }
        return this.sendRequest(RequestType.FIRMWARE_UPDATE_DATA, {
          data: data.slice(chunkOffs, chunkOffs + chunkSize)
        }).then(() => {
          chunkOffs += chunkSize;
          return writeChunk();
        });
      };
      return writeChunk();
    }).then(() => {
      return this.sendRequest(RequestType.FINISH_FIRMWARE_UPDATE, {
        validateOnly: false
      });
    });
  }

  /**
   * Get firmware module data.
   *
   * @param {String} module Module type.
   * @param {Number} [index] Module index.
   * @return {Promise<Buffer>}
   */
  getFirmwareModule(module, index) {
    return this._getStorageInfo().then(storage => {
      const section = storage.modules.find(section => {
        return (section.moduleType == module && section.moduleIndex == index);
      });
      if (!section) {
        throw new NotFoundError();
      }
      // Get size of the firmware module
      return this._getSectionDataSize(section).then(size => {
        // Read firmware data
        return this._readSectionData(section, 0, size);
      });
    });
  }

  /**
   * Check if the device runs a modular firmware.
   *
   * @return {Promise<Boolean>}
   */
  hasModularFirmware() {
    return this._getStorageInfo().then(storage => storage.hasModularFirmware);
  }

  /**
   * Set factory firmware.
   *
   * @param {Buffer} data Firmware data.
   * @return {Promise}
   */
  setFactoryFirmware(data) {
    return this._getStorageInfo().then(storage => {
      if (!storage.factory) {
        throw new NotFoundError();
      }
      return this._writeSectionData(storage.factory, 0, data);
    });
  }

  /**
   * Get factory firmware.
   *
   * @return {Promise<Buffer>}
   */
  getFactoryFirmware() {
    return this._getStorageInfo().then(storage => {
      if (!storage.factory) {
        throw new NotFoundError();
      }
      // Get size of the firmware module
      return this._getSectionDataSize(storage.factory).then(size => {
        // Read firmware data
        return this._readSectionData(storage.factory, 0, size);
      });
    });
  }

  /**
   * Read configuration data.
   *
   * @param {Number} address Address.
   * @param {Number} size Data size.
   * @return {Promise<Buffer>}
   */
  readConfigData(address, size) {
    return this._getStorageInfo().then(storage => {
      if (!storage.config) {
        throw new NotFoundError();
      }
      return this._readSectionData(storage.config, address, size);
    });
  }

  /**
   * Write configuration data.
   *
   * @param {Number} address Address.
   * @param {Buffer} data Data.
   * @return {Promise}
   */
  writeConfigData(address, data) {
    return this._getStorageInfo().then(storage => {
      if (!storage.config) {
        throw new NotFoundError();
      }
      return this._writeSectionData(storage.config, address, data);
    });
  }

  /**
   * Get size of the configuration data.
   *
   * @return {Promise<Number>}
   */
  getConfigDataSize() {
    return this._getStorageInfo().then(storage => {
      if (!storage.config) {
        throw new NotFoundError();
      }
      return storage.config.size;
    });
  }

  /**
   * Read from EEPROM.
   *
   * @param {Number} address Address.
   * @param {Number} size Data size.
   * @return {Promise<Buffer>}
   */
  readEeprom(address, size) {
    return this._getStorageInfo().then(storage => {
      if (!storage.eeprom) {
        throw new NotFoundError();
      }
      return this._readSectionData(storage.eeprom, address, size);
    });
  }

  /**
   * Write to EEPROM.
   *
   * @param {Number} address Address.
   * @param {Buffer} data Data.
   * @return {Promise}
   */
  writeEeprom(address, data) {
    return this._getStorageInfo().then(storage => {
      if (!storage.eeprom) {
        throw new NotFoundError();
      }
      return this._writeSectionData(storage.eeprom, address, data);
    });
  }

  /**
   * Clear EEPROM.
   *
   * @return {Promise}
   */
  clearEeprom() {
    return this._getStorageInfo().then(storage => {
      if (!storage.eeprom) {
        throw new NotFoundError();
      }
      return this._clearSectionData(storage.eeprom);
    });
  }

  /**
   * Get size of the EEPROM.
   *
   * @return {Promise<Number>}
   */
  getEepromSize() {
    return this._getStorageInfo().then(storage => {
      if (!storage.eeprom) {
        throw new NotFoundError();
      }
      return storage.eeprom.size;
    });
  }

  // Sends a Protobuf-encoded request
  sendRequest(type, msg, opts) {
    let buf = null;
    if (msg && type.request) {
      const m = type.request.create(msg); // Protobuf message object
      buf = type.request.encode(m).finish();
    }
    return this.sendControlRequest(type.id, buf, opts).then(rep => {
      let r = undefined;
      if (opts && opts.dontThrow) {
        r = { result: rep.result };
      } else if (rep.result != RequestResult.OK) {
        throw new RequestError(rep.result, messageForResultCode(rep.result));
      }
      if (type.reply) {
        if (rep.data) {
          r = Object.assign({}, r, type.reply.decode(rep.data));
        } else {
          // Return a message with default-initialized properties
          r = Object.assign({}, r, type.reply.create());
        }
      }
      return r;
    });
  }

  // This method is used to send multiple requests to the device. The overall execution time can be
  // limited via the `ms` argument (optional)
  async timeout(ms, fn) {
    if (typeof ms == 'function') {
      fn = ms;
      ms = globalOptions.requestTimeout; // Default timeout
    }
    const s = new RequestSender(this, ms);
    return fn(s);
  }

  _readSectionData(section, offset, size) {
    const data = Buffer.alloc(size);
    let chunkSize = 4096;
    let chunkOffs = 0;
    const readChunk = () => {
      if (chunkOffs + chunkSize > size) {
        chunkSize = size - chunkOffs;
      }
      if (chunkSize == 0) {
        return Promise.resolve(data);
      }
      return this.sendRequest(RequestType.READ_SECTION_DATA, {
        storage: section.storageIndex,
        section: section.sectionIndex,
        offset: offset + chunkOffs,
        size: chunkSize
      }).then(rep => {
        rep.data.copy(data, chunkOffs);
        chunkOffs += chunkSize;
        return readChunk();
      });
    };
    return readChunk();
  }

  _writeSectionData(section, offset, data) {
    return Promise.resolve().then(() => {
      if (section.needClear) {
        return this._clearSectionData(section);
      }
    }).then(() => {
      let chunkSize = 4096;
      let chunkOffs = 0;
      const writeChunk = () => {
        if (chunkOffs + chunkSize > data.length) {
          chunkSize = data.length - chunkOffs;
        }
        if (chunkSize == 0) {
          return Promise.resolve();
        }
        return this.sendRequest(RequestType.WRITE_SECTION_DATA, {
          storage: section.storageIndex,
          section: section.sectionIndex,
          offset: offset + chunkOffs,
          data: data.slice(chunkOffs, chunkOffs + chunkSize)
        }).then(() => {
          chunkOffs += chunkSize;
          return writeChunk();
        });
      };
      return writeChunk();
    });
  }

  _clearSectionData(section) {
    return this.sendRequest(RequestType.CLEAR_SECTION_DATA, {
      storage: section.storageIndex,
      section: section.sectionIndex
    });
  }

  _getSectionDataSize(section) {
    return this.sendRequest(RequestType.GET_SECTION_DATA_SIZE, {
      storage: section.storageIndex,
      section: section.sectionIndex
    }).then(rep => rep.size);
  }

  _getStorageInfo() {
    // Check if there's a cached storage info
    if (this._storageInfo) {
      return Promise.resolve(this._storageInfo);
    }
    // Request storage info from the device
    return this.sendRequest(RequestType.DESCRIBE_STORAGE).then(rep => {
      const storage = {
        modules: [],
        factory: null,
        config: null,
        eeprom: null,
        hasModularFirmware: true
      };
      for (let storageIndex = 0; storageIndex < rep.storage.length; ++storageIndex) {
        const pbStorage = rep.storage[storageIndex];
        for (let sectionIndex = 0; sectionIndex < pbStorage.sections.length; ++sectionIndex) {
          const pbSection = pbStorage.sections[sectionIndex];
          const section = {
            storageIndex: storageIndex,
            sectionIndex: sectionIndex,
            size: pbSection.size,
            needClear: !!(pbSection.flags & proto.SectionFlag.NEED_CLEAR)
          };
          switch (pbSection.type) {
            // Firmware module
            case proto.SectionType.FIRMWARE: {
              const pbFirmwareModule = pbSection.firmwareModule;
              if (pbFirmwareModule.type == proto.FirmwareModuleType.MONO_FIRMWARE) {
                storage.hasModularFirmware = false;
              }
              section.moduleType = FirmwareModule.fromProtobuf(pbFirmwareModule.type);
              if (pbFirmwareModule.index) {
                section.moduleIndex = pbFirmwareModule.index;
              }
              storage.modules.push(section);
              break;
            }
            // Factory firmware
            case proto.SectionType.FACTORY_BACKUP: {
              storage.factory = section;
              break;
            }
            // Device configuration
            case proto.SectionType.CONFIG: {
              storage.config = section;
              break;
            }
            // EEPROM
            case proto.SectionType.EEPROM: {
              storage.eeprom = section;
              break;
            }
          }
        }
      }
      this._storageInfo = storage;
      this.once('closed', () => {
        this._storageInfo = null;
      });
      return this._storageInfo;
    });
  }
}
