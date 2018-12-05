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
    bm = new BitManager(new Namespace());

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
    bm.declare('BUFFER_X_FLAG', 1, 0);
    bm.declare('BUFFER_Y_FLAG', 1, 1);
    bm.combine('BUFFER_FLAGS', ['BUFFER_X_FLAG', 'BUFFER_Y_FLAG']);
    bm.combine('X_MIN_BUFFER', ['BACKGROUND', 'BUFFER_X_FLAG']);
    bm.combine('X_MAX_BUFFER', ['BACKGROUND', 'BUFFER_X_FLAG']);
    bm.combine('Y_MIN_BUFFER', ['BACKGROUND', 'BUFFER_Y_FLAG']);
    bm.combine('Y_MAX_BUFFER', ['BACKGROUND', 'BUFFER_Y_FLAG']);
    bm.combine('XY_MAX_BUFFER', ['X_MAX_BUFFER', 'Y_MAX_BUFFER']);
    bm.combine('XY_MIN_BUFFER', ['X_MIN_BUFFER', 'Y_MIN_BUFFER']);
    bm.combine('X_MAX_Y_MIN_BUFFER', ['X_MAX_BUFFER', 'Y_MIN_BUFFER']);
    bm.combine('X_MIN_Y_MAX_BUFFER', ['X_MIN_BUFFER', 'Y_MAX_BUFFER']);

    bm.declare('SIDE_WALL_FLAG', 1, 5);
    bm.declare('TOP_WALL_FLAG', 1, 4);
    bm.declare('MESSAGE_R_NOT_L', 1, 3);
    bm.declare('MESSAGE_PRESENT', 1, 6);
    bm.combine('MESSAGE_BITS', ['MESSAGE_PRESENT', 'MESSAGE_R_NOT_L']);

    bm.declare('TOP_WALL_CENTER_FLAG', 1, 19);
    bm.alias('SIGNAL_DOWN_ACTIVE_FLAG', 'MESSAGE_PRESENT');
    bm.declare('RESPAWN_FLAG', 1, 23);
    bm.declare('RESPAWN_PHASE_2_FLAG', 1, 2);

    bm.combine('RETAINED_BACKGROUND_BITS', ['RESPAWN_FLAG', 'BACKGROUND']);
    bm.dumpStatus();  
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

  function isRespawn(c) {
    return isBackground(c) && bm.isSet('RESPAWN_FLAG', c);
  }

  function isCenterRespawn(data) {
    assert(_.isArray(data));
    return _.every(data, isRespawn);
  }

  function isTopWallCenter(c) {
    return isWall(c) && bm.isSet('TOP_WALL_CENTER_FLAG', c);
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

  function initBigRespawn(c) {
    initBitManager();
    let originX = 1;
    let originY = 1;
    let width = canvas.width - 2;
    let height = canvas.height - 2;
    let halfWidth = Math.floor(width / 2);
    let halfHeight = Math.floor(height / 2);
    let insideWallOriginX = originX + 1;
    let insideWallOriginY = originY + 1;
    let insideWallWidth = width - 2;
    let insideWallHeight = height - 2;

    // We fill the whole canvas, then put a wall around that corresponds to the
    // originX/originY/width/height sentinel frame.

    c.fillRect(bm.getMask('BACKGROUND'), 0, 0, canvas.width, canvas.height);
    c.fillRect(bm.setMask('RESPAWN_FLAG', bm.getMask('BACKGROUND'), true),
               originX + halfWidth - 1, originY + halfHeight - 1,
               BALL_SIZE, BALL_SIZE);


    let color = bm.getMask('WALL');
    c.fillRect(color, originX, height, width, 1);
    c.fillRect(bm.setMask('SIDE_WALL_FLAG', color, true), originX, originY,
               1, height - 1);
    c.fillRect(bm.setMask('SIDE_WALL_FLAG', color, true), originX + width - 1,
               originY, 1,
               height - 1);
    c.fillRect(bm.setMask('TOP_WALL_FLAG', color, true), originX, originY,
               width, 1);
    c.fillRect(bm.setMask('TOP_WALL_CENTER_FLAG', color, true),
               originX + halfWidth,
               originY, 1, 1);

    // Buffer regions
    c.fillRect(bm.getMask('X_MIN_BUFFER'),
               insideWallOriginX, insideWallOriginY + BUFFER_SIZE,
               BUFFER_SIZE, insideWallHeight - 2 * BUFFER_SIZE);
    c.fillRect(bm.getMask('X_MAX_BUFFER'),
               insideWallOriginX + insideWallWidth - BUFFER_SIZE,
               insideWallOriginY + BUFFER_SIZE,
               BUFFER_SIZE, insideWallHeight - 2 * BUFFER_SIZE);
    c.fillRect(bm.getMask('Y_MIN_BUFFER'),
               insideWallOriginX + BUFFER_SIZE, insideWallOriginY,
               insideWallWidth - 2 * BUFFER_SIZE, BUFFER_SIZE);
    c.fillRect(bm.getMask('Y_MAX_BUFFER'),
               insideWallOriginX + BUFFER_SIZE,
               insideWallOriginY + insideWallHeight - BUFFER_SIZE,
               insideWallWidth - 2 * BUFFER_SIZE, BUFFER_SIZE);
    c.fillRect(bm.getMask('XY_MIN_BUFFER'),
               insideWallOriginX, insideWallOriginY,
               BUFFER_SIZE, BUFFER_SIZE);
    c.fillRect(bm.getMask('XY_MAX_BUFFER'),
               insideWallOriginX + insideWallWidth - BUFFER_SIZE,
               insideWallOriginY + insideWallHeight - BUFFER_SIZE,
               BUFFER_SIZE, BUFFER_SIZE);
    c.fillRect(bm.getMask('X_MAX_Y_MIN_BUFFER'), insideWallOriginX +
               insideWallWidth - BUFFER_SIZE,
               insideWallOriginY, BUFFER_SIZE, BUFFER_SIZE);
    c.fillRect(bm.getMask('X_MIN_Y_MAX_BUFFER'), insideWallOriginX,
               insideWallOriginY + insideWallHeight - BUFFER_SIZE,
               BUFFER_SIZE, BUFFER_SIZE);

    // arbitrarily moving ball
    var left = Math.round(canvas.width / 2 + 4);
    var top = Math.round(canvas.height / 2 + 4);
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
      if (!bm.get(flag, higher)) {
        return 'min';
      }
      if (!bm.get(flag, lower)) {
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
    let bufferX = bm.get('BUFFER_X_FLAG', current);
    let bufferY = bm.get('BUFFER_Y_FLAG', current);
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

  function bigRespawn(data, x, y) {
    const current = data[4];

    if (isWall(current)) {
      if (bm.isSet('SIDE_WALL_FLAG', current)) {
        if (bm.isSet('MESSAGE_PRESENT', data[7])) {
          return data[7];
        }
        // Only trigger if we're at the middle of the ball, to prevent
        // duplicate messages.
        let right = false;
        if (_.every([0, 3, 6], i => isBall(data[i])) ||
            (right = _.every([2, 5, 8], i => isBall(data[i])))) {
          var next = bm.set('MESSAGE_PRESENT', current, 1);
          return bm.set('MESSAGE_R_NOT_L', next, right);
        }
      } else if (bm.isSet('TOP_WALL_CENTER_FLAG', current)) {
        if (bm.isSet('MESSAGE_PRESENT', data[5])) {
          assert(bm.get('MESSAGE_R_NOT_L', data[5]) === 0);
          let message = bm.get('MESSAGE_BITS', data[5]);
          return bm.set('MESSAGE_BITS', current, message);
        }
        if (bm.isSet('MESSAGE_PRESENT', data[3])) {
          assert(bm.get('MESSAGE_R_NOT_L', data[3]) === 1);
          let message = bm.get('MESSAGE_BITS', data[3]);
          return bm.set('MESSAGE_BITS', current, message);
        }
      } else if (bm.isSet('TOP_WALL_FLAG', current)) {
        if (bm.isSet('MESSAGE_PRESENT', data[5]) &&
            !bm.isSet('MESSAGE_R_NOT_L', data[5]) &&
            !bm.isSet('TOP_WALL_CENTER_FLAG', data[5])) {
          return data[5];
        }
        if (bm.isSet('MESSAGE_PRESENT', data[3]) &&
            bm.isSet('MESSAGE_R_NOT_L', data[3]) &&
            !bm.isSet('TOP_WALL_CENTER_FLAG', data[3])) {
          return data[3];
        }
        if (bm.isSet('MESSAGE_PRESENT', data[7])) {
          let message = bm.get('MESSAGE_BITS', data[7]);
          return bm.set('MESSAGE_BITS', current, message);
        }
      }
      return bm.set('MESSAGE_BITS', current, 0);
    }
    // Both ball and background need to handle incoming ball pixels.

    // First deal with messages and respawns in the background, then deal with
    // the ball in both.  We won't receive a message and a ball in the same
    // cycle.
    if (isBackground(current) && (isBackground(data[1]) ||
                                  isTopWallCenter(data[1]))) {
      let active = bm.get('SIGNAL_DOWN_ACTIVE_FLAG', data[1]);
      if (active) {
        if (isCenterRespawn(data)) {
          let rightNotL = bm.get('MESSAGE_R_NOT_L', data[1]);
          let retained = bm.get('RETAINED_BACKGROUND_BITS', current);
          let color = bm.set('RETAINED_BACKGROUND_BITS', 0, retained);
          color = bm.set('MESSAGE_R_NOT_L', color, rightNotL);
          color = bm.setMask('RESPAWN_PHASE_2_FLAG', color, true);
          return color;
        } else {
          let message = bm.get('MESSAGE_BITS', data[1]);
          return bm.set('MESSAGE_BITS', current, message);
        }
      }
    }
    if (isRespawn(current)) {
      for (let d of data) {
        if (bm.get('RESPAWN_PHASE_2_FLAG', d)) {
          let rightNotL = bm.get('MESSAGE_R_NOT_L', d);
          let retained = bm.get('RETAINED_BACKGROUND_BITS', current);
          let color = bm.set('RETAINED_BACKGROUND_BITS', 0, retained);
          color = bm.setMask('DIM_BALL', color, true);
          var bs = BallState.create(bm, rightNotL, 1, 5, 0, color);
          let next = bs.getColor();
          if (isCenterRespawn(data)) {
            next = bm.setMask('BRIGHT_BALL_FLAG', next, true);
          }
          return next;
        }
      }
    }

    let bufferFlags = bm.get('BUFFER_FLAGS', current);
    let respawn = bm.get('RESPAWN_FLAG', current);
    for (let i = 0; i < 9; ++i) {
      let color = data[i];
      if (isBall(color)) {
        // With a diagonal entry to the buffer, a trailing ball pixel moving
        // into the buffer for the first time [so no depth count] can hit an
        // edge buffer pixel even if it's time to bounce.  We need to check all
        // neighboring ball pixels and take the highest depth on the way in;
        // they'll all match on the way out.
        let bs = new BallState(bm, color);
        if (!bs.getDepthX() && bm.get('BUFFER_X_FLAG', color) !== 0) {
          // The ball has hit the end wall and should vanish, so ignore it.
          break;
        }
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
            // Mark the ball for destruction.
            bs.setDepthX(0);
          }
          if (bs.getDepthY() >= BUFFER_SIZE) {
            assert(bs.getDepthY() <= BUFFER_SIZE);
            bs.reflectAngleInc('y')
          }
          let nextColor = bs.nextColor();
          nextColor = bm.set('BUFFER_FLAGS', nextColor, bufferFlags);
          nextColor = bm.set('RESPAWN_FLAG', nextColor, respawn);
          return nextColor;
        }
      }
    }
    let background = bm.getMask('BACKGROUND')
    let nextColor = bm.set('BUFFER_FLAGS', background, bufferFlags);
    nextColor = bm.set('RESPAWN_FLAG', nextColor, respawn);
    return nextColor;
  }

  registerAnimation("big respawn", initBigRespawn, bigRespawn);

})();
