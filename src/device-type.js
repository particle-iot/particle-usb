/**
 * Device types.
 */
export const DeviceType = {
  CORE: 'Core',
  PHOTON: 'Photon',
  P1: 'P1',
  ELECTRON: 'Electron',
  DUO: 'Duo',
  XENON: 'Xenon',
  ARGON: 'Argon',
  BORON: 'Boron'
};

// Descriptions of all devices supported by the library
export const DEVICE_INFO = [
  {
    type: DeviceType.CORE,
    usbIds: {
      vendorId: 0x1d50,
      productId: 0x607d,
    },
    dfuUsbIds: {
      vendorId: 0x1d50,
      productId: 0x607f
    }
  },
  {
    type: DeviceType.PHOTON,
    usbIds: {
      vendorId: 0x2b04,
      productId: 0xc006,
    },
    dfuUsbIds: {
      vendorId: 0x2b04,
      productId: 0xd006
    }
  },
  {
    type: DeviceType.P1,
    usbIds: {
      vendorId: 0x2b04,
      productId: 0xc008,
    },
    dfuUsbIds: {
      vendorId: 0x2b04,
      productId: 0xd008
    }
  },
  {
    type: DeviceType.ELECTRON,
    usbIds: {
      vendorId: 0x2b04,
      productId: 0xc00a,
    },
    dfuUsbIds: {
      vendorId: 0x2b04,
      productId: 0xd00a
    }
  },
  {
    type: DeviceType.DUO,
    usbIds: {
      vendorId: 0x2b04,
      productId: 0xc058,
    },
    dfuUsbIds: {
      vendorId: 0x2b04,
      productId: 0xd058
    }
  },
  {
    type: DeviceType.XENON,
    usbIds: {
      vendorId: 0x2b04,
      productId: 0xc00e,
    },
    dfuUsbIds: {
      vendorId: 0x2b04,
      productId: 0xd00e
    }
  },
  {
    type: DeviceType.ARGON,
    usbIds: {
      vendorId: 0x2b04,
      productId: 0xc00c,
    },
    dfuUsbIds: {
      vendorId: 0x2b04,
      productId: 0xd00c
    }
  },
  {
    type: DeviceType.BORON,
    usbIds: {
      vendorId: 0x2b04,
      productId: 0xc00d,
    },
    dfuUsbIds: {
      vendorId: 0x2b04,
      productId: 0xd00d
    }
  }
];
