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


