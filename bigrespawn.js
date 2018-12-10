"use strict";
/* Namespace plan:
  Global
1 IS_NOT_BACKGROUND [high alpha bit]

  Background [29+1; can split respawn/trough/buffer+paddle stuff if needed]
1     MESSAGE_PRESENT
1     MESSAGE_R_NOT_L
1     MESSAGE_H_NOT_V
6     MESSAGE_PADDLE_POSITION
1     RESPAWN_FLAG
1     RESPAWN_PHASE_2_FLAG
1     BALL_MISS_FLAG
1     TROUGH_FLAG
1     DECIMATOR [for respawn and paddle buffer]
1     BUFFER_X_FLAG
1     BUFFER_Y_FLAG
1     PADDLE_BUFFER_FLAG
1     PADDLE_PIXEL
6     PADDLE_POSITION
3     PADDLE_DEST
2     PADDLE_MOVE_DELAY_COUNTER

  NonBackground
2   ID_0, ID_1

  Ball [28+2(+1)]
2     BUFFER_X_DEPTH_COUNTER
2     BUFFER_Y_DEPTH_COUNTER
1     MOVE_R_NOT_L
1     MOVE_D_NOT_U
2     MOVE_STATE
3     MOVE_INDEX
1     DECIMATOR
(1)   Extra ball pixel for appearance [optional]
14    To replace when run over: BUFFER_X_FLAG, BUFFER_Y_FLAG, RESPAWN_FLAG,
        PADDLE_BUFFER_FLAG, PADDLE_PIXEL, PADDLE_POSITION, PADDLE_DEST.

  Wall
1     SIDE_WALL_FLAG
1     TOP_WALL_FLAG
1     TOP_WALL_CENTER_FLAG
1     MESSAGE_PRESENT
1     MESSAGE_R_NOT_L

  Paddle
1     PADDLE_PIXEL
6     PADDLE_POSITION
3     PADDLE_DEST
2-3   PADDLE_MOVE_DELAY_COUNTER
1     DECIMATOR

  Counter/scoreboard
TBD

The things that need to scale up for a larger ball are:
BUFFER_X_DEPTH_COUNTER_BITS, BUFFER_Y_DEPTH_COUNTER_BITS, the BUFFER_[XY]_FLAGs
need to get their MAX and MIN bits back, the paddle move delay
counter...anything else?  Maybe another shading pixel for the ball's edges?]
*/

let bm;
(function () {
  let nsBall, nsWall, nsPaddle, nsBackground, nsGlobal, nsNonbackground;
  let isWall, isBackground, isBall, isRespawn, isTrough;
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

    nsGlobal.declare('IS_NOT_BACKGROUND', 1, 31);
    nsGlobal.setSubspaceMask('IS_NOT_BACKGROUND');
    nsBackground = nsGlobal.declareSubspace('BACKGROUND', 0);
    nsNonbackground = nsGlobal.declareSubspace('NONBACKGROUND',
                                               'IS_NOT_BACKGROUND');

    nsNonbackground.declare('ID_0', 1, 7);
    nsNonbackground.declare('ID_1', 1, 23);

    // Sentinel bits that determine type:
    nsNonbackground.alias('WALL_FLAG', 'ID_0');
    nsNonbackground.alias('BALL_FLAG', 'ID_1');
    nsNonbackground.combine('ID_BITS', ['ID_0', 'ID_1']);
    nsNonbackground.alias('PADDLE_FLAG', 'ID_BITS');

    nsNonbackground.declare('FULL_ALPHA', 3, 28);
    nsBackground.declare('FULL_ALPHA', 3, 28);
    nsBackground.alias('BASIC_BACKGROUND', 'FULL_ALPHA');

    nsNonbackground.setSubspaceMask('ID_BITS');
    nsBall = nsNonbackground.declareSubspace('BALL', 'BALL_FLAG');
    nsWall = nsNonbackground.declareSubspace('WALL', 'WALL_FLAG');
    nsPaddle = nsNonbackground.declareSubspace('PADDLE', 'ID_BITS');

    nsBall.declare('HIDDEN_BALL_FLAG', 1, 24);
    nsBall.declare('DIM_BALL_FLAG', 1, 14);
    nsBall.declare('BRIGHT_BALL_FLAG', 1, 15);

    // Message fields [for wall and background, mostly]
    nsWall.alloc('MESSAGE_R_NOT_L', 1);
    nsBackground.alloc('MESSAGE_R_NOT_L', 1);
    nsWall.declare('MESSAGE_PRESENT', 1, 14);
    nsBackground.declare('MESSAGE_PRESENT', 1, 14);
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

    nsBackground.alloc('RESPAWN_FLAG', 1);
    nsBackground.alloc('RESPAWN_PHASE_2_FLAG', 1);
    nsBackground.declare('TROUGH_FLAG', 1, 15);
    nsBackground.declare('BALL_MISS_FLAG', 1, 13);

    // Used by background and ball [since the ball has to replace the background
    // bits it runs over].
    nsBall.alloc('BUFFER_X_FLAG', 1);
    nsBall.alloc('BUFFER_Y_FLAG', 1);
    nsBackground.declare('BUFFER_X_FLAG', 1, 21);
    nsBackground.declare('BUFFER_Y_FLAG', 1, 22);

    nsBall.alloc('RESPAWN_FLAG', 1);

    isWall = getHasValueFunction(bm.or([nsGlobal.IS_NOT_BACKGROUND.getMask(),
                                       nsNonbackground.ID_BITS.getMask()]),
                                 bm.or([nsGlobal.IS_NOT_BACKGROUND.getMask(),
                                       nsNonbackground.WALL_FLAG.getMask()]));
    isBackground = getHasValueFunction(nsGlobal.IS_NOT_BACKGROUND.getMask(), 0);
    isBall = getHasValueFunction(bm.or([nsGlobal.IS_NOT_BACKGROUND.getMask(),
                                       nsNonbackground.ID_BITS.getMask()]),
                                 bm.or([nsGlobal.IS_NOT_BACKGROUND.getMask(),
                                       nsNonbackground.BALL_FLAG.getMask()]));
    isRespawn = getHasValueFunction(
      bm.or([nsGlobal.IS_NOT_BACKGROUND.getMask(),
             nsBackground.RESPAWN_FLAG.getMask()]),
             nsBackground.RESPAWN_FLAG.getMask());
    isTrough = getHasValueFunction(
      bm.or([nsGlobal.IS_NOT_BACKGROUND.getMask(),
             nsBackground.TROUGH_FLAG.getMask()]),
             nsBackground.TROUGH_FLAG.getMask());
    isTopWallCenter =
      getHasValueFunction(bm.or([nsNonbackground.ID_BITS.getMask(),
                                 nsWall.TOP_WALL_CENTER_FLAG.getMask()]),
                          bm.or([nsNonbackground.WALL_FLAG.getMask(),
                                 nsWall.TOP_WALL_CENTER_FLAG.getMask()]))
    isTopWallCenter =
      getHasValueFunction(bm.or([nsGlobal.IS_NOT_BACKGROUND.getMask(),
                                 nsNonbackground.ID_BITS.getMask(),
                                 nsWall.TOP_WALL_CENTER_FLAG.getMask()]),
                          bm.or([nsGlobal.IS_NOT_BACKGROUND.getMask(),
                                 nsNonbackground.WALL_FLAG.getMask(),
                                 nsWall.TOP_WALL_CENTER_FLAG.getMask()]));
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

    // background
    let background = nsBackground.BASIC_BACKGROUND.getMask();
    c.fillRect(background, 0, 0, canvas.width, canvas.height);

    // respawn square
    c.fillRect(nsBackground.RESPAWN_FLAG.setMask(background, true),
      originX + halfWidth - 1, originY + halfHeight - 1, BALL_SIZE, BALL_SIZE);


    // walls
    let color = bm.or([nsGlobal.IS_NOT_BACKGROUND.getMask(),
                       nsNonbackground.WALL_FLAG.getMask(),
                       nsNonbackground.FULL_ALPHA.getMask()]);
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

    // buffer regions
    let bufferX = bm.or([nsBackground.BUFFER_X_FLAG.getMask(), background]);
    let bufferY = bm.or([nsBackground.BUFFER_Y_FLAG.getMask(), background]);
    c.fillRect(bufferX,
               insideWallOriginX + 1, insideWallOriginY + BUFFER_SIZE,
               BUFFER_SIZE, insideWallHeight - 2 * BUFFER_SIZE);
    c.fillRect(bufferX,
               insideWallOriginX + insideWallWidth - BUFFER_SIZE - 1,
               insideWallOriginY + BUFFER_SIZE,
               BUFFER_SIZE, insideWallHeight - 2 * BUFFER_SIZE);
    c.fillRect(bufferY,
               insideWallOriginX + BUFFER_SIZE + 1, insideWallOriginY,
               insideWallWidth - 2 * BUFFER_SIZE - 2, BUFFER_SIZE);
    c.fillRect(bufferY,
               insideWallOriginX + BUFFER_SIZE + 1,
               insideWallOriginY + insideWallHeight - BUFFER_SIZE,
               insideWallWidth - 2 * BUFFER_SIZE - 2, BUFFER_SIZE);
    c.fillRect(bm.or([bufferX, bufferY]),
               insideWallOriginX + 1, insideWallOriginY,
               BUFFER_SIZE, BUFFER_SIZE);
    c.fillRect(bm.or([bufferX, bufferY]),
               insideWallOriginX + insideWallWidth - BUFFER_SIZE - 1,
               insideWallOriginY + insideWallHeight - BUFFER_SIZE,
               BUFFER_SIZE, BUFFER_SIZE);
    c.fillRect(bm.or([bufferX, bufferY]), insideWallOriginX +
               insideWallWidth - BUFFER_SIZE - 1,
               insideWallOriginY, BUFFER_SIZE, BUFFER_SIZE);
    c.fillRect(bm.or([bufferX, bufferY]), insideWallOriginX + 1,
               insideWallOriginY + insideWallHeight - BUFFER_SIZE,
               BUFFER_SIZE, BUFFER_SIZE);


    // trough lines
    let trough = bm.or([nsBackground.TROUGH_FLAG.getMask(), background])
    c.fillRect(trough, insideWallOriginX, insideWallOriginY, 1,
               insideWallHeight);
    c.fillRect(trough, insideWallOriginX + insideWallWidth - 1,
               insideWallOriginY, 1, insideWallHeight);

    // arbitrarily moving ball
    var left = Math.round(canvas.width / 2 + 4);
    var top = Math.round(canvas.height / 2 + 4);
    const brightColor =
      BallState.create(bm, 1, 1, 4, 0,
                       bm.or([nsGlobal.IS_NOT_BACKGROUND.getMask(),
                       nsNonbackground.BALL_FLAG.getMask(),
                       nsBall.BRIGHT_BALL_FLAG.getMask(),
                       nsBall.DIM_BALL_FLAG.getMask(),
                       nsNonbackground.FULL_ALPHA.getMask()])).nextColor();
    const dimColor =
      BallState.create(bm, 1, 1, 4, 0,
                       bm.or([nsGlobal.IS_NOT_BACKGROUND.getMask(),
                       nsNonbackground.BALL_FLAG.getMask(),
                       nsBall.DIM_BALL_FLAG.getMask(),
                       nsNonbackground.FULL_ALPHA.getMask()])).nextColor();
    const hiddenColor =
      BallState.create(bm, 1, 1, 4, 0,
                       bm.or([nsGlobal.IS_NOT_BACKGROUND.getMask(),
                       nsNonbackground.BALL_FLAG.getMask(),
                       nsBall.HIDDEN_BALL_FLAG.getMask(),
                       nsNonbackground.FULL_ALPHA.getMask()])).nextColor();

    c.fillRect(dimColor, left, top, BALL_SIZE, BALL_SIZE);
    c.fillRect(brightColor, left + 1, top + 1, 1, 1);
  }

  function getBufferBits(data, bs) {
    function testBounds(lower, current, higher, flag,
                        bsDepth, bsDir) {
      assert(BUFFER_SIZE === 3);
      if (isWall(lower) || isTrough(lower)) {
        return 'min';
      }
      if (isWall(higher) || isTrough(higher)) {
        return 'max';
      }
      // Beyond this line, higher and lower are either empty background, buffer,
      // or ball, no trough or wall.
      let bgH = isBackground(higher);
      let bgL = isBackground(lower);
      if ((bgH && !nsBackground[flag].get(higher)) ||
          (!bgH && !nsBall[flag].get(higher))) {
        return 'min';
      }
      if ((bgL && !nsBackground[flag].get(lower)) ||
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
      bufferX = nsBackground.BUFFER_X_FLAG.get(current);
      bufferY = nsBackground.BUFFER_Y_FLAG.get(current);
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
      if (isTrough(data[3]) &&
          nsBackground.BALL_MISS_FLAG.isSet(data[3])) {
        return nsWall.MESSAGE_PRESENT.set(current, 1);
      } else if (isTrough(data[5]) &&
                 nsBackground.BALL_MISS_FLAG.isSet(data[5])) {
        var next = nsWall.MESSAGE_PRESENT.set(current, 1);
        return nsWall.MESSAGE_R_NOT_L.set(next, 1);
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
      let active = nsAbove.MESSAGE_PRESENT.get(data[1]);
      if (active) {
        if (isCenterRespawn(data)) {
          let rightNotL = nsAbove.MESSAGE_R_NOT_L.get(data[1]);
          let color = nsBackground.MESSAGE_R_NOT_L.set(current, rightNotL);
          color = nsBackground.RESPAWN_FLAG.set(color, true);
          color = nsBackground.RESPAWN_PHASE_2_FLAG.set(color, true);
          return color;
        } else {
          return BitManager.copyBits(nsAbove, data[1], nsBackground, current,
                                     copySets.RESPAWN_MESSAGE_BITS);
        }
      }
    }
    if (isRespawn(current)) {
      for (let d of data) {
        if (isBackground(d) && nsBackground.RESPAWN_PHASE_2_FLAG.get(d)) {
          let rightNotL = nsBackground.MESSAGE_R_NOT_L.get(d);
          let color = bm.or([nsGlobal.IS_NOT_BACKGROUND.getMask(),
                             nsNonbackground.BALL_FLAG.getMask(),
                             nsBall.DIM_BALL_FLAG.getMask(),
                             nsNonbackground.FULL_ALPHA.getMask()]);
          color = nsBall.RESPAWN_FLAG.setMask(color, true);
          var bs = BallState.create(bm, rightNotL, 1, 5, 0, color);
          let next = bs.getColor();
          if (isCenterRespawn(data)) {
            next = nsBall.BRIGHT_BALL_FLAG.setMask(next, true);
          }
          return next;
        }
      }
    }
    // Trough doesn't have to deal with balls, messages, or respawn, only ball
    // deaths and eventually the paddle.
    if (isTrough(current)) {
      if (_.every([0, 3, 6], i => isBall(data[i])) ||
          _.every([2, 5, 8], i => isBall(data[i]))) {
        return nsBackground.BALL_MISS_FLAG.set(current, 1);
      }
      return nsBackground.BALL_MISS_FLAG.set(current, 0);
    }

    let respawn;
    let bufferXFlag;
    let bufferYFlag;
    if (isBall(current)) {
      respawn = nsBall.RESPAWN_FLAG.get(current);
      bufferXFlag = nsBall.BUFFER_X_FLAG.get(current);
      bufferYFlag = nsBall.BUFFER_Y_FLAG.get(current);
    } else {
      assert(isBackground(current));
      respawn = isRespawn(current);
      bufferXFlag = nsBackground.BUFFER_X_FLAG.get(current);
      bufferYFlag = nsBackground.BUFFER_Y_FLAG.get(current);
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
    let nextColor = nsBackground.BASIC_BACKGROUND.getMask();
    if (bufferXFlag || bufferYFlag) {
      // Background flag is 0, so no special bit for that.
      assert(!respawn);
      nextColor = nsBackground.BUFFER_X_FLAG.set(nextColor, bufferXFlag);
      nextColor = nsBackground.BUFFER_Y_FLAG.set(nextColor, bufferYFlag);
    }
    if (respawn) {
      assert(!bufferXFlag && !bufferYFlag);
      nextColor = nsBackground.RESPAWN_FLAG.set(nextColor, respawn);
    }
    return nextColor;
  }

  registerAnimation("big respawn", initBigRespawn, bigRespawn);

})();
