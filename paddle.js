"use strict";

let bm;  // TODO: For debugging
(function () {
  const originX = 1;
  const originY = 1;
  const width = canvas.width - 2; // immutable black border
  const height = canvas.height - 2; // immutable black border
  const paddleToPaddleDistance = width - 5; // walls, paddles, ball width
  const topWallToBottomWallHeight = height - 3; // walls, ball height

  function initBitManager() {
    bm = new BitManager();

    // Bits are 0xAABBGGRR because of endianness; TODO: Make endian-independent.

    // Sentinel bits:
    // WALL: 1 << 7 [red]
    // BALL: 1 << 15 [blue]
    // PADDLE: WALL | BALL [purple]
    // That leaves green and alpha for everyone to use, but that high green bit
    // is going to be pretty obvious if the background ever uses it.  Can use it
    // for paddle counters/pixels, ball params, just not messages.
    bm.declare('ID_0', 1, 7);
    bm.declare('ID_1', 1, 23);

    // Sentinel bits that determine type:
    bm.alias('WALL_FLAG', 'ID_0');
    bm.alias('BALL_FLAG', 'ID_1');
    bm.combine('ID_BITS', ['ID_0', 'ID_1']);
    bm.alias('PADDLE_FLAG', 'ID_BITS');

    bm.setNamespaceBits(bm.getMask('ID_BITS'));
    bm.declareNamespace('BALL', bm.getMask('BALL_FLAG'));
    bm.declareNamespace('WALL', bm.getMask('WALL_FLAG'));
    bm.declareNamespace('PADDLE', bm.getMask('PADDLE_FLAG'));
    bm.declareNamespace('BACKGROUND', 0);


    bm.declare('FULL_ALPHA', 4, 28);

    bm.combine('WALL', ['FULL_ALPHA', 'WALL_FLAG']);
    bm.combine('PADDLE', ['FULL_ALPHA', 'PADDLE_FLAG']);
//    bm.declare('BALL_EXTRA_BRIGHTNESS', 1, 22); // optional, but nice
//    bm.combine('BALL', ['FULL_ALPHA', 'BALL_FLAG', 'BALL_EXTRA_BRIGHTNESS']);
    bm.combine('BALL', ['FULL_ALPHA', 'BALL_FLAG']);

    // Ball fields
    bm.declare('MOVE_R_NOT_L', 1, 0, 'BALL');
    bm.declare('MOVE_STATE', 2, 2, 'BALL');
    bm.declare('MOVE_INDEX', 3, 4, 'BALL');
    bm.declare('MOVE_D_NOT_U', 1, 8, 'BALL');

    // Wall fields
    bm.declare('SIDE_WALL_FLAG', 1, 5, 'WALL');
    bm.declare('TOP_WALL_FLAG', 1, 4, 'WALL');
    bm.declare('TOP_WALL_CENTER_FLAG', 1, 0, 'WALL');

    // Paddle fields
    bm.declare('PADDLE_PIXEL', 3, 0, 'PADDLE');
    bm.declare('PADDLE_BALL_SIGNAL', 1, 15, 'PADDLE');
    bm.declare('PADDLE_POSITION', 6, 16, 'PADDLE');
    bm.declare('PADDLE_DEST', 3, 8, 'PADDLE');
    bm.declare('DECIMATOR', 1, 22, 'PADDLE');

    // Background fields [shared with ball]
    bm.declare('DECIMATOR', 1, 22, 'BALL');
    bm.declare('DECIMATOR', 1, 22, 'BACKGROUND');
    bm.alias('BACKGROUND', 'FULL_ALPHA');
    bm.declare('RESPAWN_FLAG', 1, 9, 'BALL');
    bm.declare('RESPAWN_FLAG', 1, 6, 'BACKGROUND');

    // Background-only AI message fields
    bm.declare('MESSAGE_H_NOT_V', 1, 13, 'BACKGROUND');
    bm.declare('MESSAGE_PADDLE_POSITION', 3, 0, 'BACKGROUND');

    // Message fields [for wall and background, mostly]
    bm.declare('MESSAGE_R_NOT_L', 1, 10, 'WALL');
    bm.declare('MESSAGE_R_NOT_L', 1, 10, 'BACKGROUND');
    bm.declare('MESSAGE_PRESENT', 1, 14, 'WALL');
    bm.declare('MESSAGE_PRESENT', 1, 14, 'BACKGROUND');
    bm.combine('RESPAWN_MESSAGE_BITS', ['MESSAGE_PRESENT', 'MESSAGE_R_NOT_L'],
               'WALL');
    bm.combine('RESPAWN_MESSAGE_BITS', ['MESSAGE_PRESENT', 'MESSAGE_R_NOT_L'],
               'BACKGROUND');
    bm.combine('ALL_MESSAGE_BITS',
               ['RESPAWN_MESSAGE_BITS', 'MESSAGE_H_NOT_V',
                'MESSAGE_PADDLE_POSITION'],
                'BACKGROUND');
    bm.dumpStatus();
  }


  function isWall(c) {
    return bm.isSet('WALL_FLAG', c) && !bm.isSet('ID_1', c);
  }

  function isBackground(c) {
    return !bm.isSet('ID_0', c) && !bm.isSet('ID_1', c);
  }

  function isBall(c) {
    return bm.isSet('BALL_FLAG', c) && !bm.isSet('ID_0', c);
  }

  function isPaddle(c) {
    return bm.isSet('PADDLE_FLAG', c);
  }

  function isBallMotionCycle(c) {
    assert(isBall(c));
    return bm.isSet('DECIMATOR', c);
  }

  function isPaddleMotionCycle(c) {
    assert(isPaddle(c));
    return !bm.isSet('DECIMATOR', c);
  }

  function isRespawn(c) {
    return isBackground(c) && bm.isSet('RESPAWN_FLAG', c);
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

  function initPaddle(c) {
    initBitManager();

    c.fillRect(bm.getMask('BACKGROUND'), originX, originY,
               canvas.width, canvas.height);
    c.strokeRect(bm.getMask('WALL'), originX, originY, width - 1, height - 1);

    let halfWidth = Math.floor(width / 2);
    let halfHeight = Math.floor(height / 2);
    let color = bm.getMask('WALL');
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

    // Subtract 2 from height for top + bottom walls, then another to get below
    // the power of 2.
    drawPaddle(c, originX + 1, 16, 3);
    drawPaddle(c, originX + width - 2, 5, 1);

    color = bm.getMask('BACKGROUND');
    c.fillRect(bm.setMask('RESPAWN_FLAG', color, true),
               originX + halfWidth, originY + halfHeight, 1, 1);

    var bs = BallState.create(bm, 1, 0, 3, 0, bm.getMask('BALL'));
    c.fillRect(bs.nextColor(), originX + 4, 27, 1, 1);
  }

  function drawPaddle(c, left, topInPaddleCoords, dest) {
    let color = bm.getMask('PADDLE');
    // top + 2 for black border plus wall
    color = bm.set('PADDLE_POSITION', color, topInPaddleCoords);
    color = bm.set('PADDLE_DEST', color, dest);
    for (let pixel = 0; pixel < 8; ++pixel) {
      let pixelColor = bm.set('PADDLE_PIXEL', color, pixel);
      // originY + 1 because there's a 1-pixel border at the top
      c.fillRect(pixelColor, left, topInPaddleCoords + originY + 1 + pixel, 1,
                 1);
    }

  }

  function paddle(data, x, y) {
    const current = data[4];

    if (isWall(current)) {
      if (bm.isSet('SIDE_WALL_FLAG', current)) {
        if (bm.isSet('MESSAGE_PRESENT', data[7])) {
          return data[7];
        }
        for (let i = 0; i < 9; ++i) {
          let color = data[i];
          if (isBall(color) && isBallMotionCycle(color)) {
            let bs = new BallState(bm, color);
            let source = sourceDirectionFromIndex(i);
            if (source.dX === bs.dX && source.dY === bs.dY) {
              // There's a ball hitting us.
              var next = bm.set('MESSAGE_PRESENT', current, 1);
              return bm.set('MESSAGE_R_NOT_L', next, source.dX < 0);
            }
          }
          if ((i === 3 || i === 5) && isPaddle(color) &&
              bm.isSet('PADDLE_BALL_SIGNAL', color)) {
            var next = bm.set('MESSAGE_PRESENT', current, 1);
            return bm.set('MESSAGE_R_NOT_L', next, i === 5);
          }
        }
      } else if (bm.isSet('TOP_WALL_CENTER_FLAG', current)) {
        if (bm.isSet('MESSAGE_PRESENT', data[5])) {
          assert(bm.get('MESSAGE_R_NOT_L', data[5]) === 0);
          let message = bm.get('RESPAWN_MESSAGE_BITS', data[5]);
          return bm.set('RESPAWN_MESSAGE_BITS', current, message);
        }
        if (bm.isSet('MESSAGE_PRESENT', data[3])) {
          assert(bm.get('MESSAGE_R_NOT_L', data[3]) === 1);
          let message = bm.get('RESPAWN_MESSAGE_BITS', data[3]);
          return bm.set('RESPAWN_MESSAGE_BITS', current, message);
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
        if (isWall(data[7]) && bm.isSet('MESSAGE_PRESENT', data[7])) {
          let message = bm.get('RESPAWN_MESSAGE_BITS', data[7]);
          return bm.set('RESPAWN_MESSAGE_BITS', current, message);
        }
      }
      return bm.set('RESPAWN_MESSAGE_BITS', current, 0);
    } else if (isBall(current)) {
      if (isBallMotionCycle(current)) {
        let next = bm.getMask('BACKGROUND');
        let respawn = bm.isSet('RESPAWN_FLAG', current);
        let decimator = bm.isSet('DECIMATOR', current);
        if (respawn) {
          next = bm.set('RESPAWN_FLAG', next, true);
          next = bm.set('DECIMATOR', next, !decimator);
        }
        return next;
      } else {
        for (let index of [1, 7]) {
          let color = data[index];
          if (isPaddle(color) && isPaddleMotionCycle(color)) {
            let ps = new PaddleState(bm, color);
            if ((ps.getDY() > 0 && index === 1) ||
                (ps.getDY() < 0 && index === 7)) {
              return bm.set('PADDLE_BALL_SIGNAL', ps.nextColor(), 1);
            }
          }
        }
        return bm.set('DECIMATOR', current, 1);
      }
    } else if (isBackground(current)) {
      // First deal with messages and respawns, then deal with the ball and
      // paddle.

      // We won't receive a respawn message and a ball in the same cycle, or a
      // message and paddle, or a ball and paddle.  We may receive an AI message
      // and a ball in the same cycle, and the ball must win.

      // Here's the respawn message coming down.
      if (isBackground(data[1]) || isTopWallCenter(data[1])) {
        let active = bm.isSet('MESSAGE_PRESENT', data[1]);
        if (active && (isTopWallCenter(data[1]) || 
                       !bm.isSet('MESSAGE_H_NOT_V', data[1]))) {
          if (isRespawn(current)) {
            let rightNotL = bm.get('MESSAGE_R_NOT_L', data[1]);
            let color = bm.setMask('BALL', 0, true);
            color = bm.set('RESPAWN_FLAG', color, 1);
            var bs = BallState.create(bm, rightNotL, 1, 5, 0, color);
            let decimator = bm.isSet('DECIMATOR', current);
            return bm.set('DECIMATOR', bs.getColor(), !decimator);
          } else {
            let message = bm.get('RESPAWN_MESSAGE_BITS', data[1]);
            return bm.set('RESPAWN_MESSAGE_BITS', current, message);
          }
        }
      }
      // Handle the ball entering the pixel.
      for (let i = 0; i < 9; ++i) {
        let color = data[i];
        if (isBall(color) && isBallMotionCycle(color)) {
          let bs = new BallState(bm, color);
          let source = sourceDirectionFromIndex(i);
          if (source.dX !== bs.dX || source.dY !== bs.dY) {
            break; // There's only 1 ball; exit early.
          }
          // It's a hit; lets see if it's also bouncing.
          // Do the y reflection first, so that when the x reflect resets the
          // state, it sticks.  We use the reset state to know when the ball has
          // just bounced, so as to send the AI message only once.
          if ((bs.dY > 0 && isWall(data[7])) ||
              (bs.dY < 0 && isWall(data[1]))) {
            bs.reflect('y')
          }
          let regularBounce, edgeBounce;

          if ((bs.dX > 0 && isPaddle(data[5])) ||
              (bs.dX < 0 && isPaddle(data[3]))) {
            regularBounce = true;
          } else if ((bs.right && bs.down && isPaddle(data[8])) ||
                     (!bs.right && bs.down && isPaddle(data[6])) ||
                     (!bs.right && !bs.down && isPaddle(data[0])) ||
                     (bs.right && !bs.down && isPaddle(data[2]))) {
            edgeBounce = true;
          }
          if (regularBounce || edgeBounce) {
            let paddlePixel;
            for (let index of [3, 5, 0, 2, 6, 8]) {
              let paddleColor = data[index];
              if (isPaddle(paddleColor)) {
                paddlePixel = bm.get('PADDLE_PIXEL', paddleColor)
                bs.reflect('x', paddlePixel, edgeBounce);
                break;
              }
            }
          }
          let next = bm.set('RESPAWN_FLAG', bs.nextColor(), isRespawn(current));
          return bm.setMask('DECIMATOR', next, false);
        }
      }
      // Here's the horizontal AI message passing through.
      for (let i of [0, 2, 3, 5, 6, 8]) {
        let color = data[i];
        let active = isBackground(color) &&
                     bm.isSet('MESSAGE_PRESENT', color) &&
                     bm.isSet('MESSAGE_H_NOT_V', color);
        if (active && (bm.isSet('MESSAGE_R_NOT_L', color) === (i % 3 === 0))) {
          let bits = bm.get('ALL_MESSAGE_BITS', color);
          return bm.set('ALL_MESSAGE_BITS', current, bits);
        }
      }
      // Handle the paddle and creating AI messages.
      // TODO: known bug.  Straight-across message at 22 instead of 25ish.
      for (let index of [1, 7]) {
        let color = data[index];
        if (isPaddle(color) && isPaddleMotionCycle(color)) {
          let ps = new PaddleState(bm, color);
          if ((ps.getDY() > 0 && index === 1) ||
              (ps.getDY() < 0 && index === 7)) {
            // the paddle is moving onto us and there's no ball here
            return bm.set('PADDLE_BALL_SIGNAL', ps.nextColor(), 0);
          }
        }
        if (isBall(color)) {
          let bs = new BallState(bm, color);
          if (!bs.isMotionCycle() && bs.dX !== 0) {
            // If there's a ball above or below us, we know it's not moving onto
            // us [that's handled above], but check if we need to announce where
            // it's going.
            let paddleIndex, ps, leftPaddle;
            for (let i of [0, 3, 6, 2, 5, 8]) {
              if (isPaddle(data[i])) {
                paddleIndex = i;
                ps = new PaddleState(bm, data[i]);
                leftPaddle = i in { 0:0, 3:0, 6:0 };
                break;
              }
            }
            if (ps && (!leftPaddle === !bs.right)) {
              let paddleOffset = Math.floor(paddleIndex / 3) - 1;
              let ballOffset = (index === 1) ? -1 : 1;
              let start = ps.position + ps.pixel + ballOffset - paddleOffset;
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
              let next = bm.set('MESSAGE_PRESENT', current, 1);
              next = bm.set('MESSAGE_R_NOT_L', next, bs.right);
              next = bm.set('MESSAGE_H_NOT_V', next, 1);
              return bm.set('MESSAGE_PADDLE_POSITION', next, clippedY >>> 3);
            }
          }
        }
      }
      let next = bm.set('ALL_MESSAGE_BITS', current, 0);
      if (isRespawn(current)) {
        next = bm.set('DECIMATOR', next, !bm.isSet('DECIMATOR', current));
      }
      return next;
    } else if (isPaddle(current)) {
      // We'll never get a message and a ball at the same time, or get a message
      // while we're moving.

      // A ball may penetrate from below or above.  In that case, we say that
      // the paddle missed the ball, and signal the neighboring wall.
      for (let i of [1, 7]) {
        let color = data[i];
        if (isBall(color)) {
          if (isBallMotionCycle(color)) {
            let bs = new BallState(bm, color);
            let source = sourceDirectionFromIndex(i);
            if (source.dX !== bs.dX || source.dY !== bs.dY) {
              break; // There's only 1 ball; exit early.
            }
            let next = bm.set('DECIMATOR', current,
                              !bm.isSet('DECIMATOR', current));
            return bm.set('PADDLE_BALL_SIGNAL', next, 1);
          } else {
            break; // There's only 1 ball; exit early.
          }
        }
      }
      let ps = new PaddleState(bm, current);
      if (ps.isMotionCycle()) {
        if ((ps.getDY() > 0 && !isPaddle(data[1])) ||
            (ps.getDY() < 0 && !isPaddle(data[7]))) {
          return bm.getMask('BACKGROUND');
        }
        if (ps.getDY() > 0) {
          ps = new PaddleState(bm, data[1]);
        } else if (ps.getDY() < 0) {
          ps = new PaddleState(bm, data[7]);
        }
      }
      let leftWall = isWall(data[3]);
      let color = leftWall ? data[5] : data[3];
      if (isBackground(color) && bm.isSet('MESSAGE_PRESENT', color) &&
          bm.isSet('MESSAGE_H_NOT_V', color) &&
          (bm.isSet('MESSAGE_R_NOT_L', color) !== leftWall)) {
        ps.dest = bm.get('MESSAGE_PADDLE_POSITION', color);
      }
      return bm.set('PADDLE_BALL_SIGNAL', ps.nextColor(), 0);
    }
    assert(false);
  }

  registerAnimation("paddle", initPaddle, paddle);

})();
