import { DeviceMode } from './device';
import { Request } from './request';
import { Result } from './result';
import { fromProtobufEnum } from './protobuf-util';
import { RequestError } from './error';

import proto from './protocol';

const NETWORK_ID_LENGTH = 24;
const MAX_NETWORK_NAME_LENGTH = 16;
const MIN_NETWORK_PASSWORD_LENGTH = 6;
const MAX_NETWORK_PASSWORD_LENGTH = 255;

/**
 * Mixin class for a Mesh device.
 */
export const MeshDevice = base => class extends base {
  /**
   * Authenticate the host on the device.
   *
   * @param {String} pwd - Network password.
   * @return {Promise}
   */
  async meshAuth(pwd) {
    return this.sendRequest(Request.MESH_AUTH, {
      password: pwd
    });
  }

  /**
   * Create a new mesh network.
   *
   * @param {String} network.id - Network ID.
   * @param {String} network.name - Network name.
   * @param {String} network.password - Network password.
   * @param {Number} [network.channel] - Channel number.
   * @return {Promise}
   */
  async createMeshNetwork(network) {
    // Perform some checks at the client side
    if (!network.id || Buffer.byteLength(network.id) != NETWORK_ID_LENGTH) {
      throw new RangeError('Invalid length of the network ID');
    }
    if (!network.name || Buffer.byteLength(network.name) > MAX_NETWORK_NAME_LENGTH) {
      throw new RangeError('Invalid length of the network name');
    }
    const pwdLen = network.password ? Buffer.byteLength(network.password) : 0;
    if (pwdLen < MIN_NETWORK_PASSWORD_LENGTH || pwdLen > MAX_NETWORK_PASSWORD_LENGTH) {
      throw new RangeError('Invalid length of the network password');
    }
    return this._runInListeningMode(async () => {
      const r = await this.sendRequest(Request.MESH_CREATE_NETWORK, {
        name: network.name,
        password: network.password,
        networkId: network.id,
        channel: network.channel
      });
      return {
        panId: r.network.panId,
        extPanId: r.network.extPanId,
        channel: r.network.channel
      };
    });
  }

  /**
   * Leave the current mesh network.
   *
   * @return {Promise}
   */
  async leaveMeshNetwork() {
    return this._runInListeningMode(() => {
      return this.sendRequest(Request.MESH_LEAVE_NETWORK);
    });
  }

  /**
   * Get info about the current mesh network.
   *
   * @return {Promise}
   */
  async getMeshNetworkInfo() {
    const r = await this.sendRequest(Request.MESH_GET_NETWORK_INFO, null, {
      dontThrow: true
    });
    if (r.result == Result.NOT_FOUND) {
      return null; // The device is not a member of a network
    }
    if (r.result != Result.OK) {
      throw new RequestError(r.result);
    }
    return {
      id: r.network.networkId,
      name: r.network.name,
      panId: r.network.panId,
      extPanId: r.network.extPanId,
      channel: r.network.channel
    };
  }

  /**
   * Start the commissioner role.
   *
   * @param {Number} [timeout] - Time in milliseconds after which the role is automatically stopped.
   * @return {Promise}
   */
  async startCommissioner(timeout) {
    return this.sendRequest(Request.MESH_START_COMMISSIONER, {
      timeout: timeout
    });
  }

  /**
   * Stop the commissioner role.
   *
   * @return {Promise}
   */
  async stopCommissioner() {
    return this.sendRequest(Request.MESH_STOP_COMMISSIONER);
  }

  /**
   * Join the network.
   *
   * @param {MeshDevice} commDev - Commissioner device.
   * @return {Promise}
   */
  async joinMeshNetwork(commDev) {
    return this._runInListeningMode(async () => {
      // TODO: Start the commissioner role automatically
      let r = await commDev.sendRequest(Request.MESH_GET_NETWORK_INFO);
      const network = r.network;
      r = await this.sendRequest(Request.MESH_PREPARE_JOINER, {
        network: network
      });
      const eui64 = r.eui64;
      const joinPwd = r.password;
      await commDev.sendRequest(Request.MESH_ADD_JOINER, {
        eui64: eui64,
        password: joinPwd
      });
      await this.sendRequest(Request.MESH_JOIN_NETWORK);
    });
  }

  /**
   * Scan for mesh networks.
   *
   * @return {Promise}
   */
  async scanMeshNetworks() {
    const r = await this.sendRequest(Request.MESH_SCAN_NETWORKS);
    return r.networks.map(network => ({
      name: network.name,
      panId: network.panId,
      extPanId: network.extPanId,
      channel: network.channel
    }));
  }

  /**
   * Set to `true` if this is a mesh device.
   */
  get isMeshDevice() {
    return true;
  }

  async _runInListeningMode(fn) {
    // Currently, Device OS requires a mesh device to be in the listening mode in order to perform
    // most of the mesh network operations
    const mode = await this.getDeviceMode();
    if (mode == DeviceMode.LISTENING) {
      return fn();
    }
    await this.enterListeningMode();
    try {
      return await fn();
    } catch (e) {
      throw e;
    } finally {
      await this.leaveListeningMode(); // Restore the device state
    }
  }
}
