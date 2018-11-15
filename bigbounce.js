"use strict";

(function () {
  let bm;
  const BALL_SIZE_BITS = 3;
  // We need to keep the depth counter from overflowing, so the buffer can't be
  // as deep as 1 << BALL_SIZE_BITS.
  const BALL_SIZE = (1 << BALL_SIZE_BITS) - 1;
  const BUFFER_X_DEPTH_COUNTER_BITS = BALL_SIZE_BITS;
  const BUFFER_Y_DEPTH_COUNTER_BITS = BALL_SIZE_BITS;
  const BUFFER_SIZE = BALL_SIZE;

  function initBitManager() {
    bm = new BitManager();

    // Bits are 0xAABBGGRR because of endianness; TODO: Make endian-independent.

    // Sentinel bits that determine type:
    bm.declare('WALL_FLAG', 1, 7);
    bm.declare('BALL_FLAG', 2, 14); // Could use 1 bit, but it's rather dim.

    bm.declare('FULL_ALPHA', 4, 28); // Leaves 4 low bits free.

    bm.combine('WALL', ['FULL_ALPHA', 'WALL_FLAG']);
    bm.combine('BALL', ['FULL_ALPHA', 'BALL_FLAG']);
    bm.alias('BACKGROUND', 'FULL_ALPHA');

    // Used only by the ball.
    bm.declare('BUFFER_X_DEPTH_COUNTER', BUFFER_X_DEPTH_COUNTER_BITS,
               28 - BUFFER_X_DEPTH_COUNTER_BITS); // Take over low alpha bits.
    bm.declare('BUFFER_Y_DEPTH_COUNTER', BUFFER_Y_DEPTH_COUNTER_BITS,
               20); // Steal mid-range wall bits for now.
    bm.declare('MOVE_R_NOT_L', 1, 8); // In ball color for now.
    bm.declare('MOVE_D_NOT_U', 1, 9); // In ball color for now.
    bm.declare('MOVE_STATE', 2, 10);
    bm.declare('MOVE_INDEX', 4, 16); // Steal bits from wall.

    // Used by background and ball [since the ball has to replace the background
    // bits it runs over].
    bm.declare('BUFFER_X_MIN_FLAG', 1, 3);
    bm.declare('BUFFER_Y_MIN_FLAG', 1, 4);
    bm.declare('BUFFER_X_MAX_FLAG', 1, 5);
    bm.declare('BUFFER_Y_MAX_FLAG', 1, 6);
    bm.combine('BUFFER_FLAGS', ['BUFFER_X_MIN_FLAG', 'BUFFER_Y_MIN_FLAG',
                                'BUFFER_X_MAX_FLAG', 'BUFFER_Y_MAX_FLAG']);
    bm.combine('X_MIN_BUFFER', ['BACKGROUND', 'BUFFER_X_MIN_FLAG']);
    bm.combine('X_MAX_BUFFER', ['BACKGROUND', 'BUFFER_X_MAX_FLAG']);
    bm.combine('Y_MIN_BUFFER', ['BACKGROUND', 'BUFFER_Y_MIN_FLAG']);
    bm.combine('Y_MAX_BUFFER', ['BACKGROUND', 'BUFFER_Y_MAX_FLAG']);
    bm.combine('XY_MAX_BUFFER', ['X_MAX_BUFFER', 'Y_MAX_BUFFER']);
    bm.combine('XY_MIN_BUFFER', ['X_MIN_BUFFER', 'Y_MIN_BUFFER']);
    bm.combine('X_MAX_Y_MIN_BUFFER', ['X_MAX_BUFFER', 'Y_MIN_BUFFER']);
    bm.combine('X_MIN_Y_MAX_BUFFER', ['X_MIN_BUFFER', 'Y_MAX_BUFFER']);
  }

  function isWall (c) {
    return bm.isSet('WALL_FLAG', c);
  }

  function isBackground (c) {
    return !isBall(c) && !isWall(c);
  }

  function isBall (c) {
    return bm.isSet('BALL_FLAG', c);
  }

  let styleBm;
  function styleFromUint(u) {
    if (!styleBm) {
      styleBm = new BitManager();
      styleBm.declare('A', 8, 24);
      styleBm.declare('B', 8, 16);
      styleBm.declare('G', 8, 8);
      styleBm.declare('R', 8, 0);
    }

    let a = styleBm.get('A', u) / 255;
    let b = styleBm.get('B', u);
    let g = styleBm.get('G', u);
    let r = styleBm.get('R', u);
    return `rgba(${r},${g},${b},${a})`
  }

  function sourceDirectionFromIndex(i) {
    let dirBits;
    switch (i) {
      case 0:
        return { dX:  1, dY:  1 };
      case 1:
        return { dX:  0, dY:  1 };
      case 2:
        return { dX: -1, dY:  1 };
      case 3:
        return { dX:  1, dY:  0 };
      case 4:
        return { dX:  0, dY:  0 };
      case 5:
        return { dX: -1, dY:  0 };
      case 6:
        return { dX:  1, dY: -1 };
      case 7:
        return { dX:  0, dY: -1 };
      case 8:
        return { dX: -1, dY: -1 };
      default: assert(false);
    }
  }

  function initBigBounce(c) {
    initBitManager();

    // We fill the whole canvas, then put a wall around that corresponds to the
    // originX/originY/width/height sentinel frame.

    c.fillRect(bm.getMask('BACKGROUND'), 0, 0, canvas.width, canvas.height);
    c.strokeRect(bm.getMask('WALL'), 0, 0, canvas.width - 1, canvas.height - 1);

    // Buffer regions
    c.fillRect(bm.getMask('X_MIN_BUFFER'), originX, originY + BUFFER_SIZE,
               BUFFER_SIZE, height - 2 * BUFFER_SIZE);
    c.fillRect(bm.getMask('X_MAX_BUFFER'), originX + width - BUFFER_SIZE,
               originY + BUFFER_SIZE, BUFFER_SIZE, height - 2 * BUFFER_SIZE);
    c.fillRect(bm.getMask('Y_MIN_BUFFER'), originX + BUFFER_SIZE, originY,
               width - 2 * BUFFER_SIZE, BUFFER_SIZE);


    c.fillRect(bm.getMask('Y_MAX_BUFFER'), originX + BUFFER_SIZE,
               originY + height - BUFFER_SIZE,
               width - 2 * BUFFER_SIZE, BUFFER_SIZE);
    c.fillRect(bm.getMask('XY_MIN_BUFFER'), originX, originY,
               BUFFER_SIZE, BUFFER_SIZE);
    c.fillRect(bm.getMask('XY_MAX_BUFFER'), originX + width - BUFFER_SIZE,
               originY + height - BUFFER_SIZE,
               BUFFER_SIZE, BUFFER_SIZE);
    c.fillRect(bm.getMask('X_MAX_Y_MIN_BUFFER'), originX + width - BUFFER_SIZE,
               originY, BUFFER_SIZE, BUFFER_SIZE);
    c.fillRect(bm.getMask('X_MIN_Y_MAX_BUFFER'), originX,
               originY + height - BUFFER_SIZE,
               BUFFER_SIZE, BUFFER_SIZE);

    // arbitrarily moving ball
    var ms = MotionState.create(bm, 1, 1, 7, 0);
    var left = Math.round(canvas.width / 2);
    var top = Math.round(canvas.height / 2);
    var color = ms.nextColor();
    if (BALL_SIZE === 7) {
      // TODO: This doesn't work.  If we move at a 45-degree angle, the leading
      // rounded corner pixel can't see its neighbors, so it can't inherit their
      // depth, and the ball breaks at bounce.  We'd need to fill out the square
      // with darker-but-still-ball pixels to make that work.
      c.fillRect(color, left + 2, top, BALL_SIZE - 4, BALL_SIZE);
      c.fillRect(color, left, top + 2, BALL_SIZE, BALL_SIZE - 4);
      c.fillRect(color, left + 1, top + 1, BALL_SIZE - 2, BALL_SIZE - 2);
    } else {
      c.fillRect(color, left, top, BALL_SIZE, BALL_SIZE);
    }
  }

  function bigBounce(data, x, y) {
    const current = data[4];

    if (isWall(current)) {
      return current;
    }
    // Both ball and background need to handle incoming ball pixels.
    for (let i = 0; i < 9; ++i) {
      let color = data[i];
      if (isBall(color)) {
        // With a diagonal entry to the buffer, a trailing ball pixel moving
        // into the buffer for the first time [so no depth count] can hit a
        // buffer pixel [so no depth count] even if it's time to bounce.  We
        // need to check all neighboring ball pixels and take the highest depth
        // on the way in; they'll all match on the way out.
        let ms = new MotionState(bm, color);
        let source = sourceDirectionFromIndex(i);
        if (source.dX === ms.dX && source.dY === ms.dY) {
          let allMotions = _(data)
            .filter(d => isBall(d))
            .map(b => new MotionState(bm, b))
            .value();
          let maxDepthX = _(allMotions)
            .map(m => m.getDepthX())
            .max();
          let maxDepthY = _(allMotions)
            .map(m => m.getDepthY())
            .max();
          ms.setDepthX(maxDepthX);
          ms.setDepthY(maxDepthY);
          // It's a hit; lets see if it's also bouncing or in a buffer.
          let bufferXMin = bm.get('BUFFER_X_MIN_FLAG', current);
          let bufferXMax = bm.get('BUFFER_X_MAX_FLAG', current);
          let bufferYMin = bm.get('BUFFER_Y_MIN_FLAG', current);
          let bufferYMax = bm.get('BUFFER_Y_MAX_FLAG', current);
          let bufferFlags = bm.get('BUFFER_FLAGS', current);

          let tempChangedDepth = false;
          if (ms.dX > 0 && bufferXMax) {
            ms.incDepthX();
            tempChangedDepth = true;
          } else if (ms.dX < 0 && bufferXMin) {
            ms.incDepthX();
            tempChangedDepth = true;
          } else if (ms.getDepthX() && ms.dX > 0 && !bufferXMax) {
            ms.decDepthX();
            tempChangedDepth = true;
          } else if (ms.getDepthX() && ms.dX < 0 && !bufferXMin) {
            ms.decDepthX();
            tempChangedDepth = true;
          }
          if (ms.dY > 0 && bufferYMax) {
            ms.incDepthY();
            tempChangedDepth = true;
          } else if (ms.dY < 0 && bufferYMin) {
            ms.incDepthY();
            tempChangedDepth = true;
          } else if (ms.getDepthY() && ms.dY > 0 && !bufferYMax) {
            ms.decDepthY();
            tempChangedDepth = true;
          } else if (ms.getDepthY() && ms.dY < 0 && !bufferYMin) {
            ms.decDepthY();
            tempChangedDepth = true;
          }
          if (maxDepthX || maxDepthY || tempChangedDepth) {
            let output = ''
            _.forEach(data, d => {
                      if (isBall(d)) {
                        let ms = new MotionState(bm, d)
                        output += `(${ms.getDepthX()},${ms.getDepthY()})`
                      } else {
                        output += '(-,-)'
                      }
                      })
            console.log(output)
            console.log('depths after', ms.getDepthX(), ms.getDepthY());
          }
          if (ms.getDepthX() >= BUFFER_SIZE) {
            assert(ms.getDepthX() <= BUFFER_SIZE);
            ms.reflect('x')
            ms.index = (ms.index + 1) % 8;
            // when changing index, reset state to stay valid
            ms.nextState = 0;
            while(Math.abs(new MotionState(bm, ms.nextColor()).dX) < 0.5) {
              ++ms.nextState;
            }
          }
          if (ms.getDepthY() >= BUFFER_SIZE) {
            assert(ms.getDepthY() <= BUFFER_SIZE);
            ms.reflect('y')
            ms.index = ms.index + 1;
            if (ms.index >=8) {
              ms.index = 1; // Don't go horizontal from top or bottom bounce.
            }
            // when changing index, reset state to stay valid
            ms.nextState = 0;
            while(Math.abs(new MotionState(bm, ms.nextColor()).dY) < 0.5) {
              ++ms.nextState;
            }
          }
          let nextColor = ms.nextColor();
          nextColor = bm.set('BUFFER_FLAGS', nextColor, bufferFlags);
          return nextColor;
        }
      }
    }
    let bufferFlags = bm.get('BUFFER_FLAGS', current);
    let background = bm.getMask('BACKGROUND')
    let nextColor = bm.set('BUFFER_FLAGS', background, bufferFlags);
    return nextColor;
  }

  window.addEventListener(
    "load",
    () => window.registerAnimation("big bounce", initBigBounce,
                                   bigBounce));

})();
