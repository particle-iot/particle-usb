let usb = require('particle-usb')

let devices = getDevices()
  .then(devices => {
    console.log('Listing detected Particle device data:')
    for (let device of devices) {
      console.log(device.type, JSON.stringify(device, 0,1))
    }
    return devices
  })
  .then((devices) => {
    dfuMode(devices)
  })
  .catch(err => {
    console.error(`Error putting device in DFU mode: ${err}`)
  })

async function getDevices() {
  return await usb.getDevices() 
}

async function dfuMode(devices) {
  const device = devices[0]
  if (device._info.dfu) {
    console.log('First device already in DFU mode.')
  } else {
    console.log('Putting first device into DFU mode...')
    await device.open()
    device.enterDfuMode()
    await device.close();
  }
}

