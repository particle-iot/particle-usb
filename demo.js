// The following demonstrates high level and low api equivilence

async function main() {
    const particleUSB = require('./src/particle-usb');
    const devices = await particleUSB.getDevices();
    const device = devices[0];
    await device.open();
    const serialNumberHighLevelAPI = await device.getSerialNumber();
    console.log('serialNumberHighLevelAPI', serialNumberHighLevelAPI);

    const serialNumberLowLevelAPI = await device.sendProtobufRequest(
        'SERIAL_NUMBER',
        null,
        {timeout: 7000}
    )
    console.log('serialNumberLowLevelAPI', serialNumberLowLevelAPI.serial);

    await device.close();
}

main();
