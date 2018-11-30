"use strict";

(function () {
  let bm;
  const BALL_SIZE_BITS = 2;
  // We need to keep the depth counter from overflowing, so the buffer can't be
  // as deep as 1 << BALL_SIZE_BITS.
  const BALL_SIZE = (1 << BALL_SIZE_BITS) - 1;
  //const BALL_SIZE = 4;
  const BUFFER_X_DEPTH_COUNTER_BITS = BALL_SIZE_BITS;
  const BUFFER_Y_DEPTH_COUNTER_BITS = BALL_SIZE_BITS;
  const BUFFER_SIZE = BALL_SIZE;

  function initBitManager() {
    bm = new BitManager();

    // Bits are 0xAABBGGRR because of endianness; TODO: Make endian-independent.

    // Sentinel bits that determine type:
    bm.declare('WALL_FLAG', 1, 7);
    bm.declare('HIDDEN_BALL_FLAG', 1, 24);
    bm.declare('DIM_BALL_FLAG', 1, 14);
    bm.declare('BRIGHT_BALL_FLAG', 1, 15);
    bm.combine('FULL_BALL_FLAG',
               ['DIM_BALL_FLAG', 'BRIGHT_BALL_FLAG', 'HIDDEN_BALL_FLAG']);

    bm.declare('FULL_ALPHA', 4, 28); // Leaves 4 low bits free.

    bm.combine('WALL', ['FULL_ALPHA', 'WALL_FLAG']);
    bm.combine('HIDDEN_BALL', ['FULL_ALPHA', 'HIDDEN_BALL_FLAG']);
    bm.combine('FULL_BALL', ['FULL_ALPHA', 'FULL_BALL_FLAG']);
    bm.combine('DIM_BALL', ['FULL_ALPHA', 'DIM_BALL_FLAG']);
    bm.alias('BACKGROUND', 'FULL_ALPHA');

    // Used only by the ball.
    bm.declare('BUFFER_X_DEPTH_COUNTER', BUFFER_X_DEPTH_COUNTER_BITS,
               28 - BUFFER_X_DEPTH_COUNTER_BITS); // Take over low alpha bits.
    bm.declare('BUFFER_Y_DEPTH_COUNTER', BUFFER_Y_DEPTH_COUNTER_BITS,
               20); // Steal mid-range wall bits for now.
    bm.declare('MOVE_R_NOT_L', 1, 8); // In ball color for now.
    bm.declare('MOVE_D_NOT_U', 1, 9); // In ball color for now.
    bm.declare('MOVE_STATE', 2, 10);
    bm.declare('MOVE_INDEX', 3, 16); // Steal bits from wall.

    // Used by background and ball [since the ball has to replace the background
    // bits it runs over].
    bm.declare('BUFFER_X_MIN_FLAG', 1, 0);
    bm.declare('BUFFER_Y_MIN_FLAG', 1, 1);
    bm.declare('BUFFER_X_MAX_FLAG', 1, 2);
    bm.declare('BUFFER_Y_MAX_FLAG', 1, 3);
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
    return bm.get('FULL_BALL_FLAG', c) !== 0;
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
    var left = Math.round(canvas.width / 2);
    var top = Math.round(canvas.height / 2);
    const brightColor =
      BallState.create(bm, 1, 1, 4, 0, bm.getMask('FULL_BALL')).nextColor();
    const dimColor =
      BallState.create(bm, 1, 1, 4, 0, bm.getMask('DIM_BALL')).nextColor();
    const hiddenColor =
      BallState.create(bm, 1, 1, 4, 0, bm.getMask('HIDDEN_BALL')).nextColor();
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

  function getBufferBits(data, bs, ballIndex) {
    let current = data[4];
    // bs is the ball at pixel ballIndex which is going to land where we are.
    // If we're in a buffer of any kind, we need to know which, to be able to
    // tell if we need to increment or decrement our depth counters, bounce,
    // etc.
    let bufferX = bm.get('BUFFER_X_FLAG', current);
    let bufferY = bm.get('BUFFER_Y_FLAG', current);
    // TODO
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
          let bufferXMin = bm.get('BUFFER_X_MIN_FLAG', current);
          let bufferXMax = bm.get('BUFFER_X_MAX_FLAG', current);
          let bufferYMin = bm.get('BUFFER_Y_MIN_FLAG', current);
          let bufferYMax = bm.get('BUFFER_Y_MAX_FLAG', current);
          let bufferFlags = bm.get('BUFFER_FLAGS', current);

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

  registerAnimation("big bounce", initBigBounce, bigBounce);

})();
