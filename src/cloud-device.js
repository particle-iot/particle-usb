const { Request } = require('./request');
const { fromProtobufEnum } = require('./protobuf-util');
const usbProto = require('./usb-protocol');
const { globalOptions } = require('./config');
const { definitions: proto } = require('@particle/device-os-protobuf');

/**
 * Cloud connection status.
 *
 * @enum {String}
 */
const CloudConnectionStatus = fromProtobufEnum(proto.cloud.ConnectionStatus, {
	/** Disconnected. */
	DISCONNECTED: 'DISCONNECTED',
	/** Connecting. */
	CONNECTING: 'CONNECTING',
	/** Connected. */
	CONNECTED: 'CONNECTED',
	/** Disconnecting. */
	DISCONNECTING: 'DISCONNECTING'
});

/**
 * Server protocol types.
 *
 * @enum {String}
 */
const ServerProtocol = fromProtobufEnum(proto.ServerProtocolType, {
	/** TCP. */
	TCP: 'TCP_PROTOCOL',
	/** UDP. */
	UDP: 'UDP_PROTOCOL'
});

/**
 * Cloud-enabled device.
 *
 * This class is not meant to be instantiated directly. Use {@link getDevices} and
 * {@link openDeviceById} to create device instances.
 *
 * @mixin
 */
const CloudDevice = base => class extends base {
	/**
	 * Connect to the cloud.
	 *
	 * Supported platforms:
	 * - Gen 3 (since Device OS 0.9.0)
	 * - Gen 2 (since Device OS 1.1.0)
	 *
	 * @param {Object} [options] Options.
	 * @param {Boolean} [options.dontWait] Do wait for the device to actually connect to the cloud and
	 *        return immediately.
	 * @param {Number} [options.timeout] Timeout (milliseconds).
	 * @return {Promise}
	 */
	async connectToCloud({ dontWait = false, timeout = globalOptions.requestTimeout } = {}) {
		await this.timeout(timeout, async (s) => {
			await s.sendRequest(Request.CLOUD_CONNECT);
			if (!dontWait) {
				for (;;) {
					const r = await s.sendRequest(Request.CLOUD_STATUS);
					if (r.status === proto.cloud.ConnectionStatus.CONNECTED) {
						break;
					}
					await s.delay(500);
				}
			}
		});
	}

	/**
	 * Disconnect from the cloud.
	 *
	 * Supported platforms:
	 * - Gen 3 (since Device OS 0.9.0)
	 * - Gen 2 (since Device OS 1.1.0)
	 *
	 * The `force` option is supported since Device OS 2.0.0.
	 *
	 * @param {Object} [options] Options.
	 * @param {Boolean} [options.dontWait] Do wait for the device to actually disconnect from the cloud
	 *        and return immediately.
	 * @param {Boolean} [options.force] Disconnect immediately, even if the device is busy performing
	 *        some operation with the cloud.
	 * @param {Number} [options.timeout] Timeout (milliseconds).
	 * @return {Promise}
	 */
	async disconnectFromCloud({ dontWait = false, force = false, timeout = globalOptions.requestTimeout } = {}) {
		if (force) {
			const setup = {
				bmRequestType: usbProto.BmRequestType.HOST_TO_DEVICE,
				bRequest: usbProto.PARTICLE_BREQUEST,
				wIndex: Request.CLOUD_DISCONNECT.id,
				wValue: 0
			};
			await this.usbDevice.transferOut(setup);
			if (dontWait) {
				return;
			}
		}
		await this.timeout(timeout, async (s) => {
			if (!force) {
				await s.sendRequest(Request.CLOUD_DISCONNECT);
			}
			if (!dontWait) {
				for (;;) {
					const r = await s.sendRequest(Request.CLOUD_STATUS);
					if (r.status === proto.cloud.ConnectionStatus.DISCONNECTED) {
						break;
					}
					await s.delay(500);
				}
			}
		});
	}

	/**
	 * Get the cloud connection status.
	 *
	 * Supported platforms:
	 * - Gen 3 (since Device OS 0.9.0)
	 * - Gen 2 (since Device OS 1.1.0)
	 *
	 * @param {Object} [options] Options.
	 * @param {Number} [options.timeout] Timeout (milliseconds).
	 * @return {Promise<CloudConnectionStatus>}
	 */
	async getCloudConnectionStatus({ timeout = globalOptions.requestTimeout } = {}) {
		const r = await this.sendRequest(Request.CLOUD_STATUS, null /* msg */, { timeout });
		return CloudConnectionStatus.fromProtobuf(r.status);
	}

	/**
	 * Set the claim code.
	 *
	 * Supported platforms:
	 * - Gen 3 (since Device OS 0.9.0)
	 * - Gen 2 (since Device OS 0.8.0)
	 *
	 * @param {String} code Claim code.
	 * @param {Object} [options] Options.
	 * @param {Number} [options.timeout] Timeout (milliseconds).
	 * @return {Promise}
	 */
	setClaimCode(code, { timeout = globalOptions.requestTimeout } = {}) {
		return this.sendRequest(Request.SET_CLAIM_CODE, { code }, { timeout });
	}

	/**
	 * Check if the device is claimed.
	 *
	 * Supported platforms:
	 * - Gen 3 (since Device OS 0.9.0)
	 * - Gen 2 (since Device OS 0.8.0)
	 *
	 * @param {Object} [options] Options.
	 * @param {Number} [options.timeout] Timeout (milliseconds).
	 * @return {Promise<Boolean>}
	 */
	isClaimed({ timeout = globalOptions.requestTimeout } = {}) {
		return this.sendRequest(Request.IS_CLAIMED, null /* msg */, { timeout }).then(rep => rep.claimed);
	}

	/**
	 * Set the device private key.
	 *
	 * @deprecated This method is not guaranteed to work with recent versions of Device OS and it will
	 *             be removed in future versions of this library.
	 *
	 * Supported platforms:
	 * - Gen 2 (since Device OS 0.8.0, deprecated in 2.0.0)
	 *
	 * @param {Buffer} data Key data.
	 * @param {String} [protocol] Server protocol.
	 * @return {Promise}
	 */
	setDevicePrivateKey(data, protocol) {
		return this._getServerProtocol(protocol).then(protocol => {
			const keyType = (protocol === proto.ServerProtocolType.UDP_PROTOCOL ?
				proto.SecurityKeyType.UDP_DEVICE_PRIVATE_KEY : proto.SecurityKeyType.TCP_DEVICE_PRIVATE_KEY);
			return this._setSecurityKey(keyType, data);
		});
	}

	/**
	 * Get the device private key.
	 *
	 * @deprecated This method is not guaranteed to work with recent versions of Device OS and it will
	 *             be removed in future versions of this library.
	 *
	 * Supported platforms:
	 * - Gen 2 (since Device OS 0.8.0, deprecated in 2.0.0)
	 *
	 * @param {String} [protocol] Server protocol.
	 * @return {Promise<Buffer>}
	 */
	getDevicePrivateKey(protocol) {
		return this._getServerProtocol(protocol).then(protocol => {
			const keyType = (protocol === proto.ServerProtocolType.UDP_PROTOCOL ?
				proto.SecurityKeyType.UDP_DEVICE_PRIVATE_KEY : proto.SecurityKeyType.TCP_DEVICE_PRIVATE_KEY);
			return this._getSecurityKey(keyType);
		});
	}

	/**
	 * Set the device public key.
	 *
	 * @deprecated This method is not guaranteed to work with recent versions of Device OS and it will
	 *             be removed in future versions of this library.
	 *
	 * Supported platforms:
	 * - Gen 2 (since Device OS 0.8.0, deprecated in 2.0.0)
	 *
	 * @param {Buffer} data Key data.
	 * @param {String} [protocol] Server protocol.
	 * @return {Promise}
	 */
	setDevicePublicKey(data, protocol) {
		return this._getServerProtocol(protocol).then(protocol => {
			const keyType = (protocol === proto.ServerProtocolType.UDP_PROTOCOL ?
				proto.SecurityKeyType.UDP_DEVICE_PUBLIC_KEY : proto.SecurityKeyType.TCP_DEVICE_PUBLIC_KEY);
			return this._setSecurityKey(keyType, data);
		});
	}

	/**
	 * Get the device public key.
	 *
	 * @deprecated This method is not guaranteed to work with recent versions of Device OS and it will
	 *             be removed in future versions of this library.
	 *
	 * Supported platforms:
	 * - Gen 2 (since Device OS 0.8.0, deprecated in 2.0.0)
	 *
	 * @param {String} [protocol] Server protocol.
	 * @return {Promise<Buffer>}
	 */
	getDevicePublicKey(data, protocol) {
		return this._getServerProtocol(protocol).then(protocol => {
			const keyType = (protocol === proto.ServerProtocolType.UDP_PROTOCOL ?
				proto.SecurityKeyType.UDP_DEVICE_PUBLIC_KEY : proto.SecurityKeyType.TCP_DEVICE_PUBLIC_KEY);
			return this._getSecurityKey(keyType);
		});
	}

	/**
	 * Set the server public key.
	 *
	 * @deprecated This method is not guaranteed to work with recent versions of Device OS and it will
	 *             be removed in future versions of this library.
	 *
	 * Supported platforms:
	 * - Gen 2 (since Device OS 0.8.0, deprecated in 2.0.0)
	 *
	 * @param {Buffer} data Key data.
	 * @param {String} [protocol] Server protocol.
	 * @return {Promise}
	 */
	setServerPublicKey(data, protocol) {
		return this._getServerProtocol(protocol).then(protocol => {
			const keyType = (protocol === proto.ServerProtocolType.UDP_PROTOCOL ?
				proto.SecurityKeyType.UDP_SERVER_PUBLIC_KEY : proto.SecurityKeyType.TCP_SERVER_PUBLIC_KEY);
			return this._setSecurityKey(keyType, data);
		});
	}

	/**
	 * Get the server public key.
	 *
	 * @deprecated This method is not guaranteed to work with recent versions of Device OS and it will
	 *             be removed in future versions of this library.
	 *
	 * Supported platforms:
	 * - Gen 2 (since Device OS 0.8.0, deprecated in 2.0.0)
	 *
	 * @param {String} [protocol] Server protocol.
	 * @return {Promise<Buffer>}
	 */
	getServerPublicKey(data, protocol) {
		return this._getServerProtocol(protocol).then(protocol => {
			const keyType = (protocol === proto.ServerProtocolType.UDP_PROTOCOL ?
				proto.SecurityKeyType.UDP_SERVER_PUBLIC_KEY : proto.SecurityKeyType.TCP_SERVER_PUBLIC_KEY);
			return this._getSecurityKey(keyType);
		});
	}

	/**
	 * Set the server address.
	 *
	 * @deprecated This method is not guaranteed to work with recent versions of Device OS and it will
	 *             be removed in future versions of this library.
	 *
	 * Supported platforms:
	 * - Gen 2 (since Device OS 0.8.0, deprecated in 2.0.0)
	 *
	 * @param {String} data Host address.
	 * @param {Number} port Port number.
	 * @param {String} [protocol] Server protocol.
	 * @return {Promise}
	 */
	setServerAddress(address, port, protocol) {
		return this._getServerProtocol(protocol).then(protocol => {
			return this.sendRequest(Request.SET_SERVER_ADDRESS, {
				protocol: protocol,
				address: address,
				port: port // TODO: Make port number optional
			});
		});
	}

	/**
	 * Get the server address.
	 *
	 * @deprecated This method is not guaranteed to work with recent versions of Device OS and it will
	 *             be removed in future versions of this library.
	 *
	 * Supported platforms:
	 * - Gen 2 (since Device OS 0.8.0, deprecated in 2.0.0)
	 *
	 * @param {String} [protocol] Server protocol.
	 * @return {Promise<Object>}
	 */
	getServerAddress(protocol) {
		return this._getServerProtocol(protocol).then(protocol => {
			return this.sendRequest(Request.GET_SERVER_ADDRESS, {
				protocol: protocol
			});
		});
	}

	/**
	 * Set the server protocol.
	 *
	 * @deprecated This method is not guaranteed to work with recent versions of Device OS and it will
	 *             be removed in future versions of this library.
	 *
	 * Supported platforms:
	 * - Gen 2 (since Device OS 0.8.0, deprecated in 2.0.0)
	 *
	 * @param {String} protocol Server protocol.
	 * @return {Promise}
	 */
	setServerProtocol(protocol) {
		return this.sendRequest(Request.SET_SERVER_PROTOCOL, {
			protocol: ServerProtocol.toProtobuf(protocol)
		});
	}

	/**
	 * Get the server protocol.
	 *
	 * @deprecated This method is not guaranteed to work with recent versions of Device OS and it will
	 *             be removed in future versions of this library.
	 *
	 * Supported platforms:
	 * - Gen 2 (since Device OS 0.8.0, deprecated in 2.0.0)
	 *
	 * @return {Promise<String>}
	 */
	getServerProtocol() {
		return this._getServerProtocol().then(protocol => ServerProtocol.fromProtobuf(protocol));
	}

	_setSecurityKey(type, data) {
		return this.sendRequest(Request.SET_SECURITY_KEY, { type: type, data: data });
	}

	_getSecurityKey(type) {
		return this.sendRequest(Request.GET_SECURITY_KEY, { type: type }).then(rep => rep.data);
	}

	_getServerProtocol(protocol) {
		if (protocol) {
			return Promise.resolve(ServerProtocol.toProtobuf(protocol));
		}
		return this.sendRequest(Request.GET_SERVER_PROTOCOL).then(rep => rep.protocol);
	}
};

module.exports = {
	CloudConnectionStatus,
	ServerProtocol,
	CloudDevice
};
