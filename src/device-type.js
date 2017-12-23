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

/**
 * Server protocol types.
 */
export const ServerProtocol = {
  TCP: 'TCP',
  UDP: 'UDP'
};

// Descriptions of the devices supported by the library
export const DEVICES = {
  [DeviceType.CORE]: {
    serverProtocol: ServerProtocol.TCP,
    usbVendorId: 0x1d50,
    usbProductId: 0x607d,
    dfu: {
      usbVendorId: 0x1d50,
      usbProductId: 0x607f
    }
  },
  [DeviceType.PHOTON]: {
    serverProtocol: ServerProtocol.TCP,
    usbVendorId: 0x2b04,
    usbProductId: 0xc006,
    dfu: {
      usbVendorId: 0x2b04,
      usbProductId: 0xd006
    }
  },
  [DeviceType.P1]: {
    serverProtocol: ServerProtocol.TCP,
    usbVendorId: 0x2b04,
    usbProductId: 0xc008,
    dfu: {
      usbVendorId: 0x2b04,
      usbProductId: 0xd008
    }
  },
  [DeviceType.ELECTRON]: {
    serverProtocol: [ServerProtocol.UDP, ServerProtocol.TCP],
    usbVendorId: 0x2b04,
    usbProductId: 0xc00a,
    dfu: {
      usbVendorId: 0x2b04,
      usbProductId: 0xd00a
    }
  },
  [DeviceType.DUO]: {
    serverProtocol: ServerProtocol.TCP,
    usbVendorId: 0x2b04,
    usbProductId: 0xc058,
    dfu: {
      usbVendorId: 0x2b04,
      usbProductId: 0xd058
    }
  }
};
