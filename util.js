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
class BitMan {
  constructor () {
    this.info = {};
    this.mask = 0;
  }

  declare(name, count, offset) {
    assert(!(name in this.info));
    let bits = ((1 << count) - 1) >>> 0;
    let mask = (bits << offset) >>> 0
    assert(!(this.mask & mask));
    this.mask = (this.mask | mask) >>> 0;
    this.info[name] = {
      offset: offset,
      bits: bits,
      mask: mask
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

  combine(newName, oldNames) {
    assert(!(newName in this.info));
    assert(_.isArray(oldNames));
    let mask = 0;
    let offset = 32;
    for (var name of oldNames) {
      assert(name in this.info);
      let record = this.info[name];
      mask |= record.mask;
      offset = Math.min(offset, record.offset);
    }
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

  getMask(name) {
    assert(name in this.info);
    const record = this.info[name];
    return record.mask;
  }

  set(name, packed, value) {
    assert(name in this.info);
    const record = this.info[name];
    assert(!(value & ~record.bits));
    return ((packed & ~record.mask) | (value << record.offset)) >>> 0;
  }
}

