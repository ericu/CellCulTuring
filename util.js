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

// We can't trust canvas to do bit-exact alpha values, since it has to translate
// int -> float -> int.
class CanvasWrapper {
  constructor(canvas) {
    this.canvas = canvas;
    this.context = canvas.getContext('2d');
    this.data = this.context.getImageData(0, 0, canvas.width, canvas.height);
    this.view = new Uint32Array(this.data.data.buffer);
  }

  getAddr32(i, j) {
    return i + this.canvas.width * j
  }

  fillRect(color, x, y, w, h) {
    if (x < 0) {
      x = 0;
    }
    if (x >= canvas.width) {
      x = canvas.width - 1;
    }
    if (y < 0) {
      y = 0;
    }
    if (y >= canvas.height) {
      y = canvas.height - 1;
    }
    if (x + w >= canvas.width) {
      w = canvas.width - x;
    }
    if (y + h >= canvas.height) {
      h = canvas.height - y;
    }
    for (let i = 0; i < w; ++i) {
      for (let j = 0; j < h; ++j) {
        this.view[this.getAddr32(i + x, j + y)] = color;
      }
    }
  }

  strokeRect(color, x, y, w, h) {
    if (x < 0) {
      x = 0;
    }
    if (x >= canvas.width) {
      x = canvas.width - 1;
    }
    if (y < 0) {
      y = 0;
    }
    if (y >= canvas.height) {
      y = canvas.height - 1;
    }
    if (x + w >= canvas.width) {
      w = canvas.width - x;
    }
    if (y + h >= canvas.height) {
      h = canvas.height - y;
    }
    for (let i = 0; i < w; ++i) {
      this.view[this.getAddr32(i + x, y)] = color;
      this.view[this.getAddr32(i + x, y + h)] = color;
    }
    for (let j = 0; j <= h; ++j) {
      this.view[this.getAddr32(x, j + y)] = color;
      this.view[this.getAddr32(x + w, j + y)] = color;
    }
  }

  commit() {
    this.context.putImageData(this.data, 0, 0);
  }
}

// This won't be super fast, but it may keep me sane, and can be optimized later
// if need be.
class BitMan {
  constructor() {
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
      mask = (mask | record.mask) >>> 0;
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

