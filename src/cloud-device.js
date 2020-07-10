import { Request } from './request';
import { fromProtobufEnum } from './protobuf-util';
import * as usbProto from './usb-protocol';
import { globalOptions } from './config';

import proto from './protocol';

/**
 * Cloud connection status.
 */
export const CloudConnectionStatus = fromProtobufEnum(proto.cloud.ConnectionStatus, {
	DISCONNECTED: 'DISCONNECTED',
	CONNECTING: 'CONNECTING',
	CONNECTED: 'CONNECTED',
	DISCONNECTING: 'DISCONNECTING'
});

/**
 * Server protocol types.
 */
export const ServerProtocol = fromProtobufEnum(proto.ServerProtocolType, {
	TCP: 'TCP_PROTOCOL',
	UDP: 'UDP_PROTOCOL'
});

/**
 * Mixin class for a cloud-enabled device.
 */
export const CloudDevice = base => class extends base {
	/**
	 * Connect to the cloud.
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
	 */
	async getCloudConnectionStatus({ timeout = globalOptions.requestTimeout } = {}) {
		const r = await this.sendRequest(Request.CLOUD_STATUS, null /* msg */, { timeout });
		return CloudConnectionStatus.fromProtobuf(r.status);
	}

	/**
	 * Set the claim code.
	 *
	 * @param {String} code Claim code.
	 * @return {Promise}
	 */
	setClaimCode(code, { timeout = globalOptions.requestTimeout } = {}) {
		return this.sendRequest(Request.SET_CLAIM_CODE, { code }, { timeout });
	}

	/**
	 * Check if the device is claimed.
	 *
	 * @return {Promise<Boolean>}
	 */
	isClaimed({ timeout = globalOptions.requestTimeout } = {}) {
		return this.sendRequest(Request.IS_CLAIMED, null /* msg */, { timeout }).then(rep => rep.claimed);
	}

	// TODO: The methods below are not supported in recent versions of Device OS. Remove them in particle-usb@2.0.0

	/**
	 * Set the device private key.
	 *
	 * @param {Buffer} data Key data.
	 * @param {String} [protocol] Server protocol.
	 * @return {Promise}
	 */
	setDevicePrivateKey(data, protocol) {
		return this._getServerProtocol(protocol).then(protocol => {
			const keyType = (protocol === proto.ServerProtocolType.UDP_PROTOCOL ? proto.SecurityKeyType.UDP_DEVICE_PRIVATE_KEY :
				proto.SecurityKeyType.TCP_DEVICE_PRIVATE_KEY);
			return this._setSecurityKey(keyType, data);
		});
	}

	/**
	 * Get the device private key.
	 *
	 * @param {String} [protocol] Server protocol.
	 * @return {Promise<Buffer>}
	 */
	getDevicePrivateKey(protocol) {
		return this._getServerProtocol(protocol).then(protocol => {
			const keyType = (protocol === proto.ServerProtocolType.UDP_PROTOCOL ? proto.SecurityKeyType.UDP_DEVICE_PRIVATE_KEY :
				proto.SecurityKeyType.TCP_DEVICE_PRIVATE_KEY);
			return this._getSecurityKey(keyType);
		});
	}

	/**
	 * Set the device public key.
	 *
	 * @param {Buffer} data Key data.
	 * @param {String} [protocol] Server protocol.
	 * @return {Promise}
	 */
	setDevicePublicKey(data, protocol) {
		return this._getServerProtocol(protocol).then(protocol => {
			const keyType = (protocol === proto.ServerProtocolType.UDP_PROTOCOL ? proto.SecurityKeyType.UDP_DEVICE_PUBLIC_KEY :
				proto.SecurityKeyType.TCP_DEVICE_PUBLIC_KEY);
			return this._setSecurityKey(keyType, data);
		});
	}

	/**
	 * Get the device public key.
	 *
	 * @param {String} [protocol] Server protocol.
	 * @return {Promise<Buffer>}
	 */
	getDevicePublicKey(data, protocol) {
		return this._getServerProtocol(protocol).then(protocol => {
			const keyType = (protocol === proto.ServerProtocolType.UDP_PROTOCOL ? proto.SecurityKeyType.UDP_DEVICE_PUBLIC_KEY :
				proto.SecurityKeyType.TCP_DEVICE_PUBLIC_KEY);
			return this._getSecurityKey(keyType);
		});
	}

	/**
	 * Set the server public key.
	 *
	 * @param {Buffer} data Key data.
	 * @param {String} [protocol] Server protocol.
	 * @return {Promise}
	 */
	setServerPublicKey(data, protocol) {
		return this._getServerProtocol(protocol).then(protocol => {
			const keyType = (protocol === proto.ServerProtocolType.UDP_PROTOCOL ? proto.SecurityKeyType.UDP_SERVER_PUBLIC_KEY :
				proto.SecurityKeyType.TCP_SERVER_PUBLIC_KEY);
			return this._setSecurityKey(keyType, data);
		});
	}

	/**
	 * Get the server public key.
	 *
	 * @param {String} [protocol] Server protocol.
	 * @return {Promise<Buffer>}
	 */
	getServerPublicKey(data, protocol) {
		return this._getServerProtocol(protocol).then(protocol => {
			const keyType = (protocol === proto.ServerProtocolType.UDP_PROTOCOL ? proto.SecurityKeyType.UDP_SERVER_PUBLIC_KEY :
				proto.SecurityKeyType.TCP_SERVER_PUBLIC_KEY);
			return this._getSecurityKey(keyType);
		});
	}

	/**
	 * Set the server address.
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
