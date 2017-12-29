import { ProtocolError } from './error';

// Transforms a Protobuf enum to an API-friendly object
export function mapProtobufEnum(map) {
  const mapFromProtobuf = {};
  const mapToProtobuf = {};
  const mapFuncs = {
    fromProtobuf: (val) => {
      if (!mapFromProtobuf.hasOwnProperty(val)) {
        throw new ProtocolError(`Unknown enum value: ${val}`);
      }
      return mapFromProtobuf[val];
    },
    toProtobuf: (val) => {
      if (!mapToProtobuf.hasOwnProperty(val)) {
        throw new RangeError(`Unknown enum value: ${val}`);
      }
      return mapToProtobuf[val];
    }
  };
  const obj = Object.create(mapFuncs);
  for (let name in map) {
    const val = map[name];
    mapFromProtobuf[val] = name;
    mapToProtobuf[name] = val;
    obj[name] = name;
  }
  return Object.freeze(obj);
}
