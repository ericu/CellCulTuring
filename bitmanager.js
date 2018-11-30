// This won't be super fast, but it may keep me sane, and can be optimized later
// if need be.
class BitManager {
  constructor() {
    this.namespacesByValue = {};
    this.namespacesByName = {};
    this.namespaceBits = null;
    // the global namespace
    this.global = this.declareNamespace(undefined, undefined);
    this.globalNamespace = this.namespacesByName[undefined];
  }

  getIsSetFunction(nameOrMask, nameOrValue, namespace) {
    let mask = nameOrMask;
    if (_.isString(nameOrMask)) {
      const maskRecord = this.findRecord(nameOrMask, namespace);
      assert(maskRecord);
      mask = maskRecord.mask;
    }
    let value = nameOrValue;
    if (_.isString(nameOrValue)) {
      const valueRecord = this.findRecord(nameOrValue, namespace);
      assert(valueRecord);
      value = valueRecord.mask;
    }
    assert(_.isNumber(value));
    return data => (data & mask) === value;
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
      id: value,
      mask: 0,
      info: {}
    };
    this.namespacesByValue[value] = record;
    this.namespacesByName[name] = record;
    return new NamespaceWrapper(record);
  }

  findRecord(name, namespace) {
    if (namespace) {
      assert(namespace in this.namespacesByName);
      let ns = this.namespacesByName[namespace]
      if (name in ns.info) {
        return ns.info[name];
      }
    }
    if (name in this.globalNamespace.info) {
      return this.globalNamespace.info[name];
    }
    return null;
  }

  dumpStatus() {
    console.log('global mask', this.globalNamespace.mask.toString(16));
    for (let name in this.namespacesByName) {
      if (name !== 'undefined') {
        let mask = this.namespacesByName[name].mask;
        console.log(name + ' mask', mask.toString(16),
        ((mask | this.globalNamespace.mask) >>> 0).toString(16));
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
      this.ensureNonConflicting(name, mask, this.globalNamespace);
    } else {
      // check against all namespaces
      for (let namespace in this.namespacesByName) {
        this.ensureNonConflicting(name, mask, this.namespacesByName[namespace]);
      }
    }
    assert(!(name in ns.info));
    ns.mask = (ns.mask | mask) >>> 0;
    let record = {
      offset: offset,
      bits: bits,
      mask: mask,
      count: count
    }
    ns.info[name] = record;
    let fast = new FastBM(this, record, namespace ? ns : null);
    ns.wrapper[name] = fast;
    return fast;
  }

  // internal
  getRecordInternal(name, packed) {
    let info;
    if (name in this.globalNamespace.info) {
      return this.globalNamespace.info[name];
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
      let oldRecord = this.findRecord(name, namespace);
      assert(oldRecord);
      mask = (mask | oldRecord.mask) >>> 0;
      offset = Math.min(offset, oldRecord.offset);
    }
    let bits = mask >>> offset;
    let record = {
      offset: offset,
      bits: bits,
      mask: mask
    };
    ns.info[newName] = record;
    let fast = new FastBM(this, record, namespace ? ns : null);
    ns.wrapper[newName] = fast;
    return fast;
  }

  // NOTE: Only works within a single namespace.
  alias(newName, name, namespace) {
    assert(!this.findRecord(newName, namespace));
    let oldRecord = this.findRecord(name, namespace);
    assert(namespace in this.namespacesByName);
    let ns = this.namespacesByName[namespace];
    ns.info[newName] = oldRecord;
    let fast = new FastBM(bm, oldRecord, namespace ? ns : null);
    ns.wrapper[newName] = fast;
    return fast
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

class NamespaceWrapper {
  constructor (record) {
    this._record = record;
    record.wrapper = this;
  }
}

class FastBM {
  constructor (bm, record, namespace) {
    this.bm = bm;
    this.record = record;
    this.namespaceValue = 0;
    this.namespaceBits = 0;
    if (namespace) {
      this.namespaceValue = namespace.id;
      this.namespaceBits = this.bm.namespaceBits;
    }
  }

  isSet(packed) {
    assert(_.isNumber(packed));
    assert((packed & this.namespaceBits) === this.namespaceValue);
    return ((packed & this.record.mask) >>> 0) === this.record.mask;
  }

  get(packed) {
    assert(_.isNumber(packed));
    assert((packed & this.namespaceBits) === this.namespaceValue);
    return (packed & this.record.mask) >>> this.record.offset;
  }


  getMask() {
    return this.record.mask;
  }

  set(packed, value) {
    assert(_.isNumber(packed));
    assert((packed & this.namespaceBits) === this.namespaceValue);
    if (!_.isNumber(value)) {
      assert(_.isBoolean(value));
      assert(this.record.count === 1);
      value = value ? 1 : 0;
    }
    assert(!(value & ~this.record.bits));
    return ((packed & ~this.record.mask) | (value << this.record.offset)) >>> 0;
  }

  setMask(packed, value, namespace) {
    assert(_.isNumber(packed));
    assert(_.isBoolean(value));
    assert((packed & this.namespaceBits) === this.namespaceValue);
    if (value) {
      return (packed | this.record.mask) >>> 0;
    } else {
      return (packed & ~this.record.mask) >>> 0;
    }
  }
}
