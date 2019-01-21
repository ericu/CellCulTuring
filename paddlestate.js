(function () {
  let nsPaddle, nsBall, nsBackground;
  let isPaddle, isBallInPaddleBuffer, isPaddleBuffer;

  // Don't access color directly; it may be out of date.
  // This originally just dealt with paddles.  You can now create a PaddleState
  // from a PaddleBuffer, with or without a ball in it, so beware the underlying
  // ball bits and type when dealing with motion.
  // Note that in setDY we assume a position range of 0-56, since that's what
  // our current 3-bit-shifted-3 dest can encode.
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
      this.delay = 0;
      if (isPaddle(color)) {
        this.ns = nsPaddle;
      } else if (isBallInPaddleBuffer(color)) {
        this.ns = nsBall;
      } else {
        assert(isPaddleBuffer(color));
        this.ns = nsBackground;
        this.delay = nsBackground.PADDLE_MOVE_DELAY_COUNTER.get(color);
      }
      this.position = this.ns.PADDLE_POSITION.get(color);
      this.dest = this.ns.PADDLE_DEST.get(color);
      this.decimator = this.ns.DECIMATOR.get(color);
      // This is the single raw bit, not the decoded, useful value.
      this.paddlePixelBit = this.ns.PADDLE_PIXEL.get(color);
    }

    isMotionCycle() {
      return !this.decimator;
    }

    getDY(isLeft) {
      assert(isLeft !== undefined);
      let useUserInput = isLeft ? !window.leftPlayerAI : !window.rightPlayerAI;
      if (useUserInput) {
        if (isLeft) {
          if (window.keyTable['w'] && this.position > 0) {
            return -1;
          } else if (window.keyTable['s'] && this.position < 56) {
            return 1;
          } else {
            return 0;
          }
        } else {
          if (window.keyTable['o'] && this.position > 0) {
            return -1;
          } else if (window.keyTable['l'] && this.position < 56) {
            return 1;
          } else {
            return 0;
          }
        }
      }
      if (this.delay) {
        return 0;
      }
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

    nextColor(isLeft) {
      let color = this.getColor();
      if (this.isMotionCycle()) {
        color = this.ns.PADDLE_POSITION.set(color,
                                            this.position + this.getDY(isLeft));
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
