/**
 * Get an object that maps values from a Protobuf enum value to a string value and vice versa,
 * using the provided mapping.
 *
 * @param {Object} pbEnum Protobuf enum object, imported from @particle/device-os-protobuf
 * @param {Object} map Object where the keys are application strings and values are Protobuf strings
 * @param {String} [unknownVal] Value to return when the Protobuf value is unknown. Defaults to UNKNOWN
 * @returns {Readonly<{fromProtobuf: ((function(*): (*|string))|*), toProtobuf: (function(*): *)}>}
 * Object with toProtobuf and fromProtobuf functions
 */
function fromProtobufEnum(pbEnum, map, unknownVal) {
	const mapToProtobuf = {};
	const mapFromProtobuf = {};
	const funcs = {
		toProtobuf: (val) => {
			const pbVal = mapToProtobuf[val.toLowerCase()];
			if (pbVal === undefined) {
				throw new RangeError(`Invalid value: ${val}`);
			}
			return pbVal;
		},
		fromProtobuf: (pbVal) => {
			const val = mapFromProtobuf[pbVal];
			if (val === undefined) {
				return (unknownVal !== undefined ? unknownVal : 'UNKNOWN');
			}
			return val;
		}
	};
	const obj = Object.create(funcs);
	for (const val in map) {
		const pbName = map[val];
		const pbVal = pbEnum[pbName];
		if (pbVal === undefined) {
			throw new Error(`Unknown enum value: ${pbName}`);
		}
		const v = val.toLowerCase();
		if (v in mapToProtobuf) {
			throw new Error(`Duplicate value: ${val}`);
		}
		mapToProtobuf[v] = pbVal;
		mapFromProtobuf[pbVal] = val;
		obj[val] = val;
	}
	return Object.freeze(obj);
}

function transformMessage(msg, map) {
	const obj = {};
	for (let name of Object.keys(msg)) { // Ignore prototype properties
		let val = msg[name];
		const m = map[name];
		if (typeof m == 'string') {
			name = m; // Rename property
		} else if (typeof m == 'function') {
			val = m(val); // Convert value
		} else if (typeof m == 'object') {
			if (m.name) {
				name = m.name; // Rename property
			}
			if (m.value) {
				val = m.value(val); // Convert value
			}
		} else if (!m) {
			continue; // Skip property
		}
		if (val === undefined) {
			continue; // Skip property
		}
		obj[name] = val;
	}
	return obj;
}

function checkFromProtobufMessageMap(pbMsgProto, map) {
	for (const name in map) {
		if (!Object.prototype.hasOwnProperty.call(pbMsgProto, name)) {
			throw new Error(`Unknown message field: ${name}`);
		}
	}
}

function checkToProtobufMessageMap(pbMsgProto, map) {
	for (let name in map) {
		const m = map[name];
		if (typeof m == 'string') {
			name = m;
		} else if (typeof m == 'object') {
			if (m.name) {
				name = m.name;
			}
		}
		if (!Object.prototype.hasOwnProperty.call(pbMsgProto, name)) {
			throw new Error(`Unknown message field: ${name}`);
		}
	}
}

function assignMessagePropertyMaps(obj, ...maps) {
	for (let map of maps) {
		if (Array.isArray(map)) {
			map = map.reduce((obj, name) => {
				obj[name] = true;
				return obj;
			}, {});
		}
		Object.assign(obj, map);
	}
	return obj;
}

// Returns a function that transforms a Protobuf message to an API object according to the provided mapping
// DEPRECATED: don't use for new code. It's clearer to write mapping code directly
function fromProtobufMessage(pbMsg, ...maps) {
	const map = assignMessagePropertyMaps({}, ...maps);
	checkFromProtobufMessageMap(pbMsg.prototype, map);
	return msg => transformMessage(msg, map);
}

// Returns a function that transforms an API object to a Protobuf message according to the provided mapping
// DEPRECATED: don't use for new code. It's clearer to write mapping code directly
function toProtobufMessage(pbMsg, ...maps) {
	const map = assignMessagePropertyMaps({}, ...maps);
	checkToProtobufMessageMap(pbMsg.prototype, map);
	return msg => transformMessage(msg, map);
}

/**
 * Checks for each bit in a value and returns an array of strings for each bit that is set
 * @param value The value to check
 * @param mapping A mapping created by fromProtobufEnum
 * @returns {Array<String>} Array of strings for each bit that is set
 */
function extractBits(value, mapping) {
	const names = [];
	let bit = 1;
	while (value) {
		const hasBit = value & 1;
		const name = mapping.fromProtobuf(bit);
		value >>= 1;
		bit <<= 1;
		if (!hasBit) {
			continue;
		}
		if (name !== 'UNKNOWN') {
			names.push(name);
		}
	}
	return names;
}

module.exports = {
	fromProtobufEnum,
	fromProtobufMessage,
	toProtobufMessage,
	extractBits
};
