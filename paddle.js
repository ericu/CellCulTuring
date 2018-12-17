"use strict";

(function () {
  let nsBall, nsWall, nsPaddle, nsBackground, nsGlobal;
  let bm;
  let copySets = {};
  const originX = 1;
  const originY = 1;
  const width = canvas.width - 2; // immutable black border
  const height = canvas.height - 2; // immutable black border
  const paddleToPaddleDistance = width - 5; // walls, paddles, ball width
  const topWallToBottomWallHeight = height - 3; // walls, ball height

  function initPaddle(c) {
    initBitManager();

    c.fillRect(nsGlobal.BACKGROUND.getMask(), originX, originY, width, height);
    c.strokeRect(nsGlobal.WALL.getMask(), originX, originY,
                 width - 1, height - 1);

    let halfWidth = Math.floor(width / 2);
    let halfHeight = Math.floor(height / 2);
    let color = nsGlobal.WALL.getMask();
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

    // Subtract 2 from height for top + bottom walls, then another to get below
    // the power of 2.
    drawPaddle(c, originX + 1, 16, 3);
    drawPaddle(c, originX + width - 2, 52, 7);

    color = nsGlobal.BACKGROUND.getMask();
    c.fillRect(nsBackground.RESPAWN_FLAG.setMask(color, true),
               originX + halfWidth, originY + halfHeight, 1, 1);

    var bs = BallState.create(nsBall, 1, 1, 4, 0, nsGlobal.BALL.getMask());
    c.fillRect(bs.nextColor(), 56, 58, 1, 1);
  }

  let isWall, isBackground, isBall, isPaddle, isRespawn, isTopWallCenter;
  let isBallMotionCycleHelper, isPaddleMotionCycleHelper;

  function initBitManager() {
    nsGlobal = new Namespace();
    bm = new BitManager(nsGlobal);

    // Bits are 0xAABBGGRR because of endianness; TODO: Make endian-independent.

    // Sentinel bits:
    // WALL: 1 << 7 [red]
    // BALL: 1 << 15 [blue]
    // PADDLE: WALL | BALL [purple]
    // That leaves green and alpha for everyone to use, but that high green bit
    // is going to be pretty obvious if the background ever uses it.  Can use it
    // for paddle counters/pixels, ball params, just not messages.
    nsGlobal.declare('ID_0', 1, 7);
    nsGlobal.declare('ID_1', 1, 23);

    // Sentinel bits that determine type:
    nsGlobal.alias('WALL_FLAG', 'ID_0');
    nsGlobal.alias('BALL_FLAG', 'ID_1');
    nsGlobal.combine('ID_BITS', ['ID_0', 'ID_1']);
    nsGlobal.alias('PADDLE_FLAG', 'ID_BITS');
    nsGlobal.declare('BACKGROUND_FLAG', 0, 0);

    nsGlobal.declare('FULL_ALPHA', 4, 28);

    nsGlobal.setSubspaceMask('ID_BITS');
    nsBall = nsGlobal.declareSubspace('BALL', 'BALL_FLAG');
    nsWall = nsGlobal.declareSubspace('WALL', 'WALL_FLAG');
    nsPaddle = nsGlobal.declareSubspace('PADDLE', 'PADDLE_FLAG');
    nsBackground = nsGlobal.declareSubspace('BACKGROUND', 0);


    nsGlobal.combine('WALL', ['FULL_ALPHA', 'WALL_FLAG']);
    nsGlobal.combine('PADDLE', ['FULL_ALPHA', 'PADDLE_FLAG']);
//    nsGlobal.declare('BALL_EXTRA_BRIGHTNESS', 1, 22); // optional, but nice
//    nsGlobal.combine('BALL', ['FULL_ALPHA', 'BALL_FLAG', 'BALL_EXTRA_BRIGHTNESS']);
    nsGlobal.combine('BALL', ['FULL_ALPHA', 'BALL_FLAG']);

    // Message fields [for wall and background, mostly]
    nsWall.alloc('MESSAGE_R_NOT_L', 1);
    nsBackground.alloc('MESSAGE_R_NOT_L', 1);
    nsWall.alloc('MESSAGE_PRESENT', 1);
    nsBackground.alloc('MESSAGE_PRESENT', 1);
    copySets.RESPAWN_MESSAGE_BITS = ['MESSAGE_PRESENT', 'MESSAGE_R_NOT_L']
    nsWall.combine('RESPAWN_MESSAGE_BITS', copySets.RESPAWN_MESSAGE_BITS);
    nsBackground.combine('RESPAWN_MESSAGE_BITS', copySets.RESPAWN_MESSAGE_BITS);

    // Ball fields
    nsBall.alloc('MOVE_R_NOT_L', 1);
    nsBall.alloc('MOVE_STATE', 2);
    nsBall.alloc('MOVE_INDEX', 3);
    nsBall.alloc('MOVE_D_NOT_U', 1);

    // Just to keep BallState happy.
    nsBall.alloc('BUFFER_X_DEPTH_COUNTER', 0);
    nsBall.alloc('BUFFER_Y_DEPTH_COUNTER', 0);

    // Wall fields
    nsWall.alloc('SIDE_WALL_FLAG', 1);
    nsWall.alloc('TOP_WALL_FLAG', 1);
    nsWall.alloc('TOP_WALL_CENTER_FLAG', 1);

    // Paddle fields
    nsPaddle.alloc('PADDLE_PIXEL', 1);
    nsPaddle.alloc('PADDLE_BALL_SIGNAL', 1);
    nsPaddle.alloc('PADDLE_POSITION', 6);
    nsPaddle.alloc('PADDLE_DEST', 3);
    nsPaddle.alloc('DECIMATOR', 1);

    // Background fields [shared with ball]
    nsBall.alloc('DECIMATOR', 1);
    nsBackground.alloc('DECIMATOR', 1);
    nsGlobal.alias('BACKGROUND', 'FULL_ALPHA');
    nsBall.alloc('RESPAWN_FLAG', 1);
    nsBackground.alloc('RESPAWN_FLAG', 1);

    // Background-only AI message fields
    nsBackground.alloc('MESSAGE_H_NOT_V', 1);
    nsBackground.alloc('MESSAGE_PADDLE_POSITION', 3);
    nsBackground.combine('ALL_MESSAGE_BITS',
                         ['RESPAWN_MESSAGE_BITS', 'MESSAGE_H_NOT_V',
                         'MESSAGE_PADDLE_POSITION']);

    nsGlobal.dumpStatus();

    isWall = getHasValueFunction(nsGlobal.ID_BITS.getMask(),
                                 nsGlobal.WALL_FLAG.getMask());
    isPaddle = getHasValueFunction(nsGlobal.ID_BITS.getMask(),
                                   nsGlobal.PADDLE_FLAG.getMask());
    isBackground = getHasValueFunction(nsGlobal.ID_BITS.getMask(),
                                       nsGlobal.BACKGROUND_FLAG.getMask());
    isBall = getHasValueFunction(nsGlobal.ID_BITS.getMask(),
                                 nsGlobal.BALL_FLAG.getMask());
    isBallMotionCycleHelper = getHasValueFunction(nsBall.DECIMATOR.getMask(),
                                                  nsBall.DECIMATOR.getMask());
    isPaddleMotionCycleHelper =
      getHasValueFunction(nsPaddle.DECIMATOR.getMask(), 0);
    isRespawn = getHasValueFunction(nsGlobal.ID_BITS.getMask() |
                                    nsBackground.RESPAWN_FLAG.getMask(),
                                    nsGlobal.BACKGROUND_FLAG.getMask() |
                                    nsBackground.RESPAWN_FLAG.getMask())
    isTopWallCenter =
      getHasValueFunction(nsGlobal.ID_BITS.getMask() |
                          nsWall.TOP_WALL_CENTER_FLAG.getMask(),
                          nsGlobal.WALL_FLAG.getMask() |
                          nsWall.TOP_WALL_CENTER_FLAG.getMask())
    PaddleState.init(nsPaddle, nsBall, nsBackground, isPaddle);
  }

  function isBallMotionCycle(c) {
    assert(isBall(c));
    return isBallMotionCycleHelper(c);
  }

  function isPaddleMotionCycle(c) {
    assert(isPaddle(c));
    return isPaddleMotionCycleHelper(c);
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

  const pixelEncoding = [0, 1, 0, 0, 0, 1, 1, 1];
  function drawPaddle(c, left, topInPaddleCoords, dest) {
    let color = nsGlobal.PADDLE.getMask();
    color = nsPaddle.PADDLE_POSITION.set(color, topInPaddleCoords);
    color = nsPaddle.PADDLE_DEST.set(color, dest);
    for (let pixel = 0; pixel < 8; ++pixel) {
      let pixelColor = nsPaddle.PADDLE_PIXEL.set(color, pixelEncoding[pixel]);
      // originY + 1 because there's a 1-pixel border at the top
      c.fillRect(pixelColor, left, topInPaddleCoords + originY + 1 + pixel, 1,
                 1);
    }

  }

  function handleWall(data, x, y) {
    let current = data[4];

    if (nsWall.SIDE_WALL_FLAG.isSet(current)) {
      if (nsWall.MESSAGE_PRESENT.isSet(data[7])) {
        return data[7];
      }
      for (let i = 0; i < 9; ++i) {
        let color = data[i];
        if (isBall(color) && isBallMotionCycle(color)) {
          let bs = new BallState(nsBall, color);
          let source = sourceDirectionFromIndex(i);
          if (source.dX === bs.dX && source.dY === bs.dY) {
            // There's a ball hitting us.
            var next = nsWall.MESSAGE_PRESENT.set(current, 1);
            return nsWall.MESSAGE_R_NOT_L.set(next, source.dX < 0);
          }
        }
        if ((i === 3 || i === 5) && isPaddle(color) &&
            nsPaddle.PADDLE_BALL_SIGNAL.isSet(color)) {
          var next = nsWall.MESSAGE_PRESENT.set(current, 1);
          return nsWall.MESSAGE_R_NOT_L.set(next, i === 5);
        }
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

  function handleBall(data, x, y) {
    let current = data[4];

    if (isBallMotionCycle(current)) {
      let next = nsGlobal.BACKGROUND.getMask();
      let respawn = nsBall.RESPAWN_FLAG.isSet(current);
      if (respawn) {
        next = nsBackground.RESPAWN_FLAG.set(next, true);
        next = nsBackground.DECIMATOR.set(next, 0);
      }
      return next;
    } else {
      // Here we get stomped on by a paddle, which we just missed.
      // We have to tell the ball about it because it's the paddle motion cycle,
      // not the ball motion cycle, and the wall only notices balls on the ball
      // motion cycle.  This ball won't live that long.
      for (let index of [1, 7]) {
        let color = data[index];
        if (isPaddle(color) && isPaddleMotionCycle(color)) {
          let ps = new PaddleState(color);
          if ((ps.getDY() > 0 && index === 1) ||
              (ps.getDY() < 0 && index === 7)) {
            return nsPaddle.PADDLE_BALL_SIGNAL.set(ps.nextColor(), 1);
          }
        }
      }
      return nsBall.DECIMATOR.set(current, 1);
    }
  }

  function handleRespawnMessage(data, x, y) {
    let current = data[4];
    let activeRespawnMessage =
      (isBackground(data[1]) &&
       nsBackground.MESSAGE_PRESENT.isSet(data[1]) &&
       !nsBackground.MESSAGE_H_NOT_V.isSet(data[1])) ||
      (isTopWallCenter(data[1]) && nsWall.MESSAGE_PRESENT.isSet(data[1]))
    if (activeRespawnMessage) {
      if (isRespawn(current)) {
        let rightNotL = nsBackground.MESSAGE_R_NOT_L.get(data[1]);
        let color = nsGlobal.BALL.setMask(0, true);
        color = nsBall.RESPAWN_FLAG.set(color, 1);
        var bs = BallState.create(nsBall, rightNotL, 1, 5, 0, color);
        let decimator = nsBackground.DECIMATOR.isSet(current);
        return { value: nsBall.DECIMATOR.set(bs.getColor(), !decimator) };
      } else {
        let nsFrom;
        if (isWall(data[1])) {
          nsFrom = nsWall;
        } else {
          nsFrom = nsBackground;
        }
        return {
          value: BitManager.copyBits(nsBackground, current, nsFrom, data[1],
                                     copySets.RESPAWN_MESSAGE_BITS)
        };
      }
    }
    return null;
  }

  // Assumes this encoding and an 8-pixel paddle: 01000111.
  // Returns a value between -1 and 8; you may be off the end by up to 1
  // pixel.
  // Returns the pixel for the middle of the three.
  function getPaddlePixel(d0, d1, d2) {
    let isP0 = isPaddle(d0) ? 1 : 0;
    let isP1 = isPaddle(d1) ? 1 : 0;
    let isP2 = isPaddle(d2) ? 1 : 0;
    assert(isP0 || isP1 || isP2);
    if (!isP0) {
      if (!isP1) {
        return -1;
      }
      return 0;
    } else if (!isP2) {
      if (!isP1) {
        return 8;
      }
      return 7;
    }
    switch ((nsPaddle.PADDLE_PIXEL.get(d0) << 2) |
            (nsPaddle.PADDLE_PIXEL.get(d1) << 1) |
            (nsPaddle.PADDLE_PIXEL.get(d2))) {
      case 0:
        return 3;
      case 1:
        return 4;
      case 2:
        return 1;
      case 3:
        return 5;
      case 4:
        return 2;
      case 5:
        assert(false);
        break;
      case 6:
        assert(false);
        break;
      case 7:
        return 6;
      default:
        assert(false);
        break;
    }
  }

  function handleBallEnteringBackground(data, x, y) {
    for (let i = 0; i < 9; ++i) {
      let color = data[i];
      if (isBall(color) && isBallMotionCycle(color)) {
        let bs = new BallState(nsBall, color);
        let source = sourceDirectionFromIndex(i);
        if (source.dX !== bs.dX || source.dY !== bs.dY) {
          break; // There's only 1 ball; exit early.
        }
        bs = new BallState(nsBall, bs.nextColor());
        // It's a hit; lets see if it's also bouncing.
        // Do the y reflection first, so that when the x bounce resets the
        // state, it sticks.  We use the reset state to know when the ball has
        // just bounced, so as to send the AI message only once.
        if ((bs.dY > 0 && isWall(data[7])) ||
            (bs.dY < 0 && isWall(data[1]))) {
          bs.bounceWide('y')
          assert(!((bs.dY > 0 && isWall(data[7])) ||
                   (bs.dY < 0 && isWall(data[1]))));
        }
        if ((bs.dX > 0 && isPaddle(data[5])) ||
            (bs.dX < 0 && isPaddle(data[3])) ||
            (bs.right && bs.down && isPaddle(data[8])) ||
            (!bs.right && bs.down && isPaddle(data[6])) ||
            (!bs.right && !bs.down && isPaddle(data[0])) ||
            (bs.right && !bs.down && isPaddle(data[2]))) {
          let paddlePixel;
          if (bs.right) {
            paddlePixel = getPaddlePixel(data[2], data[5], data[8]);
          } else {
            paddlePixel = getPaddlePixel(data[0], data[3], data[6]);
          }
          bs.bounceWide('x', paddlePixel);
        }
        // It may bounce again, if pinned between the edge of the paddle and
        // the wall, so you get bounces off e.g. bottom wall, bottom corner of
        // paddle, bottom wall; in a single cycle.
        if ((bs.dY > 0 && isWall(data[7])) ||
            (bs.dY < 0 && isWall(data[1]))) {
          bs.bounceWide('y')
        }
        let next = nsBall.RESPAWN_FLAG.set(bs.getColor(), isRespawn(data[4]));
        return { value: nsBall.DECIMATOR.setMask(next, false) };
      }
    }
    return null
  }

  function handleHorizontalMessage(data, x, y) {
    for (let i of [0, 2, 3, 5, 6, 8]) {
      let color = data[i];
      let active = isBackground(color) &&
                   nsBackground.MESSAGE_PRESENT.isSet(color) &&
                   nsBackground.MESSAGE_H_NOT_V.isSet(color);
      if (active &&
          (nsBackground.MESSAGE_R_NOT_L.isSet(color) === (i % 3 === 0))) {
        let bits = nsBackground.ALL_MESSAGE_BITS.get(color);
        return { value: nsBackground.ALL_MESSAGE_BITS.set(data[4], bits) };
      }
    }
    return null;
  }

  function handleBackground17Misc(data, x, y) {
    // Handle the paddle and creating AI messages.
    for (let index of [1, 7]) {
      let color = data[index];
      if (isPaddle(color) && isPaddleMotionCycle(color)) {
        let ps = new PaddleState(color);
        if ((ps.getDY() > 0 && index === 1) ||
            (ps.getDY() < 0 && index === 7)) {
          // the paddle is moving onto us and there's no ball here
          return { value: nsPaddle.PADDLE_BALL_SIGNAL.set(ps.nextColor(), 0) };
        }
      }
      if (isBall(color)) {
        let bs = new BallState(nsBall, color);
        if (!bs.isMotionCycle() && bs.dX !== 0) {
          // If there's a ball above or below us, we know it's not moving onto
          // us [that's handled above], but check if we need to announce where
          // it's going.
          let paddleIndex, ps, leftPaddle;
          for (let i of [0, 3, 6, 2, 5, 8]) {
            if (isPaddle(data[i])) {
              paddleIndex = i;
              ps = new PaddleState(data[i]);
              leftPaddle = i % 3 === 0 ? 1 : 0;
              break;
            }
          }
          if (ps && (leftPaddle === bs.right)) {
            let paddlePixel;
            if (leftPaddle) {
              paddlePixel = getPaddlePixel(data[0], data[3], data[6]);
            } else {
              paddlePixel = getPaddlePixel(data[2], data[5], data[8]);
            }
            let ballOffset = (index === 1) ? -1 : 1;
            let start = ps.position + paddlePixel + ballOffset;
            let dY = bs.getSlope() * paddleToPaddleDistance;
            if (!bs.down) {
              dY = -dY
            }
            let y = start + dY;
            let clippedY = y % topWallToBottomWallHeight;
            if (clippedY < 0) {
              clippedY += topWallToBottomWallHeight;
            }
            assert(clippedY >= 0 && clippedY < topWallToBottomWallHeight);
            if (Math.floor(y / topWallToBottomWallHeight) % 2) {
              clippedY = topWallToBottomWallHeight - clippedY
            }
            let next = nsBackground.MESSAGE_PRESENT.set(data[4], 1);
            next = nsBackground.MESSAGE_R_NOT_L.set(next, bs.right);
            next = nsBackground.MESSAGE_H_NOT_V.set(next, 1);
            return { value: nsBackground.MESSAGE_PADDLE_POSITION.set(
                              next, clippedY >>> 3) };
          }
        }
      }
    }
    return null;
  }

  function handleBackground(data, x, y) {
    // First deal with messages and respawns, then deal with the ball and
    // paddle.

    // We won't receive a respawn message and a ball in the same cycle, or a
    // message and paddle, or a ball and paddle.  We may receive an AI message
    // and a ball in the same cycle, and the ball must win.

    let current = data[4];

    let v;
    if (v = handleRespawnMessage(data, x, y)) {
      return v.value;
    }
    if (v = handleBallEnteringBackground(data, x, y)) {
      return v.value;
    }
    if (v = handleHorizontalMessage(data, x, y)) {
      return v.value;
    }
    if (v = handleBackground17Misc(data, x, y)) {
      return v.value;
    }
    let next = nsBackground.ALL_MESSAGE_BITS.set(current, 0);
    if (isRespawn(current)) {
      next =
        nsBackground.DECIMATOR.set(next,
                                   !nsBackground.DECIMATOR.isSet(current));
    }
    return next;
  }

  function handlePaddle(data, x, y) {
    let current = data[4];
    // We'll never get a message and a ball at the same time, or get a message
    // while we're moving.

    // A ball may penetrate from below or above.  In that case, we say that
    // the paddle missed the ball, and signal the neighboring wall.  We also
    // do this if the ball thought it was missing us, and so didn't bounce,
    // and then we jumped in front of it.  That'll look like a ball still
    // aimed at us despite being next to us.
    for (let i of [0, 1, 2, 3, 5, 6, 7, 8]) {
      let color = data[i];
      if (isBall(color)) {
        if (isBallMotionCycle(color)) {
          let bs = new BallState(nsBall, color);
          let source = sourceDirectionFromIndex(i);
          if (source.dX !== bs.dX || source.dY !== bs.dY) {
            break; // There's only 1 ball; exit early.
          }
          let next =
            nsPaddle.DECIMATOR.set(current,
                                   !nsPaddle.DECIMATOR.isSet(current));
          return nsPaddle.PADDLE_BALL_SIGNAL.set(next, 1);
        } else {
          break; // There's only 1 ball; exit early.
        }
      }
    }
    let ps = new PaddleState(current);
    if (ps.isMotionCycle()) {
      if ((ps.getDY() > 0 && !isPaddle(data[1])) ||
          (ps.getDY() < 0 && !isPaddle(data[7]))) {
        return nsGlobal.BACKGROUND.getMask();
      }
      if (ps.getDY() > 0) {
        ps = new PaddleState(data[1]);
      } else if (ps.getDY() < 0) {
        ps = new PaddleState(data[7]);
      }
    }
    let leftWall = isWall(data[3]);
    let color = leftWall ? data[5] : data[3];
    let nextColor = ps.nextColor();
    if (isBackground(color) && nsBackground.MESSAGE_PRESENT.isSet(color) &&
        nsBackground.MESSAGE_H_NOT_V.isSet(color) &&
        (nsBackground.MESSAGE_R_NOT_L.isSet(color) !== leftWall)) {
      nextColor =
        nsPaddle.PADDLE_DEST.set(
          nextColor, nsBackground.MESSAGE_PADDLE_POSITION.get(color));
    }
    return nsPaddle.PADDLE_BALL_SIGNAL.set(nextColor, 0);
  }

  function paddle(data, x, y) {
    const current = data[4];

    if (isWall(current)) {
      return handleWall(data, x, y);
    } else if (isBall(current)) {
      return handleBall(data, x, y);
    } else if (isBackground(current)) {
      return handleBackground(data, x, y);
    } else if (isPaddle(current)) {
      return handlePaddle(data, x, y);
    }
    assert(false);
  }

  registerAnimation("paddle", initPaddle, paddle);

})();
