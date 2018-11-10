"use strict";

function assert(val, message) {
  if (!val) {
    var m = "Assertion failed!"
    if (message) {
      m += "\n" + message;
    }
    throw m;
  }
}

// This won't be super fast, but it may keep me sane, and can be optimized later
// if need be.
class BitKeeper {
  // TODO: Keep a running mask of all bits used, and identify collisions.
  // Namespace by new object or new API?
  constructor () {
    this.info = {};
  }

  declare(name, count, offset) {
    assert(!(name in this.info));
    let bits = ((1 << count) - 1) >>> 0;
    this.info[name] = {
      offset: offset,
      bits: bits,
      mask:(bits << offset) >>> 0
    };
  }

  get(name, packed) {
    assert(name in this.info);
    const record = this.info[name];
    return (packed & record.mask) >>> record.offset;
  }

  isSet(name, packed) {
    assert(name in this.info);
    const record = this.info[name];
    return ((packed & record.mask) >>> 0) === record.mask;
  }

  combine(newName, name0, name1) {
    assert(!(newName in this.info));
    assert(name0 in this.info);
    assert(name1 in this.info);
    const record0 = this.info[name0];
    const record1 = this.info[name1];
    let mask = (record0.mask | record1.mask) >>> 0;
    let offset = Math.min(record0.offset, record1.offset);
    let bits = mask >>> offset;
    this.info[newName] = {
      offset: offset,
      bits: bits,
      mask: mask
    }
  }

  alias(newName, name) {
    assert(!(newName in this.info));
    assert(name in this.info);
    this.info[newName] = this.info[name]
  }

  getMask(name) { // TODO: Needed?
    assert(name in this.info);
    const record = this.info[name];
    return record.mask;
  }

  set(name, packed, value) {
    assert(name in this.info);
    const record = this.info[name];
    assert(!(value & ~record.mask));
    return ((packed & ~record.mask) | (value << record.offset)) >>> 0;
  }
}

