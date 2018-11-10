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
  constructor () {
    this.info = {};
  }

  declare(name, count, offset) {
    assert(!(name in this.info));
    this.info[name] = { count: count, offset: offset };
  }

  get(name, packed) {
    assert(name in this.info);
    const record = this.info[name];
    const bits = ((1 << record.count) - 1) >>> 0;
    const mask = (bits << record.offset) >>> 0;
    return (packed & mask) >>> record.offset;
  }

  isSet(name, packed) {
    assert(name in this.info);
    const record = this.info[name];
    const bits = ((1 << record.count) - 1) >>> 0;
    const mask = (bits << record.offset) >>> 0;
    return ((packed & mask) >>> 0) === mask;
  }

  getMask(name) {
    assert(name in this.info);
    const record = this.info[name];
    const bits = ((1 << record.count) - 1) >>> 0;
    return (bits << record.offset) >>> 0;
  }

  set(name, packed, value) {
    assert(name in this.info);
    const record = this.info[name];
    const bits = ((1 << record.count) - 1) >>> 0;
    const mask = (bits << record.offset) >>> 0;
    assert(!(value & ~mask));
    return ((packed & ~mask) | (value << record.offset)) >>> 0;
  }
}

