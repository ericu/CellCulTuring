// We use a 5-bit encoding that covers the full 7x7 surrounding square,
// for 32 real directions.  Then we'll need 2 more bits for Bresenham state.
// The first two bits of the five pick the quadrant, and then next 3 use a
// lookup table to get their specifics.  Could allocate one of those 3 to
// whether x or y is primary, which may be convenient, but it's still not
// symmetric after that.  Here the highest bit indicates Y primary if set.
//  .   .   .   .   7   5   .
//  .   .   .   .   6   .   3
//  .   .   .   .   4   2   1
//  .   .   .   x   0   .   .
//  .   .   .   .   .   .   .
//  .   .   .   .   .   .   .
//  .   .   .   .   .   .   .

// Given the above encoding, to support the full range of motions, the
// quadrant selection needs to be a rotation.  However, since we'll never go
// straight up or down in pong, we can do reflections instead, which is a
// lot simpler for bounces, and we'll just have redundant encodings for straight
// horizontal.

(function () {

const motionTable = [
  {
    dir: 'x',
    bInc: 0,
    bMax: 0,
    slope: 0,
  },
  {
    dir: 'x',
    bInc: 1,
    bMax: 3,
    slope: 1/3,
  },
  {
    dir: 'x',
    bInc: 1,
    bMax: 2,
    slope: 1/2,
  },
  {
    dir: 'x',
    bInc: 2,
    bMax: 3,
    slope: 2/3,
  },
  {
    dir: 'y', // whichever
    bInc: 1,
    bMax: 1,
    slope: 1,
  },
  {
    dir: 'y',
    bInc: 2,
    bMax: 3,
    slope: 3/2,
  },
  {
    dir: 'y',
    bInc: 1,
    bMax: 2,
    slope: 2,
  },
  {
    dir: 'y',
    bInc: 1,
    bMax: 3,
    slope: 3,
  },
]

function processState(bs) {
  let dX = 0, dY = 0;
  let record = motionTable[bs.index];

  let nextState = bs.state + record.bInc;
  let overflow = false;
  if (record.bMax && nextState >= record.bMax) {
    overflow = true;
    nextState -= record.bMax;
  }
  if (record.dir == 'x') {
    dX = 1;
    if (overflow) {
      dY = 1;
    }
  } else {
    dY = 1;
    if (overflow) {
      dX = 1;
    }
  }
  if (!bs.right) {
    dX = -dX;
  }
  if (!bs.down) {
    dY = -dY;
  }
  bs.dX = dX;
  bs.dY = dY;
  bs.nextState = nextState;
}

// Note that these bit assignments are currently specific to anglebounce.js and
// bigbounce.js.

// Don't access color directly; it may be out of date.
class BallState {
  constructor(bm, color) {
//    assert(bm.isSet('BALL_FLAG', color));
    this.bm = bm;
    this.color = color;
    this.right = bm.get('MOVE_R_NOT_L', color);
    this.down = bm.get('MOVE_D_NOT_U', color);
    this.state = bm.get('MOVE_STATE', color);
    this.index = bm.get('MOVE_INDEX', color);
    if (this.bm.hasKey('DECIMATOR', 'BALL')) {
      this.decimator = bm.get('DECIMATOR', color);
    }
    if (this.bm.hasKey('BUFFER_X_DEPTH_COUNTER')) {
      this.depthX = bm.get('BUFFER_X_DEPTH_COUNTER', color);
      this.depthY = bm.get('BUFFER_Y_DEPTH_COUNTER', color);
    }
    assert(this.index >= 0 && this.index < motionTable.length);

    processState(this);
  }

  isMotionCycle() {
    return this.decimator;
  }

  static create(bm, right, down, index, state, baseColor) {
    let color = baseColor;
    color = bm.set('MOVE_R_NOT_L', color, right);
    color = bm.set('MOVE_D_NOT_U', color, down);
    color = bm.set('MOVE_INDEX', color, index);
    color = bm.set('MOVE_STATE', color, state);
    return new BallState(bm, color);
  }

  reflect(axis) {
    if (axis === 'x') {
      this.right = this.right ^ 1;
    }
    else if (axis === 'y') {
      this.down = this.down ^ 1;
    } else {
      assert(false);
    }
  }

  bounce(axis, paddlePixel) {
    if (!this.index) {
      // It's level, so pretend the slope matches the paddle direction.
      this.down = paddlePixel > 3 ? 1 : 0;
    }
    let setIndex = false;
    if (paddlePixel !== undefined) {
      assert(axis === 'x');
      switch (paddlePixel) {
        case -1:
        case 8:
          if ((this.down !== 0) !== (paddlePixel === 8)) {
            this.down = this.down ^ 1;
          }
          this.index = 7;
          setIndex = true;
          break;
        case 0:
        case 7:
          if ((this.down !== 0) === (paddlePixel === 7)) {
            this.index = Math.min(this.index + 3, 7);
          } else {
            this.index = this.index - 3;
            if (this.index < 0) {
              this.index = -this.index;
              this.down = this.down ^ 1;
            }
          }
          setIndex = true;
          break;
        case 1:
        case 6:
          if ((this.down !== 0) === (paddlePixel === 6)) {
            this.index = Math.min(this.index + 2, 7);
          } else {
            this.index = this.index - 2;
            if (this.index < 0) {
              this.index = -this.index;
              this.down = this.down ^ 1;
            }
          }
          setIndex = true;
          break;
        case 2:
        case 5:
          if ((this.down !== 0) === (paddlePixel === 5)) {
            this.index = Math.min(this.index + 1, 7);
          } else {
            this.index = this.index - 1;
            if (this.index < 0) {
              this.index = -this.index;
              this.down = this.down ^ 1;
            }
          }
          break;
        case 3: // natural reflection
        case 4:
          break;
      }
    }
    if (axis === 'x') {
      this.right = this.right ^ 1;
    }
    else if (axis === 'y') {
      this.down = this.down ^ 1;
      processState(this);
    } else {
      assert(false);
    }
    if (setIndex || axis === 'x') {
      // Any time you change index, you may have to update state to a value
      // legal for the new index.  Since we want the ball to come off the paddle
      // the cycle after it hits to avoid duplicate AI messages, we pick a state
      // that forces that.
      this.state = 0;
      processState(this);
      while(Math.abs(this.dX) < 0.5) {
        ++this.state;
        processState(this);
      }
    }
  }

  getDepthX() {
    return this.depthX;
  }

  getDepthY() {
    return this.depthY;
  }

  setDepthX(d) {
    this.depthX = d;
  }

  setDepthY(d) {
    this.depthY = d;
  }

  incDepthX() {
    ++this.depthX;
  }

  incDepthY() {
    ++this.depthY;
  }

  decDepthX() {
    assert(this.depthX > 0);
    --this.depthX;
  }

  decDepthY() {
    assert(this.depthY > 0);
    --this.depthY;
  }

  getSlope() {
    return motionTable[this.index].slope;
  }

  getColor() {
    let color = this.color;
    color = this.bm.set('MOVE_R_NOT_L', color, this.right);
    color = this.bm.set('MOVE_D_NOT_U', color, this.down);
    if (this.bm.hasKey('BUFFER_X_DEPTH_COUNTER')) {
      color = this.bm.set('BUFFER_X_DEPTH_COUNTER', color, this.depthX);
      color = this.bm.set('BUFFER_Y_DEPTH_COUNTER', color, this.depthY);
    }
    color = this.bm.set('MOVE_STATE', color, this.state);
    color = this.bm.set('MOVE_INDEX', color, this.index);
    return color;
  }

  nextColor() {
    let color = this.getColor();
    color = this.bm.set('MOVE_STATE', color, this.nextState);
    return color;
  }
}

window.BallState = BallState
})();
