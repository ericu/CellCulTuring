// You start with the global namespace.  If you want to split into subspaces,
// you have to pick which bits are the indicators.  For example, you can declare
// ID_0 and ID_1 as your two bits, and combine them together as ID_BITS.  Then
// you setSubspaceMask(ID_BITS).  For each subspace you want to create, you then
// declareSubspace(ID_0, 'BALL'), declareSubspace(ID_1, 'PADDLE'),
// declareSubspace(ID_BITS, 'WALL'), declareSubspace(0, 'BACKGROUND'), 
// For the global namespace, just use new Namespace() with no arguments.

// Backwards-compatibility shim; this only supports the bare minimum that's
// already in use.
function _or(a, b) {
  return (a | b) >>> 0;
}
function _and(a, b) {
  return (a & b) >>> 0;
}
function _orL(list) {
  assert(_.isArray(list));
  return _.reduce(list, _or, 0);
}
function _andL(list) {
  assert(_.isArray(list));
  return _.reduce(list, _and, 0);
}

class BitManager {
  constructor(globalNamespace) {
    this.ns = globalNamespace;
  }
  static copyBits(nsFrom, packedFrom, nsTo, packedTo, whichBits) {
    assert(_.isArray(whichBits));
    for (let value of whichBits) {
      let bits = nsFrom[value].get(packedFrom);
      packedTo = nsTo[value].set(packedTo, bits);
    }
    return packedTo;
  }
  _findNamespace(name, packed) {
    let ns = this.ns;
    while (!(name in ns)) {
      let id = _and(packed, ns.subspaceMask);
      ns = ns.subspacesById[id];
      assert(ns);
    }
    return ns;
  }
  or(list) { // Non-static only for ease of call.
    return _orL(list);
  }
  and(list) { // Non-static only for ease of call.
    return _andL(list)
  }
  dumpStatus() {
    return this.ns.dumpStatus();
  }
  get(name, packed) {
    let ns = this._findNamespace(name, packed);
    return ns[name].get(packed);
  }
  getMask(name) {
    let ns = this._findNamespace(name, packed);
    return ns[name].getMask();
  }
  set(name, packed, value) {
    let ns = this._findNamespace(name, packed);
    return ns[name].set(packed, value);
  }
  setMask(name, packed, value) {
    let ns = this._findNamespace(name, packed);
    return ns[name].setMask(packed, value);
  }
  isSet(name, packed) {
    let ns = this._findNamespace(name, packed);
    return ns[name].isSet(packed);
  }
  // This is really hacky and should never be used, but is here for
  // backwards-compatibility.
  hasKey(name, nsName) {
    if (nsName) {
      return this.ns.subspacesByName[nsName] &&
             this.ns.subspacesByName[nsName].hasKey(name);
    }
    return this.ns.hasKey(name);
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
  return data => ((data & mask) >>> 0) === value;
}

class Namespace {
  constructor(name, parent, id) {
    assert(!name || (_.isString(name) && name.length && parent));
    this.name = name || 'GLOBAL';
    this.parent = parent;
    this.id = id;
    this.subspacesByName = {};
    this.subspacesById = {};
    this.values = {};
    this.bitsUsed = parent ? parent.bitsUsed : 0;
  }
  dumpStatus() {
    console.log('bits used by', this.name, this.bitsUsed.toString(16));
    for (let name in this.subspacesByName) {
      this.subspacesByName[name].dumpStatus();
    }
  }
  describe(packed, prefix) {
    if (!prefix) {
      prefix = ''
    }
    console.log(prefix + 'namespace', this.name);
    for (var i in this.values) {
      var value = this.values[i];
      let v = value.get(packed);
      console.log(prefix + value.name, v.toString(16));
    }
    if (this.subspaceMask) {
      let id = _and(packed, this.subspaceMask);
      assert(id in this.subspacesById)
      this.subspacesById[id].describe(packed, prefix + '  ');
    }
  }
  setSubspaceMask(maskName) {
    assert(this.subspaceMask === undefined);
    let mask = 0;
    if (this.parent) {
      mask = this.parent.subspaceMask;
    }
    this.subspaceMask = _or(mask, this.values[maskName].getMask());
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
      id = _or(id, this.id);
    }
    assert(!(id & ~this.subspaceMask));
    assert(!(id in this.subspacesById));
    let subspace = new Namespace(name, this, id);
    this.subspacesByName[name] = subspace;
    this.subspacesById[id] = subspace;
    return subspace;
  }
  declare(name, count, offset) {
    // Can't use up any more bits in the mask after declaring subspaces.  Do all
    // your bits first.
    assert(!Object.keys(this.subspacesById).length);
    let bits = ((1 << count) - 1) >>> 0;
    let mask = (bits << offset) >>> 0
    this._ensureNonConflicting(name, mask);

    assert(!(name in this.values));
    assert(!(name in this));
    this.bitsUsed = _or(this.bitsUsed, mask);
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
  alloc(name, count) {
    // Can't use up any more bits in the mask after declaring subspaces.  Do all
    // your bits first.
    assert(!Object.keys(this.subspacesById).length);
    assert(!(name in this.values));
    assert(!(name in this));
    let bits = ((1 << count) - 1) >>> 0;
    let offset = 0;
    let mask = bits;
    while (mask & this.bitsUsed) {
      ++offset;
      assert(offset + count < 32);
      mask <<= 1;
    }

    this.bitsUsed = _or(this.bitsUsed, mask);
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

  _findRecord(name) {
    if (name in this.values) {
      return this.values[name]
    }
    assert(this.parent);
    return this.parent._findRecord(name)
  }

  combine(newName, oldNames) {
    assert(!(newName in this.values));
    assert(_.isArray(oldNames));
    let mask = 0;
    let offset = 32;
    for (var name of oldNames) {
      let oldValue = this._findRecord(name);
      mask = _or(mask, oldValue.getMask());
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

  _ensureNonConflicting(name, mask) {
    if (this.bitsUsed & mask) {
      for (let r in this.values) {
        let value = this.values[r];
        if (value.getMask() & mask) {
          throw new Error(
            `Declaration of "${name}" conflicts with "${r}".`)
        }
      }
      // Found a conflict but it's not here, so it must be in the parent.
      this.parent._ensureNonConflicting(name, mask);
      assert(false);
    }
  }

  // This is really hacky and should never be used, but is here for
  // backwards-compatibility.
  hasKey(name) {
    if (name in this.values) {
      return true;
    }
    for (let i in this.subspacesById) {
      if (this.subspacesById[i].hasKey(name)) {
        return true;
      }
    }
    return false;
  }
}

class Value {
  constructor (namespace, name, record) {
    this.name = name;
    this.record = record;
    this.namespaceId = 0;
    this.namespaceMask = 0;
    if (namespace.parent) {
      this.namespaceId = namespace.id;
      this.namespaceMask = namespace.parent.subspaceMask;
    }
  }

  isSet(packed) {
    assert(_.isNumber(packed));
    assert(_and(packed, this.namespaceMask) === this.namespaceId);
    return _and(packed, this.record.mask) === this.record.mask;
  }

  get(packed) {
    assert(_.isNumber(packed));
    assert(_and(packed, this.namespaceMask) === this.namespaceId);
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
    assert(_and(packed, this.namespaceMask) === this.namespaceId);
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
    assert(_and(packed, this.namespaceMask) === this.namespaceId);
    if (value) {
      return _or(packed, this.record.mask);
    } else {
      return _and(packed, ~this.record.mask);
    }
  }
}
