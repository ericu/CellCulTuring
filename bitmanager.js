// This won't be super fast, but it may keep me sane, and can be optimized later
// if need be.
class BitManager {
  constructor() {
    this.namespacesByValue = {};
    this.namespacesByName = {};
    this.namespaceBits = null;
    // the global namespace
    this.declareNamespace(undefined, undefined);
  }

  setNamespaceBits(bits) {
    assert(this.namespaceBits === null);
    this.namespaceBits = bits;
  }

  hasKey(name, namespace) {
    if (namespace in this.namespacesByName) {
      let ns = this.namespacesByName[namespace];
      return name in ns.info;
    }
    return false;
  }

  // This takes a 32-bit mask and a 32-bit value for that mask [so does no
  // shifting].  It lets namespace masks overlap, so different values for the
  // same mask can be used.
  // The idea is that if pixel & mask === value, then you can safely use the
  // namespace.
  declareNamespace(name, value) {
    assert(!(value in this.namespacesByValue));
    const record = {
      name: name, // unused; for debugging
      id: value, // unused; for debugging
      mask: 0,
      info: {}
    };
    this.namespacesByValue[value] = record;
    this.namespacesByName[name] = record;
  }

  findRecord(name, namespace) {
    if (namespace) {
      assert(namespace in this.namespacesByName);
      let ns = this.namespacesByName[namespace]
      if (name in ns.info) {
        return ns.info[name];
      }
    }
    if (name in this.namespacesByName[undefined].info) {
      return this.namespacesByName[undefined].info[name];
    }
    return null;
  }

  dumpStatus() {
    let global = this.namespacesByName[undefined];
    console.log('global mask', global.mask.toString(16));
    for (let name in this.namespacesByName) {
      if (name !== 'undefined') {
        let mask = this.namespacesByName[name].mask;
        console.log(name + ' mask', mask.toString(16),
        ((mask | global.mask) >>> 0).toString(16));
      }
    }
  }

  ensureNonConflicting(name, mask, namespace) {
    if (namespace.mask & mask) {
      for (let r in namespace.info) {
        let record = namespace.info[r];
        if (record.mask & mask) {
          throw new Error(
            `Declaration of "${name}" conflicts with "${r}".`)
        }
      }
      assert(false);
    }
  }

  declare(name, count, offset, namespace) {
    assert(namespace in this.namespacesByName);
    let ns = this.namespacesByName[namespace];
    let bits = ((1 << count) - 1) >>> 0;
    let mask = (bits << offset) >>> 0
    if (namespace) {
      // check against global mask and namespace mask
      this.ensureNonConflicting(name, mask, ns);
      const globalNs = this.namespacesByName[undefined];
      this.ensureNonConflicting(name, mask, globalNs);
    } else {
      // check against all namespaces
      for (let namespace in this.namespacesByName) {
        this.ensureNonConflicting(name, mask, this.namespacesByName[namespace]);
      }
    }
    assert(!(name in ns.info));
    ns.mask = (ns.mask | mask) >>> 0;
    ns.info[name] = {
      offset: offset,
      bits: bits,
      mask: mask,
      count: count
    };
  }

  // internal
  getRecordInternal(name, packed) {
    let info;
    if (name in this.namespacesByName[undefined].info) {
      return this.namespacesByName[undefined].info[name];
    }
    let value = (packed & this.namespaceBits) >>> 0;
    if (value in this.namespacesByValue &&
        name in this.namespacesByValue[value].info) {
      return this.namespacesByValue[value].info[name];
    }
    assert(false);
  }

  get(name, packed) {
    assert(_.isNumber(packed));
    const record = this.getRecordInternal(name, packed);
    return (packed & record.mask) >>> record.offset;
  }

  isSet(name, packed, namespace) {
    assert(_.isNumber(packed));
    const record = this.getRecordInternal(name, packed);
    return ((packed & record.mask) >>> 0) === record.mask;
  }

  combine(newName, oldNames, namespace) {
    let ns = this.namespacesByName[namespace];
    assert(!this.findRecord(newName, namespace));
    assert(_.isArray(oldNames));
    let mask = 0;
    let offset = 32;
    for (var name of oldNames) {
      let record = this.findRecord(name, namespace);
      assert(record);
      mask = (mask | record.mask) >>> 0;
      offset = Math.min(offset, record.offset);
    }
    let bits = mask >>> offset;
    ns.info[newName] = {
      offset: offset,
      bits: bits,
      mask: mask
    }
  }

  // NOTE: Only works within a single namespace.
  alias(newName, name, namespace) {
    assert(!this.findRecord(newName, namespace));
    let record = this.findRecord(name, namespace);
    assert(namespace in this.namespacesByName);
    let ns = this.namespacesByName[namespace];
    ns.info[newName] = record;
  }

  getMask(name, namespaceName) {
    assert(namespaceName in this.namespacesByName);
    let ns = this.namespacesByName[namespaceName];
    assert(name in ns.info);
    const record = ns.info[name];
    return record.mask;
  }

  set(name, packed, value) {
    const record = this.getRecordInternal(name, packed);
    if (!_.isNumber(value)) {
      assert(_.isBoolean(value));
      assert(record.count === 1);
      value = value ? 1 : 0;
    }
    assert(_.isNumber(packed));
    assert(!(value & ~record.bits));
    return ((packed & ~record.mask) | (value << record.offset)) >>> 0;
  }

  setMask(name, packed, value, namespace) {
    assert(_.isNumber(packed));
    assert(_.isBoolean(value));
    const record = this.getRecordInternal(name, packed);
    if (value) {
      return (packed | record.mask) >>> 0;
    } else {
      return (packed & ~record.mask) >>> 0;
    }
  }
}


