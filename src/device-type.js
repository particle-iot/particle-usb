/**
 * Device types.
 */
export const DeviceType = {
  CORE: 'Core',
  PHOTON: 'Photon',
  P1: 'P1',
  ELECTRON: 'Electron',
  DUO: 'Duo'
};

// Descriptions of the devices supported by the library
export const DEVICES = {
  [DeviceType.CORE]: {
    usb: {
      vendorId: 0x1d50,
      productId: 0x607d,
      dfu: {
        vendorId: 0x1d50,
        productId: 0x607f
      }
    }
  },
  [DeviceType.PHOTON]: {
    usb: {
      vendorId: 0x2b04,
      productId: 0xc006,
      dfu: {
        vendorId: 0x2b04,
        productId: 0xd006
      }
    }
  },
  [DeviceType.P1]: {
    usb: {
      vendorId: 0x2b04,
      productId: 0xc008,
      dfu: {
        vendorId: 0x2b04,
        productId: 0xd008
      }
    }
  },
  [DeviceType.ELECTRON]: {
    usb: {
      vendorId: 0x2b04,
      productId: 0xc00a,
      dfu: {
        vendorId: 0x2b04,
        productId: 0xd00a
      }
    }
  },
  [DeviceType.DUO]: {
    usb: {
      vendorId: 0x2b04,
      productId: 0xc058,
      dfu: {
        vendorId: 0x2b04,
        productId: 0xd058
      }
    }
  }
};
