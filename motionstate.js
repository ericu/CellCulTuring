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
  },
  {
    dir: 'x',
    bInc: 1,
    bMax: 3,
  },
  {
    dir: 'x',
    bInc: 1,
    bMax: 2,
  },
  {
    dir: 'x',
    bInc: 2,
    bMax: 3,
  },
  {
    dir: 'y', // whichever
    bInc: 1,
    bMax: 1,
  },
  {
    dir: 'y',
    bInc: 2,
    bMax: 3,
  },
  {
    dir: 'y',
    bInc: 1,
    bMax: 2,
  },
  {
    dir: 'y',
    bInc: 1,
    bMax: 3,
  },
]

class MotionState {
  constructor(color) {
//    assert(isBall(this.color);
    this.color = color;
    this.right = bm.get('MOVE_R_NOT_L', color);
    this.down = bm.get('MOVE_D_NOT_U', color);
    this.state = bm.get('MOVE_STATE', color);
    this.index = bm.get('MOVE_INDEX', color);
    assert(this.index >= 0 && this.index < motionTable.length);

    let dX = 0, dY = 0;
    let record = motionTable[this.index];

    let nextState = this.state + record.bInc;
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
    if (!this.right) {
      dX = -dX;
    }
    if (!this.down) {
      dY = -dY;
    }
    this.dX = dX;
    this.dY = dY;
    this.nextState = nextState;
  }

  static create(right, down, index, state) {
    let color = bm.getMask('C_BALL');
    color = bm.set('MOVE_R_NOT_L', color, right);
    color = bm.set('MOVE_D_NOT_U', color, down);
    color = bm.set('MOVE_INDEX', color, index);
    color = bm.set('MOVE_STATE', color, state);
    return new MotionState(color);
  }

  reflect(axis) {
    if (axis === 'x') {
      this.right = !this.right;
    }
    else if (axis === 'y') {
      this.down = !this.down;
    } else {
      assert(false);
    }
  }

  nextColor() {
    let color = this.color;
    color = bm.set('MOVE_R_NOT_L', color, this.right);
    color = bm.set('MOVE_D_NOT_U', color, this.down);
    color = bm.set('MOVE_STATE', color, this.nextState);
    return color;
  }
}

window.MotionState = MotionState
})();
