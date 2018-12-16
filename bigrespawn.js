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
  let isWall, isBackground, isBall, isRespawn, isTrough, isPaddle;
  let isPaddleBuffer, isBallInPaddleBuffer, isInPaddleBufferRegion;
  let isBallMotionCycleHelper;
  let isPaddleMotionCycleHelper, isPaddleBufferMotionCycleHelper;
  let isTopWallCenter;
  let copySets = {};
  // TODO: Can we make these not so global?
  const originX = 1;
  const originY = 1;
  const width = canvas.width - 2;
  const height = canvas.height - 2;
  const halfWidth = Math.floor(width / 2);
  const halfHeight = Math.floor(height / 2);
  const insideWallOriginX = originX + 1;
  const insideWallOriginY = originY + 1;
  const insideWallWidth = width - 2;
  const insideWallHeight = height - 2;
  const BALL_SIZE_BITS = 2;
  // We need to keep the depth counter from overflowing, so the buffer can't be
  // as deep as 1 << BALL_SIZE_BITS.
  const BALL_SIZE = (1 << BALL_SIZE_BITS) - 1;
  //const BALL_SIZE = 4;
  const BUFFER_X_DEPTH_COUNTER_BITS = BALL_SIZE_BITS;
  const BUFFER_Y_DEPTH_COUNTER_BITS = BALL_SIZE_BITS;
  const BUFFER_SIZE = BALL_SIZE;

  // This is assumed throughout the file, in figuring out buffer bits and ball
  // pixels.
  assert(BALL_SIZE === 3);

  // 2 for trough/paddle
  const paddleToPaddleBallDistance = insideWallWidth - 2 - BALL_SIZE;
  const topWallToBottomWallBallDistance = insideWallHeight - BALL_SIZE;
  // See notes in getNewAIMessage.
  assert(paddleToPaddleBallDistance % 6 === 1);


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

    // Message fields shared by wall and background
    nsWall.alloc('MESSAGE_R_NOT_L', 1);
    nsBackground.alloc('MESSAGE_R_NOT_L', 1);
    nsWall.declare('MESSAGE_PRESENT', 1, 14);
    nsBackground.declare('MESSAGE_PRESENT', 1, 14);
    nsWall.combine('RESPAWN_MESSAGE_BITS',
                   ['MESSAGE_PRESENT', 'MESSAGE_R_NOT_L']);

    // Used only by the ball.
    nsBall.declare('DECIMATOR', 1, 15);
    nsBall.alloc('PADDLE_POSITION', 6);
    nsBall.alloc('PADDLE_DEST', 3);
    nsBall.alloc('MOVE_INDEX', 3);
    nsBall.alloc('BUFFER_X_DEPTH_COUNTER', BUFFER_X_DEPTH_COUNTER_BITS);
    nsBall.alloc('BUFFER_Y_DEPTH_COUNTER', BUFFER_Y_DEPTH_COUNTER_BITS);
    nsBall.alloc('MOVE_STATE', 2);
    nsBall.alloc('MOVE_R_NOT_L', 1);
    nsBall.alloc('MOVE_D_NOT_U', 1);
    nsBall.alloc('PADDLE_PIXEL', 1);
    nsBall.alloc('PADDLE_BUFFER_FLAG', 1);
    copySets.PADDLE_BALL_BITS =
      ['PADDLE_POSITION', 'PADDLE_DEST', 'PADDLE_PIXEL', 'PADDLE_BUFFER_FLAG']
    nsBall.combine('PADDLE_BALL_BITS', copySets.PADDLE_BALL_BITS);

    nsWall.alloc('SIDE_WALL_FLAG', 1);
    nsWall.alloc('TOP_WALL_FLAG', 1);

    nsWall.alloc('TOP_WALL_CENTER_FLAG', 1);

    nsBackground.alloc('RESPAWN_FLAG', 1);
    nsBackground.alloc('RESPAWN_PHASE_2_FLAG', 1);
    nsBackground.alloc('TROUGH_FLAG', 1);
    nsBackground.declare('BALL_MISS_FLAG', 1, 13);

    // Used by background and ball [since the ball has to replace the background
    // bits it runs over].
    nsBall.alloc('BUFFER_X_FLAG', 1);
    nsBall.alloc('BUFFER_Y_FLAG', 1);
    nsBackground.declare('BUFFER_X_FLAG', 1, 21);
    nsBackground.declare('BUFFER_Y_FLAG', 1, 22);

    nsBall.alloc('RESPAWN_FLAG', 1);

    // Paddle fields
    nsPaddle.declare('DECIMATOR', 1, 15);
    nsPaddle.alloc('PADDLE_POSITION', 6);
    nsPaddle.alloc('PADDLE_DEST', 3);
    nsPaddle.alloc('PADDLE_PIXEL', 1);

    // Background fields for paddle
    nsBackground.declare('DECIMATOR', 1, 15);
    nsBackground.alloc('PADDLE_POSITION', 6);
    nsBackground.alloc('PADDLE_DEST', 3);
    nsBackground.alloc('PADDLE_MOVE_DELAY_COUNTER', 3);
    nsBackground.alloc('PADDLE_PIXEL', 1);
    nsBackground.alloc('PADDLE_BUFFER_FLAG', 1);
    // We don't copy decimator because we always flip it.
    nsBackground.combine(
      'PADDLE_BACKGROUND_BITS',
      ['PADDLE_POSITION', 'PADDLE_DEST', 'PADDLE_MOVE_DELAY_COUNTER',
       'PADDLE_PIXEL', 'PADDLE_BUFFER_FLAG']);

    // Background-only AI message fields
    nsBackground.alloc('MESSAGE_H_NOT_V', 1);
    nsBackground.alloc('MESSAGE_PADDLE_POSITION', 3);
    nsBackground.combine('ALL_MESSAGE_BITS',
                         ['MESSAGE_H_NOT_V', 'MESSAGE_R_NOT_L',
                         'MESSAGE_PADDLE_POSITION', 'MESSAGE_PRESENT']);

    isWall = getHasValueFunction(bm.or([nsGlobal.IS_NOT_BACKGROUND.getMask(),
                                       nsNonbackground.ID_BITS.getMask()]),
                                 bm.or([nsGlobal.IS_NOT_BACKGROUND.getMask(),
                                       nsNonbackground.WALL_FLAG.getMask()]));
    isBackground = getHasValueFunction(nsGlobal.IS_NOT_BACKGROUND.getMask(), 0);
    isBall = getHasValueFunction(bm.or([nsGlobal.IS_NOT_BACKGROUND.getMask(),
                                       nsNonbackground.ID_BITS.getMask()]),
                                 bm.or([nsGlobal.IS_NOT_BACKGROUND.getMask(),
                                       nsNonbackground.BALL_FLAG.getMask()]));
    isBallMotionCycleHelper = getHasValueFunction(nsBall.DECIMATOR.getMask(),
                                                  nsBall.DECIMATOR.getMask());
    isPaddleMotionCycleHelper =
      getHasValueFunction(nsPaddle.DECIMATOR.getMask(), 0);
    isPaddleBufferMotionCycleHelper =
      getHasValueFunction(nsBackground.DECIMATOR.getMask(), 0);
    isRespawn = getHasValueFunction(
      bm.or([nsGlobal.IS_NOT_BACKGROUND.getMask(),
             nsBackground.RESPAWN_FLAG.getMask()]),
             nsBackground.RESPAWN_FLAG.getMask());
    isTrough = getHasValueFunction(
      bm.or([nsGlobal.IS_NOT_BACKGROUND.getMask(),
             nsBackground.TROUGH_FLAG.getMask()]),
             nsBackground.TROUGH_FLAG.getMask());
    isPaddleBuffer = getHasValueFunction(
      bm.or([nsGlobal.IS_NOT_BACKGROUND.getMask(),
             nsBackground.PADDLE_BUFFER_FLAG.getMask()]),
             nsBackground.PADDLE_BUFFER_FLAG.getMask());
    isBallInPaddleBuffer = getHasValueFunction(
      bm.or([nsGlobal.IS_NOT_BACKGROUND.getMask(),
             nsNonbackground.ID_BITS.getMask(),
             nsBall.PADDLE_BUFFER_FLAG.getMask()]),
      bm.or([nsGlobal.IS_NOT_BACKGROUND.getMask(),
             nsNonbackground.BALL_FLAG.getMask(),
             nsBall.PADDLE_BUFFER_FLAG.getMask()]));
    isInPaddleBufferRegion =
      d => (isPaddleBuffer(d) || isBallInPaddleBuffer(d));
    isPaddle = getHasValueFunction(
      bm.or([nsGlobal.IS_NOT_BACKGROUND.getMask(),
             nsNonbackground.ID_BITS.getMask()]),
      bm.or([nsGlobal.IS_NOT_BACKGROUND.getMask(),
             nsNonbackground.PADDLE_FLAG.getMask()]));
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
    PaddleState.init(nsPaddle, nsBall, nsBackground, isPaddle,
                     isBallInPaddleBuffer, isPaddleBuffer);
    nsGlobal.dumpStatus();
  }

  function isBallMotionCycle(c) {
    assert(isBall(c));
    return isBallMotionCycleHelper(c);
  }

  function isPaddleMotionCycleGeneral(c) {
    if (isPaddle(c)) {
      return isPaddleMotionCycleHelper(c);
    }
    if (isBallInPaddleBuffer(c)) {
      return !isBallMotionCycle(c);
    }
    assert(isPaddleBuffer(c));
    return isPaddleBufferMotionCycleHelper(c);
  }

  function isPaddleMotionCycle(c) {
    assert(isPaddle(c));
    return isPaddleMotionCycleHelper(c);
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

  const pixelEncoding = [0, 1, 0, 0, 0, 1, 1, 1, 0, 1];
  function drawPaddle(c, isLeft, topInPaddleCoords, dest) {
    assert(_.isBoolean(isLeft));
    assert(_.isNumber(topInPaddleCoords));
    assert(topInPaddleCoords >= 0);
    assert(topInPaddleCoords + 10 <= insideWallHeight);
    assert(_.isNumber(dest) && dest >= 0 && dest < 8);
    let paddleBaseColor = bm.or([nsGlobal.IS_NOT_BACKGROUND.getMask(),
                                 nsNonbackground.PADDLE_FLAG.getMask()]);
    let bufferBaseColor = bm.or([nsBackground.BASIC_BACKGROUND.getMask(),
                                 nsBackground.PADDLE_BUFFER_FLAG.getMask(),
                                 nsBackground.BUFFER_X_FLAG.getMask()]);
    paddleBaseColor =
      nsPaddle.PADDLE_POSITION.set(paddleBaseColor, topInPaddleCoords);
    bufferBaseColor =
      nsBackground.PADDLE_POSITION.set(bufferBaseColor, topInPaddleCoords);
    paddleBaseColor = nsPaddle.PADDLE_DEST.set(paddleBaseColor, dest);
    bufferBaseColor = nsBackground.PADDLE_DEST.set(bufferBaseColor, dest);
    for (let pixel = 0; pixel < 10; ++pixel) {
      let paddleColor =
        nsPaddle.PADDLE_PIXEL.set(paddleBaseColor, pixelEncoding[pixel]);
      let bufferColor =
        nsBackground.PADDLE_PIXEL.set(bufferBaseColor, pixelEncoding[pixel]);
      let currentHeight = topInPaddleCoords + pixel;
      if (currentHeight < BUFFER_SIZE ||
          currentHeight >= insideWallHeight - BUFFER_SIZE) {
        bufferColor = nsBackground.BUFFER_Y_FLAG.setMask(bufferColor, true);
      }
      // Draw 10 rows of buffer, but 6 paddle pixels.
      c.fillRect(bufferColor,
                 isLeft ? insideWallOriginX + 1
                        : insideWallOriginX + insideWallWidth - 1 - BUFFER_SIZE,
                 topInPaddleCoords + insideWallOriginY + pixel,
                 BUFFER_SIZE, 1);
      if (pixel > 1 && pixel < 8) {
        c.fillRect(paddleColor,
                   isLeft ? insideWallOriginX
                          : insideWallOriginX + insideWallWidth - 1,
                   topInPaddleCoords + insideWallOriginY + pixel, 1, 1);
      }
    }
  }

  function initBigRespawn(c) {
    initBitManager();

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
    let trough = bm.or([nsBackground.TROUGH_FLAG.getMask(), background]);
    c.fillRect(trough, insideWallOriginX, insideWallOriginY, 1,
               insideWallHeight);
    c.fillRect(trough, insideWallOriginX + insideWallWidth - 1,
               insideWallOriginY, 1, insideWallHeight);

    // arbitrarily moving ball
    var left = Math.round(55);
    var top = Math.round(56);
    const ballColor =
      BallState.create(bm, 1, 1, 6, 1,
                       bm.or([nsGlobal.IS_NOT_BACKGROUND.getMask(),
                              nsNonbackground.BALL_FLAG.getMask(),
                              nsNonbackground.FULL_ALPHA.getMask()]))
        .nextColor();

    c.fillRect(ballColor, left, top, BALL_SIZE, BALL_SIZE);

    drawPaddle(c, true, 42, 4);
    drawPaddle(c, false, 48, 5);
  }

  function getBufferBits(data, bs) {
    function testBounds(lower, current, higher, flag,
                        bsDepth, bsDir) {
      assert(BUFFER_SIZE === 3);
      if (isWall(lower) || isTrough(lower) || isPaddle(lower)) {
        return 'min';
      }
      if (isWall(higher) || isTrough(higher) || isPaddle(higher)) {
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
    let bufferX;
    let bufferY;
    let paddleBuffer;
    if (isBall(current)) {
      bufferX = nsBall.BUFFER_X_FLAG.get(current);
      bufferY = nsBall.BUFFER_Y_FLAG.get(current);
      paddleBuffer = nsBall.PADDLE_BUFFER_FLAG.get(current);
    } else {
      assert(isBackground(current));
      bufferX = nsBackground.BUFFER_X_FLAG.get(current);
      bufferY = nsBackground.BUFFER_Y_FLAG.get(current);
      paddleBuffer = nsBackground.PADDLE_BUFFER_FLAG.get(current);
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
      paddleBuffer: paddleBuffer
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

  function handleTroughAndPaddle(data, x, y) {
    let current = data[4];
    let left = false;
    if (isTrough(current) &&
        ((left = _.every([0, 3, 6], i => isBall(data[i]))) ||
         _.every([2, 5, 8], i => isBall(data[i])))) {
      let ballMissedPaddle =
        !nsBall.BUFFER_X_DEPTH_COUNTER.get(left ? data[0] : data[2])
      if (ballMissedPaddle) {
        return nsBackground.BALL_MISS_FLAG.set(current, 1);
      }
    }
    let newDest;
    for (let i of [3, 5]) {
      let color = data[i];
      if (isBackground(color) && nsBackground.MESSAGE_PRESENT.isSet(color) &&
          nsBackground.MESSAGE_R_NOT_L.isSet(color) === (i === 3)) {
        newDest = nsBackground.MESSAGE_PADDLE_POSITION.get(color);
      }
    }
    if (isPaddle(current) && !isPaddleMotionCycle(current)) {
      let nextColor =
        nsPaddle.DECIMATOR.setMask(current, !nsPaddle.DECIMATOR.isSet(current));
      if (newDest !== undefined) {
        nextColor = nsPaddle.PADDLE_DEST.set(nextColor, newDest);
      }
      return nextColor;
    }
    for (let index of [1, 4, 7]) {
      let color = data[index];
      if (isPaddle(color)) {
        if (!isPaddleMotionCycle(color)) {
          // no need to check any other paddle pixels
          break;
        }
        let ps = new PaddleState(color);
        if ((index === 1 && ps.getDY() > 0) ||
            (index === 4 && ps.getDY() === 0) ||
            (index === 7 && ps.getDY() < 0)) {
          let nextColor = ps.nextColor();
          if (newDest !== undefined) {
            nextColor = nsPaddle.PADDLE_DEST.set(nextColor, newDest);
          }
          return nextColor;
        }
      }
    }
    let color = bm.or([nsBackground.TROUGH_FLAG.getMask(),
                       nsBackground.BASIC_BACKGROUND.getMask()]);
    return nsBackground.BALL_MISS_FLAG.set(color, 0);
  }

  function handleRespawnMessage(data, x, y) {
    let current = data[4];
    let backgroundAbove = isBackground(data[1]);
    let topWallCenterAbove = isTopWallCenter(data[1]);
    if (isBackground(current) && (backgroundAbove || topWallCenterAbove)) {
      let activeRespawnMessage =
        (backgroundAbove && nsBackground.MESSAGE_PRESENT.isSet(data[1]) &&
         !nsBackground.MESSAGE_H_NOT_V.isSet(data[1])) ||
        (topWallCenterAbove && nsWall.MESSAGE_PRESENT.isSet(data[1]))
      let rightNotL;
      if (backgroundAbove) {
        rightNotL = nsBackground.MESSAGE_R_NOT_L.isSet(data[1]);
      } else {
        rightNotL = nsWall.MESSAGE_R_NOT_L.isSet(data[1]);
      }
      let decimator;
      let respawn = isRespawn(current);
      if (respawn) {
        decimator = nsBackground.DECIMATOR.isSet(current);
      }
      if (activeRespawnMessage) {
        if (isCenterRespawn(data)) {
          let color = nsBackground.MESSAGE_R_NOT_L.set(current, rightNotL);
          color = nsBackground.RESPAWN_FLAG.set(color, true);
          color = nsBackground.RESPAWN_PHASE_2_FLAG.set(color, true);
          color = nsBackground.DECIMATOR.setMask(color, !decimator);
          return { value: color };
        } else {
          let color = nsBackground.MESSAGE_R_NOT_L.setMask(current, rightNotL);
          color = nsBackground.MESSAGE_PRESENT.setMask(current, true);
          if (respawn) {
            color = nsBackground.DECIMATOR.setMask(color, !decimator);
          }
          return { value: color };
        }
      }
    }
    if (isRespawn(current)) {
      let decimator = nsBackground.DECIMATOR.isSet(current);
      for (let d of data) {
        if (isBackground(d) && nsBackground.RESPAWN_PHASE_2_FLAG.get(d)) {
          let rightNotL = nsBackground.MESSAGE_R_NOT_L.get(d);
          let color = bm.or([nsGlobal.IS_NOT_BACKGROUND.getMask(),
                             nsNonbackground.BALL_FLAG.getMask(),
                             nsNonbackground.FULL_ALPHA.getMask()]);
          color = nsBall.RESPAWN_FLAG.setMask(color, true);
          var bs = BallState.create(bm, rightNotL, 1, 5, 0, color);
          let next = bs.getColor();
          next = nsBall.DECIMATOR.setMask(next, !decimator);
          return { value: next };
        }
      }
    }
    return null;
  }

  // Figure out the relevant paddle pixel for bounce, or return null if the ball
  // isn't completely within the paddle buffer region.  We have bs, so we know
  // that at least one ball pixel is within reach, and we know that data[4] is
  // in the paddle buffer region.
  function getPaddlePixel(ballDY, data, ballDataColumn, x, y) {
    assert(isInPaddleBufferRegion(data[4]));
    let d0 = data[ballDataColumn[0]]
    let d1 = data[ballDataColumn[1]]
    let d2 = data[ballDataColumn[2]]
    let bTop = isBall(d0);
    let bMid = isBall(d1);
    let bBot = isBall(d2);
    let ballCurPos;
    if (bTop && bMid && bBot) {
      ballCurPos = 0;
    } else if (bTop && bMid) {
      ballCurPos = -1;
    } else if (bMid && bBot) {
      ballCurPos = 1;
    } else if (bTop) {
      ballCurPos = -2;
    } else if (bBot) {
      ballCurPos = 2;
    } else {
      assert(false);
    }
    // How can we tell which ball pixel we're going to be?  The ball hasn't
    // moved yet, so we can't just look at our neighbors.  We can tell from bs
    // where the ball's coming from.  It must have dX != 0, and dY can be in
    // [-1,0,1].  We should be able to see enough pixels to know--either we can
    // see ball pixels, or we can see above or below, and so detect an edge.
    // If dY === 0, check offsets (-dX, 1), and (-dX, 0) for isBall.
    // Hmm...check them all anyway.  If you see the bottom or top edge, that
    // tells you where it is now.  If you don't that tells you too.  Then use dY
    // to tell you where it's going to be.
    let ballNextPos = ballCurPos + ballDY;
    let paddlePixel =
      ballNextPos + getPaddlePixelHelper(data[1], data[4], data[7]);
    if (paddlePixel >= 0 && paddlePixel <= 7) {
      return { value: paddlePixel };
    }
    return null;
  }

  /* Assumes this encoding and a 10-pixel paddle region now: 0100011101.
     Assumes the center pixel is in the paddle region.
     Returns the paddle pixel value for that center pixel.
     Returns a value between -1 and 8.

      xxxb
      xxxb
      xxxp  // This is the highest hit; above this it's a miss.
         p  // So let's call that 0.  Above that is -1.  Since the center
         p  // pixel in our data is guaranteed to be in-region, we can't get
         p  // -2 or above.
         p
         p
         b
         b

         b
         b
         p
         p
         p
         p
         p
      xxxp  // This is the lowest hit; below this it's a miss.
      xxxb  // It's pixel 7.  So there are 8 valid positions, 6 for the length
      xxxb  // of the paddle, plus 2 for the excess width of the ball, using the
            // 10 slots of the single-bit encoding.
 */

  function getPaddlePixelHelper(d0, d1, d2) {
    let isP0 = isInPaddleBufferRegion(d0);
    assert(isInPaddleBufferRegion(d1));
    let isP2 = isInPaddleBufferRegion(d2);
    assert(isP0 || isP2);
    if (!isP0) {
      return -1;
    } else if (!isP2) {
      return 8;
    }
    let code = 0;
    for (let d of [d0, d1, d2]) {
      let bit;
      if (isBall(d)) {
        bit = nsBall.PADDLE_PIXEL.get(d);
      } else {
        bit = nsBackground.PADDLE_PIXEL.get(d);
      }
      code = ((code << 1) | bit) >>> 0;
    }
    switch (code) {
      case 2:
        return 0;
      case 4:
        return 1;
      case 0:
        return 2;
      case 1:
        return 3;
      case 3:
        return 4;
      case 7:
        return 5;
      case 6:
        return 6;
      case 5:
        return 7;
      default:
        assert(false);
        break;
    }
  }

  // This takes care of moving balls only, not stationary ones.
  function handleIncomingBall(data, x, y) {
    const current = data[4];
    for (let i = 0; i < 9; ++i) {
      let color = data[i];
      if (isBall(color)) {
        if (!isBallMotionCycle(color)) {
          break;
        }
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
            assert(bs.getDepthX() <= BUFFER_SIZE);
            // Mark the ball for bounce or destruction.
            let worthChecking =
              isPaddleBuffer(current) || isBallInPaddleBuffer(current);
            let ballDataColumn, v;
            if (bs.right) {
              ballDataColumn = [0, 3, 6];
            } else {
              ballDataColumn = [2, 5, 8];
            }

            if (worthChecking &&
                (v = getPaddlePixel(bs.dY, data, ballDataColumn, x, y))) {
              bs.bounce('x', v.value)
            } else {
              bs.setDepthX(0);
            }
          }
          if (bs.getDepthY() >= BUFFER_SIZE) {
            assert(bs.getDepthY() <= BUFFER_SIZE);
            bs.reflect('y')
          }
          let respawn;
          let bufferXFlag = bufferXMin || bufferXMax;
          let bufferYFlag = bufferYMin || bufferYMax;
          let nextColor = bs.nextColor();
          nextColor = nsBall.DECIMATOR.set(nextColor, 0);
          nextColor = nsBall.BUFFER_X_FLAG.set(nextColor, bufferXFlag);
          nextColor = nsBall.BUFFER_Y_FLAG.set(nextColor, bufferYFlag);
          nextColor = nsBall.PADDLE_BUFFER_FLAG.set(nextColor,
                                                    bufferBits.paddleBuffer);
          if (isBall(current)) {
            respawn = nsBall.RESPAWN_FLAG.get(current);
            if (nsBall.PADDLE_BUFFER_FLAG.isSet(current)) {
              let paddleBits = nsBall.PADDLE_BALL_BITS.get(current);
              nextColor = nsBall.PADDLE_BALL_BITS.set(nextColor, paddleBits);
            } else {
              nextColor = nsBall.PADDLE_BALL_BITS.setMask(nextColor, false);
            }
          } else {
            assert(isBackground(current));
            respawn = isRespawn(current);
            if (isPaddleBuffer(current)) {
              nextColor =
                BitManager.copyBits(nsBall, nextColor, nsBackground, current,
                                    copySets.PADDLE_BALL_BITS)
            } else {
              nextColor = nsBall.PADDLE_BALL_BITS.setMask(nextColor, false);
            }
          }
          nextColor = nsBall.RESPAWN_FLAG.set(nextColor, respawn);
          return { value: nextColor };
        }
      }
    }
    return null;
  }


  /* I had an off-by-one miss that would actually have hit if we let the
   * Bresenham motion continue until it really banged the paddle, but since we
   * evaluate it as soon as it's near the paddle, it misses.  If that's really
   * the only cause of the bug, we could try to change back to checking for the
   * real impact, but we'd need a bit for min/max buffer, as it would break the
   * code that figures that out.

   * How hard is the math for dealing with state?  When we bounce, we make sure
   * it has a state that moves off the paddle immediately.  We know the length
   * of its cycle from the move table.  But it's quite fiddly to determine how
   * many Y moves happen in precisely the X distance across, I think, especially
   * in e.g. the 2/3 case.  Hmm...what if we made the board width a multiple of
   * 6, or a multiple of 6 plus or minus 1?  I'm still not sure that fixes it
   * entirely, but it seems likely to be relevant.  Plus one...assume that
   * multiple is 0.  The board's 1 pixel wide, so you get a horizontal move and
   * hit the next paddle in 1 cycle.  But is that where we thought you'd hit?
   * Your slope is 0, 1, 1/2, 1/3, 2/3, 3/2, 2, or 3.

      Slope  First dX  First dY  Result
      0          1        0       Fine
      1          1        1       Fine
      2          2        2       Fine
      3          1        3       Fine
      1/3        1        0       Fine [we'd round down]
      1/2        1        0       Fine [we'd round down]
      2/3        1        0       Fine [we'd round down]
      3/2        1        1       Fine [we'd round up]

   * That seems likely to work.  If it doesn't, a robust solution would be to
   * make the paddles 2 pixels longer, but that would take more bits, so put
   * that off until after we optimize storage.
   */
  function getNewAIMessage(data, x, y, color) {
    let current = data[4];
    let above = false;
    let messageRightNotL = false;
    if (isPaddleBuffer(current) &&
        ((messageRightNotL = (isTrough(data[3]) || isPaddle(data[3]))) ||
         (isTrough(data[5]) || isPaddle(data[5]))) &&
        ((above = isBall(data[1])) || isBall(data[7]))) {
      let ball = above ? data[1] : data[7];
      if (!isBallMotionCycle(ball) &&
          (nsBall.BUFFER_X_DEPTH_COUNTER.get(ball) === BUFFER_SIZE)) {
        let bs = new BallState(bm, ball);
        let paddlePixel = getPaddlePixel(0, data, [1, 4, 7], x, y).value;
        let start = nsBackground.PADDLE_POSITION.get(current) + paddlePixel;

        let dY = bs.getSlope() * paddleToPaddleBallDistance;
        if (!bs.down) {
          dY = -dY
        }
        let fullY = start + dY;
        let clippedY = fullY % topWallToBottomWallBallDistance;
        if (clippedY < 0) {
          clippedY += topWallToBottomWallBallDistance;
        }
        assert(clippedY >= 0 && clippedY < topWallToBottomWallBallDistance);
        if (Math.floor(fullY / topWallToBottomWallBallDistance) % 2) {
          clippedY = topWallToBottomWallBallDistance - clippedY
        }
        color = nsBackground.MESSAGE_PRESENT.setMask(color, true);
        color = nsBackground.MESSAGE_H_NOT_V.setMask(color, true);
        color = nsBackground.MESSAGE_R_NOT_L.setMask(color, messageRightNotL);
        return { value: nsBackground.MESSAGE_PADDLE_POSITION.set(
                          color, clippedY >>> 3) };
      }
    }
    return null;
  }

  function getAIMessage(data, x, y, color) {
    let current = data[4];
    // preexisting message
    for (let i of [0, 2, 3, 5, 6, 8]) {
      let source = data[i];
      let active = isBackground(source) &&
                   nsBackground.MESSAGE_PRESENT.isSet(source) &&
                   nsBackground.MESSAGE_H_NOT_V.isSet(source);
      if (active &&
          (nsBackground.MESSAGE_R_NOT_L.isSet(source) === (i % 3 === 0))) {
        let bits = nsBackground.ALL_MESSAGE_BITS.get(source);
        return nsBackground.ALL_MESSAGE_BITS.set(color, bits);
      }
    }
    let v;
    if (v = getNewAIMessage(data, x, y, color)) {
      return v.value;
    }
    return nsBackground.ALL_MESSAGE_BITS.setMask(color, false);
  }

  function handleAIMessageInPaddleBuffer(data, x, y, nextColor) {
    if (nsBackground.MESSAGE_PRESENT.isSet(nextColor)) {
      let isLeft, isLeadingEdge, isNotForUs = false;
      if (isBall(data[3]) || isBall(data[5])) {
        // No message for us comes while a ball is nearby.
        isNotForUs = true;
      } else if (isPaddle(data[3]) || isTrough(data[3])) {
        // Left paddle, left edge
        isLeft = true;
        isLeadingEdge = false;
      } else if (isPaddle(data[5]) || isTrough(data[5])) {
        // Right paddle, right edge
        isLeft = false;
        isLeadingEdge = false;
      } else if (!isPaddleBuffer(data[3])) {
        // Right paddle, left edge
        isLeft = false;
        isLeadingEdge = true;
      } else if (!isPaddleBuffer(data[5])) {
        // Left paddle, right edge
        isLeft = true;
        isLeadingEdge = true;
      } else if (nsBackground.PADDLE_MOVE_DELAY_COUNTER.get(data[3])) {
        // Right paddle, middle
        isLeft = false;
        isLeadingEdge = false;
      } else if (nsBackground.PADDLE_MOVE_DELAY_COUNTER.get(data[5])) {
        // Left paddle, middle
        isLeft = true;
        isLeadingEdge = false;
      } else {
        // This is a message going the wrong direction for us.
        // Some of the above messages may not be for us, but we don't know in
        // all cases, so we'll figure it out below.
        isNotForUs = true;
      }
      // Can't get a message while we're moving.
      assert(nsBackground.PADDLE_DEST.get(nextColor) ===
             (nsBackground.PADDLE_POSITION.get(nextColor) >>> 3));
      if (!isNotForUs &&
          (nsBackground.MESSAGE_R_NOT_L.isSet(nextColor) !== isLeft)) {
        let dest = nsBackground.MESSAGE_PADDLE_POSITION.get(nextColor);
        nextColor = nsBackground.PADDLE_DEST.set(nextColor, dest);
        if (isLeadingEdge) {
          nextColor =
            nsBackground.PADDLE_MOVE_DELAY_COUNTER.set(
              nextColor, BUFFER_SIZE);
        } else {
          let counter =
            nsBackground.PADDLE_MOVE_DELAY_COUNTER.get(
              data[isLeft ? 5 : 3]);
          nextColor =
            nsBackground.PADDLE_MOVE_DELAY_COUNTER.set(nextColor,
                                                       counter - 1);
        }
      }
    } else {
      let counter = nsBackground.PADDLE_MOVE_DELAY_COUNTER.get(nextColor);
      if (counter > 0) {
        nextColor = nsBackground.PADDLE_MOVE_DELAY_COUNTER.set(nextColor,
                                                               counter - 1);
      }
    }
    return nextColor;
  }

  function handleBecomingOrStayingBackgroundOrStayingBall(data, x, y) {
    const current = data[4];
    let respawn;
    let bufferXFlag;
    let bufferYFlag;
    let nextColor;
    let decimator;
    let willBeBall = false;
    let willBePaddleBuffer = false;
    let bs;

    if (isBall(current)) {
      decimator = nsBall.DECIMATOR.isSet(current);
      respawn = nsBall.RESPAWN_FLAG.get(current);
      bufferXFlag = nsBall.BUFFER_X_FLAG.get(current);
      bufferYFlag = nsBall.BUFFER_Y_FLAG.get(current);
      if (!isBallMotionCycle(current)) { // else it's becoming background.
        if (bufferXFlag && !nsBall.BUFFER_X_DEPTH_COUNTER.get(current)) {
          // The ball has hit the end wall and should vanish, so ignore it.
        } else {
          willBeBall = true;
          bs = new BallState(bm, current);
        }
      }
    } else {
      assert(isBackground(current));
      respawn = isRespawn(current);
      bufferXFlag = nsBackground.BUFFER_X_FLAG.get(current);
      bufferYFlag = nsBackground.BUFFER_Y_FLAG.get(current);
      if (respawn || isPaddleBuffer(current)) {
        decimator = nsBackground.DECIMATOR.isSet(current);
      }
    }
    let nsOutput;
    if (willBeBall) {
      nsOutput = nsBall;
      // This already has respawn, bufferXFlag and bufferYFlag set correctly.
      nextColor = bs.nextColor();
      nextColor = nsBall.PADDLE_BALL_BITS.set(nextColor, 0);
    } else {
      nsOutput = nsBackground;
      nextColor = nsBackground.BASIC_BACKGROUND.getMask()
      nextColor = nsOutput.BUFFER_X_FLAG.set(nextColor, bufferXFlag);
      nextColor = nsOutput.BUFFER_Y_FLAG.set(nextColor, bufferYFlag);
      nextColor = nsOutput.RESPAWN_FLAG.set(nextColor, respawn);
      nextColor = getAIMessage(data, x, y, nextColor);
    }

    let paddleBufferBitsSource;
    let nsSource;
    if (bufferXFlag || bufferYFlag) {
      assert(!respawn);
      if (bufferXFlag) {
        if (isInPaddleBufferRegion(current) &&
            !isPaddleMotionCycleGeneral(current)) {
          paddleBufferBitsSource = current;
          willBePaddleBuffer = true;
          nsSource = isBall(current) ? nsBall : nsBackground;
        } else {
          for (let i of [4, 1, 7]) {
            let color = data[i];
            if (isInPaddleBufferRegion(color)) {
              if (i !== 4 && !isPaddleMotionCycleGeneral(color)) {
                break; // early-out depends on trying 4 first
              }
              let ps = new PaddleState(color);
              let source = sourceDirectionFromIndex(i);
              if (source.dY === ps.getDY()) {
                willBePaddleBuffer = true;
                paddleBufferBitsSource = ps.nextColor();
                decimator = ps.decimator;
                nsSource = ps.getNamespace();
                break;
              }
            }
          }
        }
        if (willBePaddleBuffer) {
          nextColor = nsOutput.PADDLE_BUFFER_FLAG.set(nextColor, true);
          if (willBeBall === isBall(paddleBufferBitsSource)) {
            assert(nsOutput === nsSource);
            let bitFlag;
            // TODO: Should these have the same name, despite having different
            // members?  Maybe PADDLE_SHARED_BITS?
            if (willBeBall) {
              bitFlag = nsBall.PADDLE_BALL_BITS;
            } else {
              bitFlag = nsBackground.PADDLE_BACKGROUND_BITS;
            }
            nextColor = bitFlag.set(nextColor,
                                    bitFlag.get(paddleBufferBitsSource));
          } else {
            nextColor =
              BitManager.copyBits(nsOutput, nextColor, nsSource,
                                  paddleBufferBitsSource,
                                  copySets.PADDLE_BALL_BITS)
          }
          // If an AI message is passing through, process it.  How can we tell
          // whether we're a right or left paddle?  The left and right edges
          // know, but the middle doesn't.  Ah, but it can tell by how its
          // neighbors are reacting to the message.
          if (!willBeBall) {
            nextColor = handleAIMessageInPaddleBuffer(data, x, y, nextColor);
          }
        }
      }
    }
    if (willBeBall || willBePaddleBuffer || respawn) {
      assert(decimator !== undefined);
      nextColor = nsOutput.DECIMATOR.setMask(nextColor, !decimator);
    }
    return nextColor;
  }

  function bigRespawn(data, x, y) {
    const current = data[4];
    let v;

    if (isWall(current)) {
      return handleWall(data, x, y);
    }

    // Trough doesn't have to deal with balls, messages, or respawn, only ball
    // deaths and eventually the paddle.
    if (isTrough(current) || isPaddle(current)) {
      return handleTroughAndPaddle(data, x, y);
    }

    // We won't receive a respawn message and a ball in the same cycle.
    if (v = handleRespawnMessage(data, x, y)) {
      return v.value;
    }

    // Moving balls are handled here, stationary balls and background will be
    // dealt with in handleBecomingOrStayingBackgroundOrStayingBall.
    if (v = handleIncomingBall(data, x, y)) {
      return v.value;
    }

    return handleBecomingOrStayingBackgroundOrStayingBall(data, x, y);
  }

  registerAnimation("big respawn", initBigRespawn, bigRespawn);

})();
