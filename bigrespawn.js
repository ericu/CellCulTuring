"use strict";
/* Namespace plan:
  Global
2   ID_0, ID_1
1   High alpha
  Ball
2   BUFFER_X_DEPTH_COUNTER
2   BUFFER_Y_DEPTH_COUNTER
1   MOVE_R_NOT_L
1   MOVE_D_NOT_U
2   MOVE_STATE
3   MOVE_INDEX
1   DECIMATOR
1   Extra ball pixel for appearance [optional]
4   To replace when run over: BUFFER_X_FLAG, BUFFER_Y_FLAG, RESPAWN_FLAG,
                              PADDLE_BUFFER_FLAG.
  Wall
1   SIDE_WALL_FLAG
1   TOP_WALL_FLAG
1   TOP_WALL_CENTER_FLAG
1   MESSAGE_PRESENT
1   MESSAGE_R_NOT_L
  Background
1   SPECIAL_FLAG
1   MESSAGE_PRESENT
1   MESSAGE_R_NOT_L
1   MESSAGE_H_NOT_V
6   MESSAGE_PADDLE_POSITION
    Special
1     RESPAWN_FLAG
1     RESPAWN_PHASE_2_FLAG
1     DECIMATOR
1     Something to indicate the death of a ball [share with
                                                 RESPAWN_PHASE_2_FLAG?]
    Buffer
1     BUFFER_X_FLAG
1     BUFFER_Y_FLAG
  Paddle
1   PADDLE_PIXEL
6   PADDLE_POSITION
3   PADDLE_DEST
2   PADDLE_MOVE_DELAY_COUNTER
1   DECIMATOR

Wow.  Namespacing the bits has saved us a *ton* of bits; we might be able to get
by with a much larger ball!  But let's get it working with a 3x3 ball first.
Then the things that need to scale up are:
BUFFER_X_DEPTH_COUNTER_BITS, BUFFER_Y_DEPTH_COUNTER_BITS, the BUFFER_[XY]_FLAGs
need to turn into something to encode depth [can we use the PADDLE_PIXEL TRICK
THERE TOO?...anything else?  Maybe another shading pixel for the ball's edges?]
*/

let bm;
(function () {
  let nsBall, nsWall, nsBackground, nsGlobal, nsBgSpecial, nsBgBuffer;
  let isWall, isBackground, isBgSpecial, isBgBuffer, isBall, isRespawn;
  let isTopWallCenter;
  let copySets = {};

  const BALL_SIZE_BITS = 2;
  // We need to keep the depth counter from overflowing, so the buffer can't be
  // as deep as 1 << BALL_SIZE_BITS.
  const BALL_SIZE = (1 << BALL_SIZE_BITS) - 1;
  //const BALL_SIZE = 4;
  const BUFFER_X_DEPTH_COUNTER_BITS = BALL_SIZE_BITS;
  const BUFFER_Y_DEPTH_COUNTER_BITS = BALL_SIZE_BITS;
  const BUFFER_SIZE = BALL_SIZE;
  assert(BALL_SIZE === 3); // This is assumed throughout the file.

  function initBitManager() {
    nsGlobal = new Namespace();
    bm = new BitManager(nsGlobal);
    // Bits are 0xAABBGGRR because of endianness; TODO: Make endian-independent.

    nsGlobal.declare('ID_0', 1, 7);
    nsGlobal.declare('ID_1', 1, 23);

    // Sentinel bits that determine type:
    nsGlobal.alias('WALL_FLAG', 'ID_0');
    nsGlobal.alias('BALL_FLAG', 'ID_1');
    nsGlobal.combine('ID_BITS', ['ID_0', 'ID_1']);
    nsGlobal.declare('BACKGROUND_FLAG', 0, 0);

    nsGlobal.declare('FULL_ALPHA', 4, 28);

    nsGlobal.declare('HIDDEN_BALL_FLAG', 1, 24);
    nsGlobal.declare('DIM_BALL_FLAG', 1, 14);
    nsGlobal.declare('BRIGHT_BALL_FLAG', 1, 15);
    nsGlobal.combine('FULL_BALL_FLAG',
               ['DIM_BALL_FLAG', 'BRIGHT_BALL_FLAG', 'HIDDEN_BALL_FLAG']);

    nsGlobal.setSubspaceMask('ID_BITS');
    nsBall = nsGlobal.declareSubspace('BALL', 'BALL_FLAG');
    nsWall = nsGlobal.declareSubspace('WALL', 'WALL_FLAG');
    nsBackground = nsGlobal.declareSubspace('BACKGROUND', 0);

    nsGlobal.combine('WALL', ['FULL_ALPHA', 'WALL_FLAG']);
    nsGlobal.combine('HIDDEN_BALL',
                     ['FULL_ALPHA', 'HIDDEN_BALL_FLAG', 'BALL_FLAG']);
    nsGlobal.combine('FULL_BALL',
                     ['FULL_ALPHA', 'FULL_BALL_FLAG', 'BALL_FLAG']);
    nsGlobal.combine('DIM_BALL', ['FULL_ALPHA', 'DIM_BALL_FLAG', 'BALL_FLAG']);
    nsGlobal.alias('BACKGROUND', 'FULL_ALPHA');

    // Message fields [for wall and background, mostly]
    nsWall.alloc('MESSAGE_R_NOT_L', 1);
    nsBackground.alloc('MESSAGE_R_NOT_L', 1);
    nsWall.alloc('MESSAGE_PRESENT', 1);
    nsBackground.alloc('MESSAGE_PRESENT', 1);
    copySets.RESPAWN_MESSAGE_BITS = ['MESSAGE_PRESENT', 'MESSAGE_R_NOT_L']
    nsWall.combine('RESPAWN_MESSAGE_BITS', copySets.RESPAWN_MESSAGE_BITS);
    nsBackground.combine('RESPAWN_MESSAGE_BITS', copySets.RESPAWN_MESSAGE_BITS);

    // Used only by the ball.
    nsBall.alloc('BUFFER_X_DEPTH_COUNTER', BUFFER_X_DEPTH_COUNTER_BITS);
    nsBall.alloc('BUFFER_Y_DEPTH_COUNTER', BUFFER_Y_DEPTH_COUNTER_BITS);
    nsBall.alloc('MOVE_R_NOT_L', 1);
    nsBall.alloc('MOVE_D_NOT_U', 1);
    nsBall.alloc('MOVE_STATE', 2);
    nsBall.alloc('MOVE_INDEX', 3);

    nsWall.alloc('SIDE_WALL_FLAG', 1);
    nsWall.alloc('TOP_WALL_FLAG', 1);

    nsWall.alloc('TOP_WALL_CENTER_FLAG', 1);
    nsWall.alias('SIGNAL_DOWN_ACTIVE_FLAG', 'MESSAGE_PRESENT');
    nsBackground.alias('SIGNAL_DOWN_ACTIVE_FLAG', 'MESSAGE_PRESENT');

    nsBackground.alloc('SPECIAL_FLAG', 1);
    nsBackground.setSubspaceMask('SPECIAL_FLAG');
    // Initial uses of background subspaces:
    // Special will have RESPAWN_FLAG, RESPAWN_PHASE_2_FLAG, and the paddle
    // trough.
    // Non-special [buffer] will have buffer flags.
    nsBgSpecial = nsBackground.declareSubspace('BG_SPECIAL', 'SPECIAL_FLAG');
    nsBgBuffer = nsBackground.declareSubspace('BG_BUFFER', 0);
    nsBgSpecial.alloc('RESPAWN_FLAG', 1);
    nsBgSpecial.alloc('RESPAWN_PHASE_2_FLAG', 1);

    // Used by background and ball [since the ball has to replace the background
    // bits it runs over].
    nsBall.alloc('BUFFER_X_FLAG', 1);
    nsBall.alloc('BUFFER_Y_FLAG', 1);
    nsBgBuffer.alloc('BUFFER_X_FLAG', 1);
    nsBgBuffer.alloc('BUFFER_Y_FLAG', 1);

    nsBall.alloc('RESPAWN_FLAG', 1);

    isWall = getHasValueFunction(nsGlobal.ID_BITS.getMask(),
                                 nsGlobal.WALL_FLAG.getMask());
    isBackground = getHasValueFunction(nsGlobal.ID_BITS.getMask(),
                                       nsGlobal.BACKGROUND_FLAG.getMask());
    isBall = getHasValueFunction(nsGlobal.ID_BITS.getMask(),
                                 nsGlobal.BALL_FLAG.getMask());
    isBgSpecial = getHasValueFunction(nsGlobal.ID_BITS.getMask() |
                                      nsBackground.SPECIAL_FLAG.getMask(),
                                      nsGlobal.BACKGROUND_FLAG.getMask() |
                                      nsBackground.SPECIAL_FLAG.getMask());
    isBgBuffer = getHasValueFunction(nsGlobal.ID_BITS.getMask() |
                                     nsBackground.SPECIAL_FLAG.getMask(),
                                     nsGlobal.BACKGROUND_FLAG.getMask());
    isRespawn = getHasValueFunction(nsGlobal.ID_BITS.getMask() |
                                    nsBackground.SPECIAL_FLAG.getMask() |
                                    nsBgSpecial.RESPAWN_FLAG.getMask(),
                                    nsGlobal.BACKGROUND_FLAG.getMask() |
                                    nsBackground.SPECIAL_FLAG.getMask() |
                                    nsBgSpecial.RESPAWN_FLAG.getMask())
    isTopWallCenter =
      getHasValueFunction(nsGlobal.ID_BITS.getMask() |
                          nsWall.TOP_WALL_CENTER_FLAG.getMask(),
                          nsGlobal.WALL_FLAG.getMask() |
                          nsWall.TOP_WALL_CENTER_FLAG.getMask())
    nsGlobal.dumpStatus();  
  }

  function isCenterRespawn(data) {
    assert(_.isArray(data));
    return _.every(data, isRespawn);
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

    c.fillRect(nsGlobal.BACKGROUND.getMask(), 0, 0,
               canvas.width, canvas.height);
    c.fillRect(
      nsBgSpecial.RESPAWN_FLAG.setMask(
        nsBackground.SPECIAL_FLAG.setMask(nsGlobal.BACKGROUND.getMask(), true),
        true),
      originX + halfWidth - 1, originY + halfHeight - 1, BALL_SIZE, BALL_SIZE);

    let color = nsGlobal.WALL.getMask();
    c.fillRect(color, originX, height, width, 1);
    c.fillRect(nsWall.SIDE_WALL_FLAG.setMask(color, true), originX, originY,
               1, height - 1);
    c.fillRect(nsWall.SIDE_WALL_FLAG.setMask(color, true), originX + width - 1,
               originY, 1,
               height - 1);
    c.fillRect(nsWall.TOP_WALL_FLAG.setMask(color, true), originX, originY,
               width, 1);
    c.fillRect(nsWall.TOP_WALL_CENTER_FLAG.setMask(color, true),
               originX + halfWidth,
               originY, 1, 1);

    let bg = nsGlobal.BACKGROUND.getMask();
    // BgBuffer's id is 0, so no extra flag for that.
    let bufferX = nsBgBuffer.BUFFER_X_FLAG.getMask() | bg;
    let bufferY = nsBgBuffer.BUFFER_Y_FLAG.getMask() | bg;

    // Buffer regions
    c.fillRect(bufferX,
               insideWallOriginX, insideWallOriginY + BUFFER_SIZE,
               BUFFER_SIZE, insideWallHeight - 2 * BUFFER_SIZE);
    c.fillRect(bufferX,
               insideWallOriginX + insideWallWidth - BUFFER_SIZE,
               insideWallOriginY + BUFFER_SIZE,
               BUFFER_SIZE, insideWallHeight - 2 * BUFFER_SIZE);
    c.fillRect(bufferY,
               insideWallOriginX + BUFFER_SIZE, insideWallOriginY,
               insideWallWidth - 2 * BUFFER_SIZE, BUFFER_SIZE);
    c.fillRect(bufferY,
               insideWallOriginX + BUFFER_SIZE,
               insideWallOriginY + insideWallHeight - BUFFER_SIZE,
               insideWallWidth - 2 * BUFFER_SIZE, BUFFER_SIZE);
    c.fillRect(bufferX | bufferY,
               insideWallOriginX, insideWallOriginY,
               BUFFER_SIZE, BUFFER_SIZE);
    c.fillRect(bufferX | bufferY,
               insideWallOriginX + insideWallWidth - BUFFER_SIZE,
               insideWallOriginY + insideWallHeight - BUFFER_SIZE,
               BUFFER_SIZE, BUFFER_SIZE);
    c.fillRect(bufferX | bufferY, insideWallOriginX +
               insideWallWidth - BUFFER_SIZE,
               insideWallOriginY, BUFFER_SIZE, BUFFER_SIZE);
    c.fillRect(bufferX | bufferY, insideWallOriginX,
               insideWallOriginY + insideWallHeight - BUFFER_SIZE,
               BUFFER_SIZE, BUFFER_SIZE);

    // arbitrarily moving ball
    var left = Math.round(canvas.width / 2 + 4);
    var top = Math.round(canvas.height / 2 + 4);
    const brightColor =
      BallState.create(bm, 1, 1, 4, 0,
                       nsGlobal.FULL_BALL.getMask()).nextColor();
    const dimColor =
      BallState.create(bm, 1, 1, 4, 0,
                       nsGlobal.DIM_BALL.getMask()).nextColor();
    const hiddenColor =
      BallState.create(bm, 1, 1, 4, 0,
                       nsGlobal.HIDDEN_BALL.getMask()).nextColor();

    c.fillRect(dimColor, left, top, BALL_SIZE, BALL_SIZE);
    c.fillRect(brightColor, left + 1, top + 1, 1, 1);
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
      let bgH = isBackground(higher);
      let bgL = isBackground(lower);
      if ((bgH && !(isBgBuffer(higher) && nsBgBuffer[flag].get(higher))) ||
          (!bgH && !nsBall[flag].get(higher))) {
        return 'min';
      }
      if ((bgL && !(isBgBuffer(lower) && nsBgBuffer[flag].get(lower))) ||
          (!bgL && !nsBall[flag].get(lower))) {
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
    let bufferX = false;
    let bufferY = false;
    if (isBall(current)) {
      bufferX = nsBall.BUFFER_X_FLAG.get(current);
      bufferY = nsBall.BUFFER_Y_FLAG.get(current);
    } else {
      assert(isBackground(current));
      if (isBgBuffer(current)) {
        bufferX = nsBgBuffer.BUFFER_X_FLAG.get(current);
        bufferY = nsBgBuffer.BUFFER_Y_FLAG.get(current);
      }
    }
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

  function handleWall(data, x, y) {
    const current = data[4];

    if (nsWall.SIDE_WALL_FLAG.isSet(current)) {
      if (nsWall.MESSAGE_PRESENT.isSet(data[7])) {
        return data[7];
      }
      // Only trigger if we're at the middle of the ball, to prevent
      // duplicate messages.
      let right = false;
      if (_.every([0, 3, 6], i => isBall(data[i])) ||
          (right = _.every([2, 5, 8], i => isBall(data[i])))) {
        var next = nsWall.MESSAGE_PRESENT.set(current, 1);
        return nsWall.MESSAGE_R_NOT_L.set(next, right);
      }
    } else if (nsWall.TOP_WALL_CENTER_FLAG.isSet(current)) {
      if (nsWall.MESSAGE_PRESENT.isSet(data[5])) {
        assert(nsWall.MESSAGE_R_NOT_L.get(data[5]) === 0);
        let message = nsWall.RESPAWN_MESSAGE_BITS.get(data[5]);
        return nsWall.RESPAWN_MESSAGE_BITS.set(current, message);
      }
      if (nsWall.MESSAGE_PRESENT.isSet(data[3])) {
        assert(nsWall.MESSAGE_R_NOT_L.get(data[3]) === 1);
        let message = nsWall.RESPAWN_MESSAGE_BITS.get(data[3]);
        return nsWall.RESPAWN_MESSAGE_BITS.set(current, message);
      }
    } else if (nsWall.TOP_WALL_FLAG.isSet(current)) {
      if (isWall(data[5]) && nsWall.MESSAGE_PRESENT.isSet(data[5]) &&
          !nsWall.MESSAGE_R_NOT_L.isSet(data[5]) &&
          !nsWall.TOP_WALL_CENTER_FLAG.isSet(data[5])) {
        return data[5];
      }
      if (isWall(data[3]) && nsWall.MESSAGE_PRESENT.isSet(data[3]) &&
          nsWall.MESSAGE_R_NOT_L.isSet(data[3]) &&
          !nsWall.TOP_WALL_CENTER_FLAG.isSet(data[3])) {
        return data[3];
      }
      if (isWall(data[7]) && nsWall.MESSAGE_PRESENT.isSet(data[7])) {
        let message = nsWall.RESPAWN_MESSAGE_BITS.get(data[7]);
        return nsWall.RESPAWN_MESSAGE_BITS.set(current, message);
      }
    }
    return nsWall.RESPAWN_MESSAGE_BITS.set(current, 0);
  }

  function bigRespawn(data, x, y) {
    const current = data[4];

    if (isWall(current)) {
      return handleWall(data, x, y);
    }
    // Both ball and background need to handle incoming ball pixels.

    // First deal with messages and respawns in the background, then deal with
    // the ball in both.  We won't receive a message and a ball in the same
    // cycle.
    let backgroundAbove = isBackground(data[1]);
    if (isBackground(current) && (backgroundAbove ||
                                  isTopWallCenter(data[1]))) {
      let nsAbove;
      if (backgroundAbove) {
        nsAbove = nsBackground;
      } else {
        nsAbove = nsWall
      }
      let active = nsAbove.SIGNAL_DOWN_ACTIVE_FLAG.get(data[1]);
      if (active) {
        if (isCenterRespawn(data)) {
          let rightNotL = nsAbove.MESSAGE_R_NOT_L.get(data[1]);
          let color = nsGlobal.BACKGROUND.getMask();
          color = nsBackground.MESSAGE_R_NOT_L.set(color, rightNotL);
          color = nsBackground.SPECIAL_FLAG.set(color, true);
          color = nsBgSpecial.RESPAWN_FLAG.set(color, true);
          color = nsBgSpecial.RESPAWN_PHASE_2_FLAG.set(color, true);
          return color;
        } else {
          return BitManager.copyBits(nsAbove, data[1], nsBackground, current,
                                     copySets.RESPAWN_MESSAGE_BITS);
        }
      }
    }
    if (isRespawn(current)) {
      for (let d of data) {
        if (isBgSpecial(d) && nsBgSpecial.RESPAWN_PHASE_2_FLAG.get(d)) {
          let rightNotL = nsBackground.MESSAGE_R_NOT_L.get(d);
          let color = nsGlobal.DIM_BALL.getMask();
          color = nsBall.RESPAWN_FLAG.setMask(color, true);
          var bs = BallState.create(bm, rightNotL, 1, 5, 0, color);
          let next = bs.getColor();
          if (isCenterRespawn(data)) {
            next = nsGlobal.BRIGHT_BALL_FLAG.setMask(next, true);
          }
          return next;
        }
      }
    }

    let respawn;
    let bufferXFlag;
    let bufferYFlag;
    let bgBuffer = isBgBuffer(current);
    if (isBall(current)) {
      respawn = nsBall.RESPAWN_FLAG.get(current);
      bufferXFlag = nsBall.BUFFER_X_FLAG.get(current);
      bufferYFlag = nsBall.BUFFER_Y_FLAG.get(current);
    } else {
      respawn = isRespawn(current);
      bufferXFlag = bgBuffer && nsBgBuffer.BUFFER_X_FLAG.get(current);
      bufferYFlag = bgBuffer && nsBgBuffer.BUFFER_Y_FLAG.get(current);
    }
    for (let i = 0; i < 9; ++i) {
      let color = data[i];
      if (isBall(color)) {
        // With a diagonal entry to the buffer, a trailing ball pixel moving
        // into the buffer for the first time [so no depth count] can hit an
        // edge buffer pixel even if it's time to bounce.  We need to check all
        // neighboring ball pixels and take the highest depth on the way in;
        // they'll all match on the way out.
        let bs = new BallState(bm, color);
        if (!bs.getDepthX() && nsBall.BUFFER_X_FLAG.get(color) !== 0) {
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
          nextColor = nsBall.BUFFER_X_FLAG.set(nextColor, bufferXFlag);
          nextColor = nsBall.BUFFER_Y_FLAG.set(nextColor, bufferYFlag);
          nextColor = nsBall.RESPAWN_FLAG.set(nextColor, respawn);
          return nextColor;
        }
      }
    }
    let background = nsGlobal.BACKGROUND.getMask()
    let nextColor = background;
    if (bufferXFlag || bufferYFlag) {
      // Background flag is 0, so no special bit for that.
      assert(!respawn);
      nextColor = nsBgBuffer.BUFFER_X_FLAG.set(nextColor, bufferXFlag);
      nextColor = nsBgBuffer.BUFFER_Y_FLAG.set(nextColor, bufferYFlag);
    }
    if (respawn) {
      assert(!bgBuffer);
      nextColor = nsBackground.SPECIAL_FLAG.set(nextColor, respawn);
      nextColor = nsBgSpecial.RESPAWN_FLAG.set(nextColor, respawn);
    }
    return nextColor;
  }

  registerAnimation("big respawn", initBigRespawn, bigRespawn);

})();
