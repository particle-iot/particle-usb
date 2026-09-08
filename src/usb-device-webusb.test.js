'use strict';
const { sinon, expect } = require('../test/support');
const { getUsbDevices } = require('./usb-device-webusb');
const { UsbError } = require('./error');

const getPermittedDevices = (filters) => getUsbDevices(filters, { prompt: false });

const PHOTON = { vendorId: 0x2b04, productId: 0xc006, serialNumber: '111111111111111111111111' };
const PHOTON_DFU = { vendorId: 0x2b04, productId: 0xd006, serialNumber: '111111111111111111111111' };
const ARGON = { vendorId: 0x2b04, productId: 0xc00c, serialNumber: '222222222222222222222222' };

describe('usb-device-webusb', () => {
	let usb;

	beforeEach(() => {
		// Fake the subset of the WebUSB API used by the backend
		usb = {
			getDevices: sinon.stub().resolves([]),
			requestDevice: sinon.stub().rejects(Object.assign(new Error('No device selected'), { name: 'NotFoundError' }))
		};
		// Node defines navigator as a getter, so it can't be assigned to directly
		sinon.stub(global, 'navigator').get(() => ({ usb }));
	});

	afterEach(() => {
		sinon.restore();
	});

	describe('getUsbDevices() with prompt: false', () => {
		it('returns a permitted device that is currently attached', async () => {
			usb.getDevices.resolves([PHOTON, ARGON]);
			const devs = await getPermittedDevices([{ ...PHOTON }, { ...PHOTON_DFU }]);
			expect(devs).to.have.lengthOf(1);
			expect(devs[0].internalObject).to.equal(PHOTON);
		});

		it('returns an empty list when a permitted device is not attached', async () => {
			// The user granted access to the Photon earlier, but only the Argon is attached now
			usb.getDevices.resolves([ARGON]);
			const devs = await getPermittedDevices([{ ...PHOTON }, { ...PHOTON_DFU }]);
			expect(devs).to.be.empty;
		});

		it('returns an empty list when no device has been permitted', async () => {
			usb.getDevices.resolves([]);
			const devs = await getPermittedDevices([{ ...PHOTON }]);
			expect(devs).to.be.empty;
		});

		it('never prompts the user', async () => {
			usb.getDevices.resolves([]);
			await getPermittedDevices([{ ...PHOTON }]);
			await getPermittedDevices();
			expect(usb.requestDevice).to.have.not.been.called;
		});

		it('returns all permitted devices when no filters are specified', async () => {
			usb.getDevices.resolves([PHOTON, ARGON]);
			const devs = await getPermittedDevices();
			expect(devs).to.have.lengthOf(2);
		});

		it('matches on vendor ID, product ID and serial number', async () => {
			usb.getDevices.resolves([PHOTON, PHOTON_DFU, ARGON]);
			const byVendor = await getPermittedDevices([{ vendorId: PHOTON.vendorId }]);
			expect(byVendor).to.have.lengthOf(3);
			const byProduct = await getPermittedDevices([{ vendorId: PHOTON.vendorId, productId: PHOTON_DFU.productId }]);
			expect(byProduct.map(d => d.internalObject)).to.deep.equal([PHOTON_DFU]);
			const bySerial = await getPermittedDevices([{ serialNumber: ARGON.serialNumber }]);
			expect(bySerial.map(d => d.internalObject)).to.deep.equal([ARGON]);
		});

		it('fails if a filter specifies a product ID without a vendor ID', async () => {
			await expect(getPermittedDevices([{ productId: PHOTON.productId }])).to.be.rejectedWith(RangeError);
			expect(usb.getDevices).to.have.not.been.called;
		});

		it('wraps enumeration errors into a UsbError', async () => {
			usb.getDevices.rejects(new Error('Nope'));
			await expect(getPermittedDevices()).to.be.rejectedWith(UsbError);
		});
	});

	describe('getUsbDevices()', () => {
		it('prompts the user even when a matching device is already permitted', async () => {
			usb.getDevices.resolves([PHOTON]);
			const devs = await getUsbDevices([{ ...PHOTON }]);
			expect(usb.requestDevice).to.have.been.calledOnce;
			expect(devs).to.have.lengthOf(1);
		});

		it('includes the device the user selected', async () => {
			usb.requestDevice.resolves(ARGON);
			// Selecting a device in the prompt adds it to the permitted devices
			usb.getDevices.resolves([PHOTON, ARGON]);
			const devs = await getUsbDevices([{ vendorId: PHOTON.vendorId }]);
			expect(devs.map(d => d.internalObject)).to.deep.equal([PHOTON, ARGON]);
		});

		it('does not list the selected device twice', async () => {
			usb.getDevices.resolves([PHOTON]);
			usb.requestDevice.resolves(PHOTON);
			const devs = await getUsbDevices([{ vendorId: PHOTON.vendorId }]);
			expect(devs.map(d => d.internalObject)).to.deep.equal([PHOTON]);
		});

		it('ignores a cancelled prompt', async () => {
			usb.getDevices.resolves([PHOTON]);
			const devs = await getUsbDevices([{ vendorId: PHOTON.vendorId }]);
			expect(devs.map(d => d.internalObject)).to.deep.equal([PHOTON]);
		});
	});
});
