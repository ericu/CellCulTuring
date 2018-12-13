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
  let isWall, isBackground, isBall, isRespawn, isTrough, isPaddle;
  let isPaddleBuffer, isBallInPaddleBuffer, isInPaddleBufferRegion;
  let isTopWallCenter;
  let copySets = {};
  // TODO: Can we make these not so global?
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

    // Message fields [for wall and background, mostly]
    nsWall.alloc('MESSAGE_R_NOT_L', 1);
    nsBackground.alloc('MESSAGE_R_NOT_L', 1);
    nsWall.declare('MESSAGE_PRESENT', 1, 14);
    nsBackground.declare('MESSAGE_PRESENT', 1, 14);
    copySets.RESPAWN_MESSAGE_BITS = ['MESSAGE_PRESENT', 'MESSAGE_R_NOT_L']
    nsWall.combine('RESPAWN_MESSAGE_BITS', copySets.RESPAWN_MESSAGE_BITS);
    nsBackground.combine('RESPAWN_MESSAGE_BITS', copySets.RESPAWN_MESSAGE_BITS);

    // Used only by the ball.
    nsBall.declare('BRIGHT_BALL_FLAG', 1, 15);

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
    nsBackground.declare('TROUGH_FLAG', 1, 15);
    nsBackground.declare('BALL_MISS_FLAG', 1, 13);

    // Used by background and ball [since the ball has to replace the background
    // bits it runs over].
    nsBall.alloc('BUFFER_X_FLAG', 1);
    nsBall.alloc('BUFFER_Y_FLAG', 1);
    nsBackground.declare('BUFFER_X_FLAG', 1, 21);
    nsBackground.declare('BUFFER_Y_FLAG', 1, 22);

    nsBall.alloc('RESPAWN_FLAG', 1);

    // Paddle fields
    nsPaddle.alloc('PADDLE_POSITION', 6);
    nsPaddle.alloc('PADDLE_DEST', 3);
    nsPaddle.alloc('PADDLE_PIXEL', 1);
    nsPaddle.alloc('DECIMATOR', 1);

    // Background fields for paddle
    nsBackground.alloc('PADDLE_POSITION', 6);
    nsBackground.alloc('PADDLE_DEST', 3);
    nsBackground.alloc('PADDLE_MOVE_DELAY_COUNTER', 3);
    nsBackground.alloc('PADDLE_PIXEL', 1);
    nsBackground.alloc('DECIMATOR', 1);
    nsBackground.alloc('PADDLE_BUFFER_FLAG', 1);
    // We don't copy decimator because we always flip it.
    nsBackground.combine(
      'PADDLE_BACKGROUND_BITS',
      ['PADDLE_POSITION', 'PADDLE_DEST', 'PADDLE_MOVE_DELAY_COUNTER',
       'PADDLE_PIXEL', 'PADDLE_BUFFER_FLAG']);

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
//    paddleBaseColor = nsPaddle.PADDLE_DEST.set(paddleBaseColor, dest);
//    bufferBaseColor = nsBackground.PADDLE_DEST.set(bufferBaseColor, dest);
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
                       nsNonbackground.FULL_ALPHA.getMask()])).nextColor();
    const dimColor =
      BallState.create(bm, 1, 1, 4, 0,
                       bm.or([nsGlobal.IS_NOT_BACKGROUND.getMask(),
                              nsNonbackground.BALL_FLAG.getMask(),
                              nsNonbackground.FULL_ALPHA.getMask()]))
        .nextColor();

    c.fillRect(dimColor, left, top, BALL_SIZE, BALL_SIZE);
    c.fillRect(brightColor, left + 1, top + 1, 1, 1);

    // Subtract 2 from height for top + bottom walls, then another to get below
    // the power of 2.
    drawPaddle(c, true, 0, 3);
    drawPaddle(c, false, 56, 7);
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

  function handleTrough(data, x, y) {
    let current = data[4];
    if (_.every([0, 3, 6], i => isBall(data[i])) ||
        _.every([2, 5, 8], i => isBall(data[i]))) {
      return nsBackground.BALL_MISS_FLAG.set(current, 1);
    }
    return nsBackground.BALL_MISS_FLAG.set(current, 0);
  }

  function handlePaddle(data, x, y) {
    let current = data[4];
    return current;
  }

  function handleRespawnMessage(data, x, y) {
    let current = data[4];
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
          return { value: color };
        } else {
          return {
            value: BitManager.copyBits(nsAbove, data[1], nsBackground, current,
                                       copySets.RESPAWN_MESSAGE_BITS)
          };
        }
      }
    }
    if (isRespawn(current)) {
      for (let d of data) {
        if (isBackground(d) && nsBackground.RESPAWN_PHASE_2_FLAG.get(d)) {
          let rightNotL = nsBackground.MESSAGE_R_NOT_L.get(d);
          let color = bm.or([nsGlobal.IS_NOT_BACKGROUND.getMask(),
                             nsNonbackground.BALL_FLAG.getMask(),
                             nsNonbackground.FULL_ALPHA.getMask()]);
          color = nsBall.RESPAWN_FLAG.setMask(color, true);
          var bs = BallState.create(bm, rightNotL, 1, 5, 0, color);
          let next = bs.getColor();
          if (isCenterRespawn(data)) {
            next = nsBall.BRIGHT_BALL_FLAG.setMask(next, true);
          }
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
  function getPaddlePixel(bs, source, data, x, y) {
    assert(isInPaddleBufferRegion(data[4]));
    let column;
    if (bs.dX > 0) {
      column = [0, 3, 6];
    } else {
      assert(bs.dX < 0);
      column = [2, 5, 8];
    }
    let d0 = data[column[0]]
    let d1 = data[column[1]]
    let d2 = data[column[2]]
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
    let ballNextPos = ballCurPos + bs.dY;
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
      xxxb  // of the paddle, plus 2 for the width of the ball, using the 10
            // slots of the single-bit encoding.
 */

  function getPaddlePixelHelper(d0, d1, d2) {
    let isP0 = isInPaddleBufferRegion(d0);
    assert(isInPaddleBufferRegion(d1));
    let isP2 = isInPaddleBufferRegion(d2);
    assert(isP0 || isP1 || isP2);
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

  function handleIncomingBall(data, x, y) {
    const current = data[4];
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
            assert(bs.getDepthX() <= BUFFER_SIZE);
            // Mark the ball for bounce or destruction.
            let worthChecking =
              isPaddleBuffer(current) || isBallInPaddleBuffer(current);
            let v;
            if (worthChecking && (v = getPaddlePixel(bs, source, data, x, y))) {
              bs.bounce('x', v.value)
            } else {
              bs.setDepthX(0);
            }
          }
          if (bs.getDepthY() >= BUFFER_SIZE) {
            assert(bs.getDepthY() <= BUFFER_SIZE);
            bs.reflectAngleInc('y')
          }
          let respawn;
          let bufferXFlag = bufferXMin || bufferXMax;
          let bufferYFlag = bufferYMin || bufferYMax;
          let nextColor = bs.nextColor();
          nextColor = nsBall.BUFFER_X_FLAG.set(nextColor, bufferXFlag);
          nextColor = nsBall.BUFFER_Y_FLAG.set(nextColor, bufferYFlag);
          nextColor = nsBall.PADDLE_BUFFER_FLAG.set(nextColor,
                                                    bufferBits.paddleBuffer);
          if (isBall(current)) {
            respawn = nsBall.RESPAWN_FLAG.get(current);
            if (nsBall.PADDLE_BUFFER_FLAG.isSet(current)) {
              let paddleBits = nsBall.PADDLE_BALL_BITS.get(current);
              nextColor = nsBall.PADDLE_BALL_BITS.set(nextColor, paddleBits);
            }
          } else {
            assert(isBackground(current));
            respawn = isRespawn(current);
            if (isPaddleBuffer(current)) {
              nextColor =
                BitManager.copyBits(nsBackground, current, nsBall, nextColor,
                                    copySets.PADDLE_BALL_BITS)
            }
          }
          nextColor = nsBall.RESPAWN_FLAG.set(nextColor, respawn);
          return { value: nextColor };
        }
      }
    }
    return null;
  }

  // TODO: Paddle buffer stuff.
  function handleBecomingOrStayingBackground(data, x, y) {
    const current = data[4];
    let respawn;
    let bufferXFlag;
    let bufferYFlag;
    let nextColor = nsBackground.BASIC_BACKGROUND.getMask();
    if (isBall(current)) {
      respawn = nsBall.RESPAWN_FLAG.get(current);
      bufferXFlag = nsBall.BUFFER_X_FLAG.get(current);
      bufferYFlag = nsBall.BUFFER_Y_FLAG.get(current);
      if (isBallInPaddleBuffer(current)) {
        nextColor =
          BitManager.copyBits(nsBall, current, nsBackground, nextColor,
                              copySets.PADDLE_BALL_BITS)
      }
    } else {
      assert(isBackground(current));
      respawn = isRespawn(current);
      bufferXFlag = nsBackground.BUFFER_X_FLAG.get(current);
      bufferYFlag = nsBackground.BUFFER_Y_FLAG.get(current);
      if (isPaddleBuffer(current)) {
        nextColor =
          nsBackground.PADDLE_BACKGROUND_BITS.set(
            nextColor,
            nsBackground.PADDLE_BACKGROUND_BITS.get(current));
      }
    }
    if (bufferXFlag || bufferYFlag) {
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

  function bigRespawn(data, x, y) {
    const current = data[4];
    let v;

    if (isWall(current)) {
      return handleWall(data, x, y);
    }

    // Trough doesn't have to deal with balls, messages, or respawn, only ball
    // deaths and eventually the paddle.
    if (isTrough(current)) {
      return handleTrough(data, x, y);
    }

    // Paddle just deals with receiving and sending messages and its own motion.
    if (isPaddle(current)) {
      return handlePaddle(data, x, y);
    }

    // First deal with messages and respawns in the background, then deal with
    // the ball in both ball and background.  We won't receive a respawn message
    // and a ball in the same cycle, but we could get an AI message and part of
    // a ball, and the ball must win.
    if (v = handleRespawnMessage(data, x, y)) {
      return v.value;
    }

    // Both ball and background need to handle incoming ball pixels.
    if (v = handleIncomingBall(data, x, y)) {
      return v.value;
    }

    // TODO: This includes AI messages.
    return handleBecomingOrStayingBackground(data, x, y);
  }

  registerAnimation("big respawn", initBigRespawn, bigRespawn);

})();
