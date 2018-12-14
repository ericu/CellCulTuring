(function () {
  let nsPaddle, nsBall, nsBackground;
  let isPaddle, isBallInPaddleBuffer, isPaddleBuffer;

  // Don't access color directly; it may be out of date.
  // This originally just dealt with paddles.  You can now create a PaddleState
  // from a PaddleBuffer, with or without a ball in it, so beware the underlying
  // ball bits and type when dealing with motion.
  // TODO: Deal with move delay when we have it.
  class PaddleState {
    static init(_nsPaddle_, _nsBall_, _nsBackground_,
                _isPaddle_, _isBallInPaddleBuffer_, _isPaddleBuffer_) {
      nsPaddle = _nsPaddle_;
      nsBall = _nsBall_;
      nsBackground = _nsBackground_;
      isPaddle = _isPaddle_;
      isBallInPaddleBuffer = _isBallInPaddleBuffer_;
      isPaddleBuffer = _isPaddleBuffer_;
    }
    constructor(color) {
      assert(nsPaddle);
      assert(isPaddle(color) || isBallInPaddleBuffer(color) ||
             isPaddleBuffer(color));
      this.color = color;
      if (isPaddle(color)) {
        this.ns = nsPaddle;
      } else if (isBallInPaddleBuffer(color)) {
        this.ns = nsBall;
      } else {
        assert(isPaddleBuffer(color));
        this.ns = nsBackground;
      }
      this.position = this.ns.PADDLE_POSITION.get(color);
      this.dest = this.ns.PADDLE_DEST.get(color);
      this.decimator = this.ns.DECIMATOR.get(color);
      // This is the single raw bit, not the decoded, useful value.
      this.paddlePixelBit = this.ns.PADDLE_PIXEL.get(color);
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
      // TODO: This is now broken.
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
      assert(this.ns);
      let color = this.color;
      color = this.ns.PADDLE_DEST.set(color, this.dest);
      return color;
    }

    nextColor() {
      let color = this.getColor(this.ns);
      if (this.isMotionCycle()) {
        color = this.ns.PADDLE_POSITION.set(color,
                                            this.position + this.getDY());
      }
      color = this.ns.DECIMATOR.set(color, !this.decimator);
      return color;
    }

    // This is the namespace of the source color, and thus of getColor and
    // nextColor.
    getNamespace() {
      return this.ns;
    }
  }

  window.PaddleState = PaddleState;
})();
