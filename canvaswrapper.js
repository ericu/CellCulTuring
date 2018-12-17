// We can't trust canvas to do bit-exact alpha values, since it has to translate
// int -> float -> int.
class CanvasWrapper {
  constructor(data) {
    this.data = data;
    this.view = new Uint32Array(this.data.data.buffer);
  }

  getAddr32(i, j) {
    return i + this.data.width * j
  }

  fillRectWith(color, op, x, y, w, h) {
    assert(_.isNumber(color));
    assert(_.isString(op));
    if (x < 0) {
      x = 0;
    }
    if (x >= this.data.width) {
      x = this.data.width - 1;
    }
    if (y < 0) {
      y = 0;
    }
    if (y >= this.data.height) {
      y = this.data.height - 1;
    }
    if (x + w >= this.data.width) {
      w = this.data.width - x;
    }
    if (y + h >= this.data.height) {
      h = this.data.height - y;
    }
    for (let i = 0; i < w; ++i) {
      for (let j = 0; j < h; ++j) {
        if (op === 'or') {
          this.view[this.getAddr32(i + x, j + y)] |= color;
        } else {
          assert(op === 'set');
          this.view[this.getAddr32(i + x, j + y)] = color;
        }
      }
    }
  }

  orRect(color, x, y, w, h) {
    return this.fillRectWith(color, 'or', x, y, w, h);
  }

  fillRect(color, x, y, w, h) {
    return this.fillRectWith(color, 'set', x, y, w, h);
  }

  strokeRect(color, x, y, w, h) {
    if (x < 0) {
      x = 0;
    }
    if (x >= this.data.width) {
      x = this.data.width - 1;
    }
    if (y < 0) {
      y = 0;
    }
    if (y >= this.data.height) {
      y = this.data.height - 1;
    }
    if (x + w >= this.data.width) {
      w = this.data.width - x;
    }
    if (y + h >= this.data.height) {
      h = this.data.height - y;
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
}


