// You start with the global namespace.  If you want to split into subspaces,
// you have to pick which bits are the indicators.  For example, you can declare
// ID_0 and ID_1 as your two bits, and combine them together as ID_BITS.  Then
// you setSubspaceMask(ID_BITS).  For each subspace you want to create, you then
// declareSubspace(ID_0, 'BALL'), declareSubspace(ID_1, 'PADDLE'),
// declareSubspace(ID_BITS, 'WALL'), declareSubspace(0, 'BACKGROUND'), 
// For the global namespace, just use new Namespace() with no arguments.

// Backwards-compatibility shim; this only supports the bare minimum that's
// already in use.
class BitManager {
  constructor(globalNamespace) {
    this.ns = globalNamespace;
  }
  get(name, packed) {
    if (name in this.ns) {
      return this.ns[name].get(packed);
    }
    let id = (packed & this.ns.subspaceMask) >>> 0;
    return this.ns.subspacesById[id][name].get(packed);
  }
  getMask(name) {
    if (name in this.ns) {
      return this.ns[name].getMask();
    }
    let id = (packed & this.ns.subspaceMask) >>> 0;
    return this.ns.subspacesById[id][name].getMask();
  }
  set(name, packed, value) {
    if (name in this.ns) {
      return this.ns[name].set(packed, value);
    }
    let id = (packed & this.ns.subspaceMask) >>> 0;
    return this.ns.subspacesById[id][name].set(packed, value);
  }
  setMask(name, packed, value) {
    if (name in this.ns) {
      return this.ns[name].setMask(packed, value);
    }
    let id = (packed & this.ns.subspaceMask) >>> 0;
    return this.ns.subspacesById[id][name].setMask(packed, value);
  }
  isSet(name, packed) {
    return this.ns[name].isSet(packed);
  }
  hasKey(name, nsName) {
    let ns = this.ns;
    if (nsName) {
      ns = this.ns.subspacesByName[nsName];
    }
    if (ns) {
      return name in ns;
    }
    return false;
  }
  declare(name, count, offset, namespace) {
    assert(!namespace);
    this.ns.declare(name, count, offset);
  }
  combine(name, names, namespace) {
    assert(!namespace);
    this.ns.combine(name, names);
  }
  alias(newName, oldName, namespace) {
    assert(!namespace);
    this.ns.alias(newName, oldName);
  }
}

function getHasValueFunction(mask, value) {
  assert(_.isNumber(mask));
  assert(_.isNumber(value));
  return data => (data & mask) === value;
}

class Namespace {
  constructor(name, parent, id) {
    assert(!name || (_.isString(name) && name.length && parent));
    this.name = name;
    this.parent = parent;
    this.id = id;
    this.subspacesByName = {};
    this.subspacesById = {};
    this.values = {};
    this.bitsUsed = 0;
  }
  dumpStatus(parentMask) {
    parentMask = parentMask || 0;
    let cumulative = (parentMask | this.bitsUsed) >>> 0;
    console.log('bits used by', this.name, this.bitsUsed.toString(16),
                cumulative.toString(16));
    for (let name in this.subspacesByName) {
      this.subspacesByName[name].dumpStatus(cumulative);
    }
  }
  describe(packed) {
    for (var i in this.values) {
      var value = this.values[i];
      let v = value.get(packed);
      console.log(value.name, v.toString(16));
    }
    let id = (packed & this.subspaceMask) >>> 0;
    assert(id in this.subspacesById)
    this.subspacesById[id].describe(packed);
  }
  setSubspaceMask(maskName) {
    assert(this.subspaceMask === undefined);
    let mask = 0;
    if (this.parent) {
      mask = this.parent.subspaceMask;
    }
    this.subspaceMask = mask | this.values[maskName].getMask();
  }
  declareSubspace(name, idMaskNameOrZero) {
    assert(this.subspaceMask);
    assert(!(name in this.subspacesByName));
    let id = 0;
    if (_.isString(idMaskNameOrZero)) {
      id = this.values[idMaskNameOrZero].getMask();
    } else {
      assert(idMaskNameOrZero === 0);
    }
    if (this.parent) {
      id = id | this.parent.id;
    }
    assert(!(id & ~this.subspaceMask));
    assert(!(id in this.subspacesById));
    let subspace = new Namespace(name, this, id);
    this.subspacesByName[name] = subspace;
    this.subspacesById[id] = subspace;
    return subspace;
  }
  declare(name, count, offset) {
    let bits = ((1 << count) - 1) >>> 0;
    let mask = (bits << offset) >>> 0
    this._ensureNonConflicting(name, mask);

    assert(!(name in this.values));
    assert(!(name in this));
    this.bitsUsed = (this.bitsUsed | mask) >>> 0;
    let record = {
      offset: offset,
      bits: bits,
      mask: mask,
      count: count
    }
    let newValue = new Value(this, name, record);
    this.values[name] = newValue;
    // This is the speedy accessor; it's a bit hacky, but it means you can look
    // for namespace.VALUE_NAME and have it work, instead of
    // namespace.records.VALUE_NAME.  Is it worth it?
    this[name] = newValue;
    return newValue;
  }
  // NOTE: Only works within a single namespace.
  alias(newName, oldName) {
    assert(oldName in this.values);
    assert(!(newName in this.values));
    let record = this.values[oldName].record;
    let newValue = new Value(this, newName, record);
    this.values[newName] = newValue;
    this[newName] = newValue;
    return newValue;
  }
  combine(newName, oldNames) {
    assert(!(newName in this.values));
    assert(_.isArray(oldNames));
    let mask = 0;
    let offset = 32;
    for (var name of oldNames) {
      let oldValue = this.values[name];
      assert(oldValue);
      mask = (mask | oldValue.getMask()) >>> 0;
      offset = Math.min(offset, oldValue.getOffset());
    }
    let bits = mask >>> offset;
    let record = {
      offset: offset,
      bits: bits,
      mask: mask
    };
    let newValue = new Value(this, newName, record);
    this.values[newName] = newValue;
    this[newName] = newValue;
    return newValue;
  }
  _ensureNonConflictingLocally(name, mask) {
    if (this.bitsUsed & mask) {
      for (let r in this.values) {
        let value = this.values[r];
        if (value.getMask() & mask) {
          throw new Error(
            `Declaration of "${name}" conflicts with "${r}".`)
        }
      }
      assert(false);
    }
  }

  _ensureNonConflicting(name, mask) {
    this._ensureNonConflictingLocally(name, mask);
    for (let id in this.subspacesById) {
      this.subspacesById[id]._ensureNonConflicting(name, mask);
    }
    for (let ns = this.parent; ns; ns = ns.parent) {
      ns._ensureNonConflictingLocally(name, mask);
    }
  }

}

class Value {
  constructor (namespace, name, record) {
    this.name = name;
    this.record = record;
    this.namespaceId = 0;
    this.namespaceMask = 0;
    if (namespace.id) {
      this.namespaceId = namespace.id;
      this.namespaceMask = namespace.parent.subspaceMask;
    }
  }

  isSet(packed) {
    assert(_.isNumber(packed));
    assert((packed & this.namespaceMask) === this.namespaceId);
    return ((packed & this.record.mask) >>> 0) === this.record.mask;
  }

  get(packed) {
    assert(_.isNumber(packed));
    assert((packed & this.namespaceMask) === this.namespaceId);
    return (packed & this.record.mask) >>> this.record.offset;
  }

  getMask() {
    return this.record.mask;
  }

  getOffset() {
    return this.record.offset;
  }

  set(packed, value) {
    assert(_.isNumber(packed));
    assert((packed & this.namespaceMask) === this.namespaceId);
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
    assert((packed & this.namespaceMask) === this.namespaceId);
    if (value) {
      return (packed | this.record.mask) >>> 0;
    } else {
      return (packed & ~this.record.mask) >>> 0;
    }
  }
}
