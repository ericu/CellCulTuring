(function () {
  let ns, isPaddle;

  // Don't access color directly; it may be out of date.
  class PaddleState {
    static init(_ns_, _isPaddle_) {
      ns = _ns_;
      isPaddle = _isPaddle_;
    }
    constructor(color) {
      assert(ns);
      assert(isPaddle(color));
      this.color = color;
      this.position = ns.PADDLE_POSITION.get(color);
      this.dest = ns.PADDLE_DEST.get(color);
      this.decimator = ns.DECIMATOR.get(color);
    }

    // Assumes this encoding and an 8-pixel paddle for now: 01000111.
    // Returns a value between -1 and 8; you may be off the end by up to 1
    // pixel.
    // Returns the pixel for the middle of the three.
    static getPaddlePixel(d0, d1, d2) {
      let isP0 = isPaddle(d0) ? 1 : 0;
      let isP1 = isPaddle(d1) ? 1 : 0;
      let isP2 = isPaddle(d2) ? 1 : 0;
      assert(isP0 || isP1 || isP2);
      if (!isP0) {
        if (!isP1) {
          return -1;
        }
        return 0;
      } else if (!isP2) {
        if (!isP1) {
          return 8;
        }
        return 7;
      }
      switch ((ns.PADDLE_PIXEL.get(d0) << 2) |
              (ns.PADDLE_PIXEL.get(d1) << 1) |
              (ns.PADDLE_PIXEL.get(d2))) {
        case 0:
          return 3;
        case 1:
          return 4;
        case 2:
          return 1;
        case 3:
          return 5;
        case 4:
          return 2;
        case 5:
          assert(false);
          break;
        case 6:
          assert(false);
          break;
        case 7:
          return 6;
        default:
          assert(false);
          break;
      }
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
      color = ns.PADDLE_DEST.set(color, this.dest);
      return color;
    }

    nextColor() {
      let color = this.getColor();
      if (this.isMotionCycle()) {
        color = ns.PADDLE_POSITION.set(color, this.position + this.getDY());
      }
      color = ns.DECIMATOR.set(color, !this.decimator);
      return color;
    }
  }

  window.PaddleState = PaddleState;
})();
