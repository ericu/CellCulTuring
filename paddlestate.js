// Don't access color directly; it may be out of date.
class PaddleState {
  constructor(bm, color) {
    assert(bm.isSet('PADDLE_FLAG', color));
    this.bm = bm;
    this.color = color;
    this.position = bm.get('PADDLE_POSITION', color);
    this.dest = bm.get('PADDLE_DEST', color);
    this.decimator = bm.get('DECIMATOR', color);
    this.pixel = bm.get('PADDLE_PIXEL', color);
  }

  isMotionCycle() {
    return !this.decimator;
  }

  getDY() {
    let destPos = this.dest << 3;
    if (this.position > destPos) {
      return -1;
    } else if (this.position < destPos) {
      return 1;
    } else {
      return 0;
    }
  }

  setDest(dest) {
    assert(!(dest & ~0x07))
    this.dest = dest;
  }

  getColor() {
    let color = this.color;
    color = this.bm.set('PADDLE_DEST', color, this.dest);
    return color;
  }

  nextColor() {
    let color = this.getColor();
    if (this.isMotionCycle()) {
      color = this.bm.set('PADDLE_POSITION', color, this.position +
                          this.getDY());
    }
    color = this.bm.set('DECIMATOR', color, !this.decimator);
    return color;
  }
}

