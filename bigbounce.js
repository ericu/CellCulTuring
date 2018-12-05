"use strict";

(function () {
  nsGlobal = new Namespace();
  let bm = new BitManager(nsGlobal);
  const BALL_SIZE_BITS = 2;
  // We need to keep the depth counter from overflowing, so the buffer can't be
  // as deep as 1 << BALL_SIZE_BITS.
  const BALL_SIZE = (1 << BALL_SIZE_BITS) - 1;
  //const BALL_SIZE = 4;
  const BUFFER_X_DEPTH_COUNTER_BITS = BALL_SIZE_BITS;
  const BUFFER_Y_DEPTH_COUNTER_BITS = BALL_SIZE_BITS;
  const BUFFER_SIZE = BALL_SIZE;

  function initBitManager() {
    // Bits are 0xAABBGGRR because of endianness; TODO: Make endian-independent.

    // Sentinel bits that determine type:
    nsGlobal.declare('WALL_FLAG', 1, 7);
    nsGlobal.declare('HIDDEN_BALL_FLAG', 1, 24);
    nsGlobal.declare('DIM_BALL_FLAG', 1, 14);
    nsGlobal.declare('BRIGHT_BALL_FLAG', 1, 15);
    nsGlobal.combine('FULL_BALL_FLAG',
               ['DIM_BALL_FLAG', 'BRIGHT_BALL_FLAG', 'HIDDEN_BALL_FLAG']);

    nsGlobal.declare('FULL_ALPHA', 4, 28); // Leaves 4 low bits free.

    nsGlobal.combine('WALL', ['FULL_ALPHA', 'WALL_FLAG']);
    nsGlobal.combine('HIDDEN_BALL', ['FULL_ALPHA', 'HIDDEN_BALL_FLAG']);
    nsGlobal.combine('FULL_BALL', ['FULL_ALPHA', 'FULL_BALL_FLAG']);
    nsGlobal.combine('DIM_BALL', ['FULL_ALPHA', 'DIM_BALL_FLAG']);
    nsGlobal.alias('BACKGROUND', 'FULL_ALPHA');

    // Used only by the ball.
    nsGlobal.declare('BUFFER_X_DEPTH_COUNTER', BUFFER_X_DEPTH_COUNTER_BITS,
               28 - BUFFER_X_DEPTH_COUNTER_BITS); // Take over low alpha bits.
    nsGlobal.declare('BUFFER_Y_DEPTH_COUNTER', BUFFER_Y_DEPTH_COUNTER_BITS,
               20); // Steal mid-range wall bits for now.
    nsGlobal.declare('MOVE_R_NOT_L', 1, 8); // In ball color for now.
    nsGlobal.declare('MOVE_D_NOT_U', 1, 9); // In ball color for now.
    nsGlobal.declare('MOVE_STATE', 2, 10);
    nsGlobal.declare('MOVE_INDEX', 3, 16); // Steal bits from wall.

    // Used by background and ball [since the ball has to replace the background
    // bits it runs over].
    nsGlobal.declare('BUFFER_X_FLAG', 1, 0);
    nsGlobal.declare('BUFFER_Y_FLAG', 1, 1);
    nsGlobal.combine('BUFFER_FLAGS', ['BUFFER_X_FLAG', 'BUFFER_Y_FLAG']);
    nsGlobal.combine('X_MIN_BUFFER', ['BACKGROUND', 'BUFFER_X_FLAG']);
    nsGlobal.combine('X_MAX_BUFFER', ['BACKGROUND', 'BUFFER_X_FLAG']);
    nsGlobal.combine('Y_MIN_BUFFER', ['BACKGROUND', 'BUFFER_Y_FLAG']);
    nsGlobal.combine('Y_MAX_BUFFER', ['BACKGROUND', 'BUFFER_Y_FLAG']);
    nsGlobal.combine('XY_MAX_BUFFER', ['X_MAX_BUFFER', 'Y_MAX_BUFFER']);
    nsGlobal.combine('XY_MIN_BUFFER', ['X_MIN_BUFFER', 'Y_MIN_BUFFER']);
    nsGlobal.combine('X_MAX_Y_MIN_BUFFER', ['X_MAX_BUFFER', 'Y_MIN_BUFFER']);
    nsGlobal.combine('X_MIN_Y_MAX_BUFFER', ['X_MIN_BUFFER', 'Y_MAX_BUFFER']);
  }

  function isWall (c) {
    return nsGlobal.WALL_FLAG.isSet(c);
  }

  function isBackground (c) {
    return !isBall(c) && !isWall(c);
  }

  function isBall (c) {
    return nsGlobal.FULL_BALL_FLAG.get(c) !== 0;
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

    c.fillRect(nsGlobal.BACKGROUND.getMask(), 0, 0, canvas.width, canvas.height);
    c.strokeRect(nsGlobal.WALL.getMask(), 0, 0, canvas.width - 1, canvas.height - 1);

    // Buffer regions
    c.fillRect(nsGlobal.X_MIN_BUFFER.getMask(), originX, originY + BUFFER_SIZE,
               BUFFER_SIZE, height - 2 * BUFFER_SIZE);
    c.fillRect(nsGlobal.X_MAX_BUFFER.getMask(), originX + width - BUFFER_SIZE,
               originY + BUFFER_SIZE, BUFFER_SIZE, height - 2 * BUFFER_SIZE);
    c.fillRect(nsGlobal.Y_MIN_BUFFER.getMask(), originX + BUFFER_SIZE, originY,
               width - 2 * BUFFER_SIZE, BUFFER_SIZE);


    c.fillRect(nsGlobal.Y_MAX_BUFFER.getMask(), originX + BUFFER_SIZE,
               originY + height - BUFFER_SIZE,
               width - 2 * BUFFER_SIZE, BUFFER_SIZE);
    c.fillRect(nsGlobal.XY_MIN_BUFFER.getMask(), originX, originY,
               BUFFER_SIZE, BUFFER_SIZE);
    c.fillRect(nsGlobal.XY_MAX_BUFFER.getMask(), originX + width - BUFFER_SIZE,
               originY + height - BUFFER_SIZE,
               BUFFER_SIZE, BUFFER_SIZE);
    c.fillRect(nsGlobal.X_MAX_Y_MIN_BUFFER.getMask(), originX + width - BUFFER_SIZE,
               originY, BUFFER_SIZE, BUFFER_SIZE);
    c.fillRect(nsGlobal.X_MIN_Y_MAX_BUFFER.getMask(), originX,
               originY + height - BUFFER_SIZE,
               BUFFER_SIZE, BUFFER_SIZE);

    // arbitrarily moving ball
    var left = Math.round(canvas.width / 2);
    var top = Math.round(canvas.height / 2);
    const brightColor =
      BallState.create(bm, 1, 1, 4, 0, nsGlobal.FULL_BALL.getMask()).nextColor();
    const dimColor =
      BallState.create(bm, 1, 1, 4, 0, nsGlobal.DIM_BALL.getMask()).nextColor();
    const hiddenColor =
      BallState.create(bm, 1, 1, 4, 0, nsGlobal.HIDDEN_BALL.getMask()).nextColor();
    if (BALL_SIZE === 7) {
      c.fillRect(dimColor, left, top, BALL_SIZE, BALL_SIZE);
      c.fillRect(hiddenColor, left, top, 1, 1);
      c.fillRect(hiddenColor, left, top + BALL_SIZE - 1, 1, 1);
      c.fillRect(hiddenColor, left + BALL_SIZE - 1, top, 1, 1);
      c.fillRect(hiddenColor, left + BALL_SIZE - 1, top + BALL_SIZE - 1, 1, 1);
      c.fillRect(brightColor, left + 2, top, BALL_SIZE - 4, BALL_SIZE);
      c.fillRect(brightColor, left, top + 2, BALL_SIZE, BALL_SIZE - 4);
      c.fillRect(brightColor, left + 1, top + 1, BALL_SIZE - 2, BALL_SIZE - 2);
    } else if (BALL_SIZE === 4) {
      const CHOICE = 3
      switch (CHOICE) {
        case 0:
          c.fillRect(hiddenColor, left, top, BALL_SIZE, BALL_SIZE);
          c.fillRect(brightColor, left + 1, top, BALL_SIZE - 2, BALL_SIZE);
          c.fillRect(brightColor, left, top + 1, BALL_SIZE, BALL_SIZE - 2);
          break;
        case 1:
          c.fillRect(hiddenColor, left, top, BALL_SIZE, BALL_SIZE);
          c.fillRect(dimColor, left + 1, top, BALL_SIZE - 2, BALL_SIZE);
          c.fillRect(dimColor, left, top + 1, BALL_SIZE, BALL_SIZE - 2);
          c.fillRect(brightColor, left + 1, top + 1, 2, 2);
          break;
        case 2:
          c.fillRect(dimColor, left, top, BALL_SIZE, BALL_SIZE);
          c.fillRect(brightColor, left + 1, top, BALL_SIZE - 2, BALL_SIZE);
          c.fillRect(brightColor, left, top + 1, BALL_SIZE, BALL_SIZE - 2);
          break;
        case 3:
          c.fillRect(dimColor, left, top, BALL_SIZE, BALL_SIZE);
          c.fillRect(brightColor, left + 1, top + 1, BALL_SIZE - 2, BALL_SIZE -
                     2);
          break;
        default:
          assert(false);
      }

    } else if (BALL_SIZE === 3) {
      const CHOICE = 2
      switch (CHOICE) {
        case 0:
          c.fillRect(hiddenColor, left, top, BALL_SIZE, BALL_SIZE);
          c.fillRect(dimColor, left + 1, top, 1, BALL_SIZE);
          c.fillRect(dimColor, left, top + 1, BALL_SIZE, 1);
          c.fillRect(brightColor, left + 1, top + 1, 1, 1);
          break;
        case 1:
          c.fillRect(brightColor, left, top, BALL_SIZE, BALL_SIZE);
          break;
        case 2:
          c.fillRect(dimColor, left, top, BALL_SIZE, BALL_SIZE);
          c.fillRect(brightColor, left + 1, top + 1, 1, 1);
          break;
        case 3:
          c.fillRect(brightColor, left, top, BALL_SIZE, BALL_SIZE);
          c.fillRect(dimColor, left + 1, top + 1, 1, 1);
          break;
        case 4:
          c.fillRect(hiddenColor, left, top, BALL_SIZE, BALL_SIZE);
          c.fillRect(brightColor, left + 1, top, 1, BALL_SIZE);
          c.fillRect(brightColor, left, top + 1, BALL_SIZE, 1);
          c.fillRect(dimColor, left + 1, top + 1, 1, 1);
          break;
        case 5:
          c.fillRect(hiddenColor, left, top, BALL_SIZE, BALL_SIZE);
          c.fillRect(brightColor, left + 1, top, 1, BALL_SIZE);
          c.fillRect(brightColor, left, top + 1, BALL_SIZE, 1);
          break;
        case 6:
          c.fillRect(dimColor, left, top, BALL_SIZE, BALL_SIZE);
          c.fillRect(brightColor, left + 1, top, 1, BALL_SIZE);
          c.fillRect(brightColor, left, top + 1, BALL_SIZE, 1);
          break;
        default:
          assert(false);
      }
    } else {
      c.fillRect(brightColor, left, top, BALL_SIZE, BALL_SIZE);
    }
  }

  function getBufferBits(data, bs) {
    function testBounds(lower, current, higher, flag,
                        bsDepth, bsDir) {
      assert(BUFFER_SIZE === 3);
      if (isWall(lower)) {
        return 'min';
      }
      if (isWall(higher)) {
        return 'max';
      }
      if (!nsGlobal[flag].get(higher)) {
        return 'min';
      }
      if (!nsGlobal[flag].get(lower)) {
        return 'max';
      }
      // The only ball pixels that land on the middle buffer cell are:
      // 1) the pixel that just bounced off the wall;
      // 2) the leading pixel on its way in;
      // 3) the second pixel on its way in.
      if (bsDepth === BUFFER_SIZE) {
        return bsDir > 0 ? 'min' : 'max';
      }
      return bsDir > 0 ? 'max' : 'min';
    }

    // bs is the ball which is going to land where we are.
    // If we're in a buffer of any kind, we need to know which, to be able to
    // tell if we need to increment or decrement our depth counters, bounce,
    // etc.
    let current = data[4];
    let bufferX = nsGlobal.BUFFER_X_FLAG.get(current);
    let bufferY = nsGlobal.BUFFER_Y_FLAG.get(current);
    let bufferXDir = null;
    let bufferYDir = null;
    if (bufferX) {
      bufferXDir = testBounds(data[3], current, data[5], 'BUFFER_X_FLAG',
                              bs.depthX, bs.right);
    }
    if (bufferY) {
      bufferYDir = testBounds(data[1], current, data[7], 'BUFFER_Y_FLAG',
                              bs.depthY, bs.down);
    }
    return {
      xMin: bufferXDir === 'min',
      yMin: bufferYDir === 'min',
      xMax: bufferXDir === 'max',
      yMax: bufferYDir === 'max',
    };
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
        let bs = new BallState(bm, color);
        let source = sourceDirectionFromIndex(i);
        if (source.dX === bs.dX && source.dY === bs.dY) {
          let allMotions = _(data)
            .filter(d => isBall(d))
            .map(b => new BallState(bm, b))
            .value();
          let maxDepthX = _(allMotions)
            .map(m => m.getDepthX())
            .max();
          let maxDepthY = _(allMotions)
            .map(m => m.getDepthY())
            .max();
          bs.setDepthX(maxDepthX);
          bs.setDepthY(maxDepthY);
          // It's a hit; lets see if it's also bouncing or in a buffer.
          let bufferBits = getBufferBits(data, bs);
          let bufferXMin = bufferBits.xMin;
          let bufferXMax = bufferBits.xMax;
          let bufferYMin = bufferBits.yMin;
          let bufferYMax = bufferBits.yMax;
          let bufferFlags = nsGlobal.BUFFER_FLAGS.get(current);

          if (bs.dX > 0 && bufferXMax) {
            bs.incDepthX();
          } else if (bs.dX < 0 && bufferXMin) {
            bs.incDepthX();
          } else if (bs.getDepthX() && bs.dX > 0 && !bufferXMax) {
            bs.decDepthX();
          } else if (bs.getDepthX() && bs.dX < 0 && !bufferXMin) {
            bs.decDepthX();
          }
          if (bs.dY > 0 && bufferYMax) {
            bs.incDepthY();
          } else if (bs.dY < 0 && bufferYMin) {
            bs.incDepthY();
          } else if (bs.getDepthY() && bs.dY > 0 && !bufferYMax) {
            bs.decDepthY();
          } else if (bs.getDepthY() && bs.dY < 0 && !bufferYMin) {
            bs.decDepthY();
          }
          if (bs.getDepthX() >= BUFFER_SIZE) {
            assert(bs.getDepthX() <= BUFFER_SIZE);
            bs.reflectAngleInc('x')
          }
          if (bs.getDepthY() >= BUFFER_SIZE) {
            assert(bs.getDepthY() <= BUFFER_SIZE);
            bs.reflectAngleInc('y')
          }
          let nextColor = bs.nextColor();
          nextColor = nsGlobal.BUFFER_FLAGS.set(nextColor, bufferFlags);
          return nextColor;
        }
      }
    }
    let bufferFlags = nsGlobal.BUFFER_FLAGS.get(current);
    let background = nsGlobal.BACKGROUND.getMask()
    let nextColor = nsGlobal.BUFFER_FLAGS.set(background, bufferFlags);
    return nextColor;
  }

  registerAnimation("big bounce", initBigBounce, bigBounce);

})();
