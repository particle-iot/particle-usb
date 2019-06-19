import { DeviceMode } from './device';
import { Request } from './request';
import { Result } from './result';
import { fromProtobufEnum } from './protobuf-util';
import { RequestError } from './error';

import * as ip from 'ip';

import proto from './protocol';

const NETWORK_ID_LENGTH = 24;
const MAX_NETWORK_NAME_LENGTH = 16;
const MIN_NETWORK_PASSWORD_LENGTH = 6;
const MAX_NETWORK_PASSWORD_LENGTH = 255;
const DIAGNOSTIC_DEFAULT_TIMEOUT = 10000; // 10 seconds

export const DiagnosticType = fromProtobufEnum(proto.mesh.DiagnosticType, {
  MAC_EXTENDED_ADDRESS: 'MAC_EXTENDED_ADDRESS',
  RLOC: 'RLOC',
  MAC_ADDRESS: 'MAC_ADDRESS',
  MODE: 'MODE',
  TIMEOUT: 'TIMEOUT',
  CONNECTIVITY: 'CONNECTIVITY',
  ROUTE64: 'ROUTE64',
  LEADER_DATA: 'LEADER_DATA',
  NETWORK_DATA: 'NETWORK_DATA',
  IPV6_ADDRESS_LIST: 'IPV6_ADDRESS_LIST',
  MAC_COUNTERS: 'MAC_COUNTERS',
  BATTERY_LEVEL: 'BATTERY_LEVEL',
  SUPPLY_VOLTAGE: 'SUPPLY_VOLTAGE',
  CHILD_TABLE: 'CHILD_TABLE',
  CHANNEL_PAGES: 'CHANNEL_PAGES',
  // NOTE: it's not possible to query this diagnostic TLV
  // TYPE_LIST: 'TYPE_LIST',
  MAX_CHILD_TIMEOUT: 'MAX_CHILD_TIMEOUT'
});

function formatMacAddress(addr) {
  return [...addr].map(b => Number(b).toString(16).padStart(2, '0')).join(':');
}

function formatDeviceId(id) {
  return id.toString('hex');
}

function transformNetworkData(data) {
  if (data.prefixes) {
    data.prefixes = data.prefixes.map(p => {
      const s = Buffer.concat([ p.prefix, Buffer.alloc(16 - p.prefix.length) ]);
      p.prefix = `${ip.toString(s)}/${p.prefixLength}`;
      delete p.prefixLength;
      return p;
    });
  }
  return data;
}

function transformNetworkDiagnosticInfo(info) {
  const result = {};
  const leaderRlocs = new Set();
  const gatewayRlocs = new Set();
  result.nodes = info.nodes.map(node => {
    if (node.ipv6AddressList) {
      node.ipv6AddressList = node.ipv6AddressList.map(addr => {
        return ip.toString(addr.address);
      });
    }
    if (node.extMacAddress) {
      node.extMacAddress = formatMacAddress(node.extMacAddress);
    }
    if (node.deviceId) {
      node.deviceId = formatDeviceId(node.deviceId);
    }
    if (node.networkData) {
      const data = node.networkData;
      if (data.stable) {
        data.stable = transformNetworkData(data.stable);
        const prefixes = data.stable.prefixes;
        if (prefixes) {
          prefixes.forEach(p => {
            const entries = p.borderRouter.entries;
            if (entries) {
              entries.forEach(e => {
                gatewayRlocs.add(e.rloc);
              });
            }
          });
        }
      }
      if (data.temporary) {
        data.temporary = transformNetworkData(data.temporary);
      }
    }
    node.role = [];
    if (node.rloc & 0x01ff) {
      node.role.push('endpoint');
    } else {
      node.role.push('repeater');
    }
    if (node.leaderData) {
      leaderRlocs.add(node.leaderData.leaderRloc);
    }
    return node;
  });
  result.nodes.forEach(node => {
    if (leaderRlocs.has(node.rloc)) {
      const index = node.role.indexOf('repeater');
      if (index != -1) {
        node.role.splice(index, 1);
      }
      node.role.push('leader');
    }
    if (gatewayRlocs.has(node.rloc)) {
      node.role.push('gateway');
    }
  });
  return result;
}

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
   * Set the setup done flag.
   *
   * @param {Boolean} [done] Flag value.
   * @return {Promise}
   */
  async setSetupDone(done) {
    if (done === undefined) {
      done = true;
    }
    return this.sendRequest(Request.SET_DEVICE_SETUP_DONE, {
      done: done
    });
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

  /**
   * Collect network diagnostic information
   *
   * @param {Object} opts Request options
   * @return {Promise}
   */
  async getMeshNetworkDiagnosticInfo(
    opts = {
      timeout: DIAGNOSTIC_DEFAULT_TIMEOUT,
      queryChildren: false,
      diagnosticTypes: ["RLOC"]
    }
  ) {
    if (opts.queryChildren && !opts.diagnosticTypes.includes('CHILD_TABLE')) {
      opts.diagnosticTypes.push('CHILD_TABLE');
    }

    let flags = 0;
    if (opts.queryChildren) {
      flags |= proto.mesh.GetNetworkDiagnosticsRequest.Flags['QUERY_CHILDREN'];
    }

    if (opts.resolveDeviceId) {
      flags |= proto.mesh.GetNetworkDiagnosticsRequest.Flags['RESOLVE_DEVICE_ID'];
    }

    const info = await this.sendRequest(Request.MESH_GET_NETWORK_DIAGNOSTICS, {
      flags: flags,
      diagnosticTypes: opts.diagnosticTypes.map(DiagnosticType.toProtobuf),
      timeout: opts.timeout
    });
    return transformNetworkDiagnosticInfo(info);
  }
}
