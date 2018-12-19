"use strict";
/*
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
  const OBVIOUS_COLORS = true;
  const LONG_DEMO = true;
  const BALL_SIZE_BITS = 2;
  // We need to keep the depth counter from overflowing, so the buffer can't be
  // as deep as 1 << BALL_SIZE_BITS.
  const BALL_SIZE = (1 << BALL_SIZE_BITS) - 1;
  //const BALL_SIZE = 4;
  const BUFFER_X_DEPTH_COUNTER_BITS = BALL_SIZE_BITS;
  const BUFFER_Y_DEPTH_COUNTER_BITS = BALL_SIZE_BITS;
  const BUFFER_SIZE = BALL_SIZE;
  const SCOREBOARD_HEIGHT = 10;
  const SCOREBOARD_WIDTH = 15;

  // This is assumed throughout the file, in figuring out buffer bits and ball
  // pixels.
  assert(BALL_SIZE === 3);

  let ballAreaWidth;
  let ballAreaHeight;
  let paddleToPaddleBallDistance;
  let topWallToBottomWallBallDistance;

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
    if (OBVIOUS_COLORS) {
      nsBackground.declare('FULL_ALPHA', 3, 28);
      nsBackground.alias('BASIC_BACKGROUND', 'FULL_ALPHA');
    } else {
      nsBackground.alloc('BASIC_BACKGROUND', 0, 0);
    }

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
    nsBall.alloc('DECIMATOR', 1);
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

    nsWall.alloc('LISTEN_DOWN', 1);
    nsWall.alloc('LISTEN_UP_FOR_L', 1);
    nsWall.alloc('LISTEN_UP_FOR_R', 1);
    nsWall.alloc('LISTEN_RIGHT_FOR_R', 1);
    nsWall.alloc('LISTEN_LEFT_FOR_L', 1);
    nsWall.alloc('LISTEN_LEFT', 1);
    nsWall.alloc('LISTEN_RIGHT', 1);
    nsWall.alloc('TALK_DOWN_TO_BACKGROUND', 1);
    nsWall.alias('TOP_WALL_CENTER_FLAG', 'TALK_DOWN_TO_BACKGROUND');
    nsWall.alloc('SIDE_WALL_FLAG', 1);

    nsBackground.alloc('RESPAWN_FLAG', 1);
    // TODO: We can do without this, by figuring out which respawn pixel we're
    // on and watching the message hit the center one, in a 3x3 ball.
    nsBackground.alloc('RESPAWN_PHASE_2_FLAG', 1);
    nsBackground.alloc('TROUGH_FLAG', 1);
    nsBackground.declare('BALL_MISS_FLAG', 1, 13);

    // Used by background and ball [since the ball has to replace the background
    // bits it runs over].
    nsBall.alloc('BUFFER_X_FLAG', 1);
    nsBall.alloc('BUFFER_Y_FLAG', 1);
    nsBackground.alloc('BUFFER_X_FLAG', 1);
    nsBackground.alloc('BUFFER_Y_FLAG', 1);

    nsBall.alloc('RESPAWN_FLAG', 1);

    // Paddle fields
    nsPaddle.alloc('DECIMATOR', 1);
    nsPaddle.alloc('PADDLE_POSITION', 6);
    nsPaddle.alloc('PADDLE_DEST', 3);
    nsPaddle.alloc('PADDLE_PIXEL', 1);

    // Background fields for paddle
    nsBackground.alloc('DECIMATOR', 1);
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

  function initPong(c, originX, originY, width, height) {
    // width must be at least one plus BUFFER_SIZE greater than the height for
    // the AI message to be safe, otherwise a corner-sourced message might not
    // reach all pixels of the paddle, leading to it tearing in half.
    assert(width + 1 + BUFFER_SIZE >= height);
    const gameOriginX = originX;
    const gameOriginY = originY + SCOREBOARD_HEIGHT;
    const gameWidth = width;
    const gameHeight = height - SCOREBOARD_HEIGHT;
    const insideWallOriginX = gameOriginX + 1;
    const insideWallOriginY = gameOriginY + 1;
    const insideWallWidth = gameWidth - 2;
    const insideWallHeight = gameHeight - 2;
    const ballAreaOriginX = insideWallOriginX + 1; // skip the trough
    const ballAreaOriginY = insideWallOriginY;
    // 2 for trough/paddle
    ballAreaWidth = insideWallWidth - 2;
    ballAreaHeight = insideWallHeight;
    const halfHeight = Math.floor(height / 2);
    paddleToPaddleBallDistance = ballAreaWidth - BALL_SIZE;
    topWallToBottomWallBallDistance = ballAreaHeight - BALL_SIZE;

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
                   isLeft ? ballAreaOriginX
                          : ballAreaOriginX + ballAreaWidth - BUFFER_SIZE,
                   topInPaddleCoords + ballAreaOriginY + pixel,
                   BUFFER_SIZE, 1);
        if (pixel > 1 && pixel < 8) {
          c.fillRect(paddleColor,
                     isLeft ? insideWallOriginX
                            : insideWallOriginX + insideWallWidth - 1,
                     topInPaddleCoords + insideWallOriginY + pixel, 1, 1);
        }
      }
    }

    initBitManager();

    // background
    let background = nsBackground.BASIC_BACKGROUND.getMask();
    c.fillRect(background, 0, 0, canvas.width, canvas.height);

    let topWallCenterX = Math.ceil(gameWidth / 2);

    // respawn square
    c.orRect(nsBackground.RESPAWN_FLAG.getMask(),
      topWallCenterX - 1, gameOriginY + halfHeight - 1, BALL_SIZE, BALL_SIZE);

    let leftScoreboardRightEdge = originX + SCOREBOARD_WIDTH - 1;
    let rightScoreboardLeftEdge = originX + width - SCOREBOARD_WIDTH;
    let leftRespawnDownPathX = leftScoreboardRightEdge - 1;
    let rightRespawnDownPathX = rightScoreboardLeftEdge + 1;
    // walls
    let color = bm.or([nsGlobal.IS_NOT_BACKGROUND.getMask(),
                       nsNonbackground.WALL_FLAG.getMask(),
                       nsNonbackground.FULL_ALPHA.getMask()]);
    c.strokeRect(color, originX, originY,
                 SCOREBOARD_WIDTH, SCOREBOARD_HEIGHT + 1);
    c.strokeRect(color, originX + width - SCOREBOARD_WIDTH, originY,
                 SCOREBOARD_WIDTH, SCOREBOARD_HEIGHT + 1);
    c.strokeRect(color, originX, originY,
                 width, SCOREBOARD_HEIGHT + 1);
    c.strokeRect(color, gameOriginX, gameOriginY,
                 gameWidth, gameHeight);
    c.orRect(nsWall.SIDE_WALL_FLAG.getMask(),
             gameOriginX, gameOriginY + 1, 1, gameHeight - 2);
    c.orRect(nsWall.LISTEN_DOWN.getMask(),
             originX, originY, 1, height - 1);
    c.orRect(nsWall.SIDE_WALL_FLAG.getMask(),
             gameOriginX + gameWidth - 1, gameOriginY + 1, 1, gameHeight - 2);
    c.orRect(nsWall.LISTEN_DOWN.getMask(),
             originX + width - 1, originY, 1, height - 1);
    c.orRect(nsWall.LISTEN_LEFT.getMask(),
             originX + 1, originY, width - SCOREBOARD_WIDTH, 1);
    c.orRect(nsWall.LISTEN_RIGHT.getMask(),
             leftScoreboardRightEdge, originY,
             width - SCOREBOARD_WIDTH, 1);
    c.orRect(nsWall.LISTEN_UP_FOR_L.getMask(),
             leftScoreboardRightEdge, originY + 1, 1, SCOREBOARD_HEIGHT);
    c.orRect(nsWall.LISTEN_UP_FOR_R.getMask(),
             rightScoreboardLeftEdge, originY + 1, 1, SCOREBOARD_HEIGHT);

    c.orRect(nsWall.LISTEN_LEFT_FOR_L.getMask(),
             leftScoreboardRightEdge + 1, originY + SCOREBOARD_HEIGHT,
             rightRespawnDownPathX - leftScoreboardRightEdge, 1);
    c.orRect(nsWall.LISTEN_RIGHT_FOR_R.getMask(),
             leftRespawnDownPathX, originY + SCOREBOARD_HEIGHT,
             width - SCOREBOARD_WIDTH * 2 + 2, 1);
    c.orRect(nsWall.TALK_DOWN_TO_BACKGROUND.getMask(),
             leftRespawnDownPathX, originY + SCOREBOARD_HEIGHT, 1, 1);
    c.orRect(nsWall.TALK_DOWN_TO_BACKGROUND.getMask(),
             rightRespawnDownPathX, originY + SCOREBOARD_HEIGHT, 1, 1);
    /*
    c.orRect(nsWall.TOP_WALL_CENTER_FLAG.getMask(),
             topWallCenterX, gameOriginY, 1, 1);
    */

    // buffer regions
    let bufferX = nsBackground.BUFFER_X_FLAG.getMask();
    let bufferY = nsBackground.BUFFER_Y_FLAG.getMask();
    c.orRect(bufferX,
             ballAreaOriginX, ballAreaOriginY,
             BUFFER_SIZE, ballAreaHeight);
    c.orRect(bufferX,
             ballAreaOriginX + ballAreaWidth - BUFFER_SIZE,
             ballAreaOriginY,
             BUFFER_SIZE, ballAreaHeight);
    c.orRect(bufferY,
             ballAreaOriginX, ballAreaOriginY,
             ballAreaWidth, BUFFER_SIZE);
    c.orRect(bufferY,
             ballAreaOriginX,
             ballAreaOriginY + ballAreaHeight - BUFFER_SIZE,
             ballAreaWidth, BUFFER_SIZE);


    // trough lines
    let trough = bm.or([nsBackground.TROUGH_FLAG.getMask(), background]);
    c.fillRect(trough, insideWallOriginX, insideWallOriginY, 1,
               insideWallHeight);
    c.fillRect(trough, insideWallOriginX + insideWallWidth - 1,
               insideWallOriginY, 1, insideWallHeight);

    // arbitrarily moving ball
    var left = 55;
    var top = 46;
    const ballColor =
      BallState.create(nsBall, 1, 1, 3, 1,
                       bm.or([nsGlobal.IS_NOT_BACKGROUND.getMask(),
                              nsNonbackground.BALL_FLAG.getMask(),
                              nsNonbackground.FULL_ALPHA.getMask()]))
        .nextColor();

    c.fillRect(ballColor, left, top, BALL_SIZE, BALL_SIZE);

    if (LONG_DEMO) {
      drawPaddle(c, true, 42, 4);
      drawPaddle(c, false, 48, 6);
    } else {
      drawPaddle(c, true, 42, 1);
      drawPaddle(c, false, 48, 1);
    }
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

    function getMessageFrom(d) {
      var next = nsWall.MESSAGE_PRESENT.set(current, 1);
      var rNotL = nsWall.MESSAGE_R_NOT_L.get(d);
      return nsWall.MESSAGE_R_NOT_L.set(next, rNotL);
    }

    if (nsWall.LISTEN_DOWN.isSet(current) &&
        nsWall.MESSAGE_PRESENT.isSet(data[7])) {
      return getMessageFrom(data[7]);
    }
    if (nsWall.LISTEN_RIGHT.isSet(current) &&
        nsWall.MESSAGE_PRESENT.isSet(data[5]) &&
        !nsWall.MESSAGE_R_NOT_L.isSet(data[5])) {
      return getMessageFrom(data[5]);
    }
    if (nsWall.LISTEN_LEFT.isSet(current) &&
        nsWall.MESSAGE_PRESENT.isSet(data[3]) &&
        nsWall.MESSAGE_R_NOT_L.isSet(data[3])) {
      return getMessageFrom(data[3]);
    }
    if (nsWall.LISTEN_RIGHT_FOR_R.isSet(current) &&
        nsWall.MESSAGE_PRESENT.isSet(data[5]) &&
        nsWall.MESSAGE_R_NOT_L.isSet(data[5])) {
      return getMessageFrom(data[5]);
    }
    if (nsWall.LISTEN_LEFT_FOR_L.isSet(current) &&
        nsWall.MESSAGE_PRESENT.isSet(data[3]) &&
        !nsWall.MESSAGE_R_NOT_L.isSet(data[3])) {
      return getMessageFrom(data[3]);
    }
    if (nsWall.LISTEN_UP_FOR_L.isSet(current) &&
        nsWall.MESSAGE_PRESENT.isSet(data[1]) &&
        !nsWall.MESSAGE_R_NOT_L.isSet(data[1])) {
      return getMessageFrom(data[1]);
    }
    if (nsWall.LISTEN_UP_FOR_R.isSet(current) &&
        nsWall.MESSAGE_PRESENT.isSet(data[1]) &&
        nsWall.MESSAGE_R_NOT_L.isSet(data[1])) {
      return getMessageFrom(data[1]);
    }
    if (nsWall.SIDE_WALL_FLAG.isSet(current)) {
      if (isTrough(data[3]) &&
          nsBackground.BALL_MISS_FLAG.isSet(data[3])) {
        return nsWall.MESSAGE_PRESENT.set(current, 1);
      } else if (isTrough(data[5]) &&
                 nsBackground.BALL_MISS_FLAG.isSet(data[5])) {
        var next = nsWall.MESSAGE_PRESENT.set(current, 1);
        return nsWall.MESSAGE_R_NOT_L.set(next, 1);
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
          color = nsBackground.MESSAGE_PRESENT.setMask(color, true);
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
          var bs = BallState.create(nsBall, rightNotL, 1, 5, 0, color);
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
        let bs = new BallState(nsBall, color);
        if (!bs.getDepthX() && nsBall.BUFFER_X_FLAG.get(color) !== 0) {
          // The ball has hit the end wall and should vanish, so ignore it.
          break;
        }
        let source = sourceDirectionFromIndex(i);
        if (source.dX === bs.dX && source.dY === bs.dY) {
          const current = data[4];
          let allMotions = _(data)
            .filter(d => isBall(d))
            .map(b => new BallState(nsBall, b))
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

  /* When we bounce, we make sure the ball has a state that moves off the paddle
     immediately.  We know the length of its cycle from the move table.  But
     it's quite fiddly to determine how many Y moves happen in precisely the X
     distance across, due to quantization and the Bresenham algorithm.  To
     figure out exactly when the ball will strike the far end, we restrict the
     width of the field to be 1 mod 6, since all slopes divide 6.  We use the
     width without that extra 1 as the distance for the slope calculation, then
     add back in the known motion from the current ball state for the last
     pixel.
   */
  function getNewAIMessage(data, x, y, color) {
    let current = data[4];
    let above = false;
    let messageRightNotL = false;
    if (isPaddleBuffer(current) &&
        ((messageRightNotL = (isTrough(data[3]) || isPaddle(data[3]))) ||
         (isTrough(data[5]) || isPaddle(data[5]))) &&
        ((above = isBall(data[1])) || isBall(data[7]))) {
      assert(paddleToPaddleBallDistance % 6 === 1);

      let ball = above ? data[1] : data[7];
      if (!isBallMotionCycle(ball) &&
          (nsBall.BUFFER_X_DEPTH_COUNTER.get(ball) === BUFFER_SIZE)) {
        let bs = new BallState(nsBall, ball);
        let paddlePixel = getPaddlePixel(0, data, [1, 4, 7], x, y).value;
        let start = nsBackground.PADDLE_POSITION.get(current) + paddlePixel;

        let dY = bs.getSlope() * (paddleToPaddleBallDistance - 1);
        if (!bs.down) {
          dY = -dY
        }
        dY += bs.dY;  // add in the dY for the last pixel of x traveled
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

  function getBackgroundOrBallSourceInfo(data, x, y) {
    const current = data[4];
    let respawn;
    let bufferXFlag;
    let bufferYFlag;
    let nextColor;
    let decimator;
    let willBeBall = false;
    let nsOutput;
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
          let bs = new BallState(nsBall, current);
          nsOutput = nsBall;
          // This already has respawn, bufferXFlag and bufferYFlag set
          // correctly.
          nextColor = bs.nextColor();
          nextColor = nsBall.PADDLE_BALL_BITS.set(nextColor, 0);
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
    if (!willBeBall) {
      nsOutput = nsBackground;
      nextColor = nsBackground.BASIC_BACKGROUND.getMask()
      nextColor = nsOutput.BUFFER_X_FLAG.set(nextColor, bufferXFlag);
      nextColor = nsOutput.BUFFER_Y_FLAG.set(nextColor, bufferYFlag);
      nextColor = nsOutput.RESPAWN_FLAG.set(nextColor, respawn);
      nextColor = getAIMessage(data, x, y, nextColor);
    }
    let info = {
      respawn: respawn,
      bufferXFlag: bufferXFlag,
      bufferYFlag: bufferYFlag,
      nextColor: nextColor,
      decimator: decimator,
      willBeBall : willBeBall,
      nsOutput: nsOutput
    };
    return info;
  }

  function willItBeAPaddleBuffer(data, x, y, info) {
    const current = data[4];
    let willBePaddleBuffer = false;
    if (isInPaddleBufferRegion(current) &&
        !isPaddleMotionCycleGeneral(current)) {
      info.paddleBufferBitsSource = current;
      willBePaddleBuffer = true;
      info.nsSource = isBall(current) ? nsBall : nsBackground;
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
            info.paddleBufferBitsSource = ps.nextColor();
            info.decimator = ps.decimator;
            info.nsSource = ps.getNamespace();
            break;
          }
        }
      }
    }
    return willBePaddleBuffer;
  }

  function handleBecomingOrStayingBackgroundOrStayingBall(data, x, y) {
    const current = data[4];
    let info = getBackgroundOrBallSourceInfo(data, x, y);

    let nextColor = info.nextColor;
    let willBeBall = info.willBeBall;
    let nsOutput = info.nsOutput;

    let willBePaddleBuffer = false;
    if (info.bufferXFlag || info.bufferYFlag) {
      assert(!info.respawn);
      if (info.bufferXFlag) {
        willBePaddleBuffer = willItBeAPaddleBuffer(data, x, y, info);
        if (willBePaddleBuffer) {
          nextColor = nsOutput.PADDLE_BUFFER_FLAG.set(nextColor, true);
          if (willBeBall === isBall(info.paddleBufferBitsSource)) {
            assert(nsOutput === info.nsSource);
            let bitFlag;
            // TODO: Should these have the same name, despite having different
            // members?  Maybe PADDLE_SHARED_BITS?
            if (willBeBall) {
              bitFlag = nsBall.PADDLE_BALL_BITS;
            } else {
              bitFlag = nsBackground.PADDLE_BACKGROUND_BITS;
            }
            nextColor = bitFlag.set(nextColor,
                                    bitFlag.get(info.paddleBufferBitsSource));
          } else {
            nextColor =
              BitManager.copyBits(nsOutput, nextColor, info.nsSource,
                                  info.paddleBufferBitsSource,
                                  copySets.PADDLE_BALL_BITS)
          }
          // If an AI message is passing through, process it.
          if (!willBeBall) {
            nextColor = handleAIMessageInPaddleBuffer(data, x, y, nextColor);
          }
        }
      }
    }
    if (willBeBall || willBePaddleBuffer || info.respawn) {
      assert(info.decimator !== undefined);
      nextColor = nsOutput.DECIMATOR.setMask(nextColor, !info.decimator);
    }
    return nextColor;
  }

  function pong(data, x, y) {
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

  let desiredBallAreaHeight = 66;
  let desiredBallAreaWidth = 70;
  let width = desiredBallAreaWidth + 4; // 2x trough, 2x wall
  let height = desiredBallAreaHeight + 2 + SCOREBOARD_HEIGHT; // 2x wall
  registerAnimation("pong", width, height, initPong, pong);

})();
