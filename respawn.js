"use strict";

(function () {
  let bm;

  function initBitManager() {
    bm = new BitManager();

    // Bits are 0xAABBGGRR because of endianness; TODO: Make endian-independent.

    // Sentinel bits that determine type:
    bm.declare('WALL_FLAG', 1, 7);
    bm.declare('BALL_FLAG', 2, 14); // Could use 1 bit, but it's rather dim.
    bm.declare('FULL_ALPHA', 4, 28);

    bm.combine('WALL', ['FULL_ALPHA', 'WALL_FLAG']);
    bm.alias('BACKGROUND', 'FULL_ALPHA');
    bm.combine('BALL', ['FULL_ALPHA', 'BALL_FLAG']);

    bm.declare('MOVE_R_NOT_L', 1, 8); // In ball color for now.
    bm.declare('MOVE_D_NOT_U', 1, 9); // In ball color for now.
    bm.declare('MOVE_STATE', 2, 10);
    bm.declare('MOVE_INDEX', 3, 16);

    bm.declare('SIDE_WALL_FLAG', 1, 5);
    bm.declare('TOP_WALL_FLAG', 1, 4);
    bm.declare('MESSAGE_R_NOT_L', 1, 3);
    bm.declare('MESSAGE_PRESENT', 1, 6);
    bm.combine('MESSAGE_BITS', ['MESSAGE_PRESENT', 'MESSAGE_R_NOT_L']);

    bm.declare('TOP_WALL_CENTER_FLAG', 1, 19);
    bm.alias('SIGNAL_DOWN_ACTIVE_FLAG', 'MESSAGE_PRESENT');
    bm.declare('RESPAWN_FLAG', 1, 23);

    bm.combine('RETAINED_BACKGROUND_BITS', ['RESPAWN_FLAG', 'BACKGROUND']);


    // These are just here to keep motionstate from complaining.
    bm.declare('BUFFER_X_DEPTH_COUNTER', 1, 24);
    bm.declare('BUFFER_Y_DEPTH_COUNTER', 1, 25);
  }


  function isWall(c) {
    return bm.isSet('WALL_FLAG', c);
  }

  function isBackground(c) {
    return !isBall(c) && !isWall(c);
  }

  function isBall(c) {
    return bm.isSet('BALL_FLAG', c);
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

  function initRespawn(c) {
    initBitManager();
    let originX = 1;
    let originY = 1;
    let width = canvas.width - 2;
    let height = canvas.height - 2;

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

    color = bm.getMask('BACKGROUND');
    c.fillRect(bm.setMask('RESPAWN_FLAG', color, true),
               originX + halfWidth, originY + halfHeight, 1, 1);

    var ms = MotionState.create(bm, 1, 1, 7, 0, bm.getMask('BALL'));

    c.fillRect(ms.nextColor(),
               originX + halfWidth + 2, originY + halfHeight + 2, 1, 1);
  }

  function respawn(data, x, y) {
    const current = data[4];

    if (isWall(current)) {
      if (bm.isSet('SIDE_WALL_FLAG', current)) {
        if (bm.isSet('MESSAGE_PRESENT', data[7])) {
          return data[7];
        }
        for (let i = 0; i < 9; ++i) {
          let color = data[i];
          if (isBall(color)) {
            let ms = new MotionState(bm, color);
            let source = sourceDirectionFromIndex(i);
            if (source.dX === ms.dX && source.dY === ms.dY) {
              // There's a ball hitting us.
              var next = bm.set('MESSAGE_PRESENT', current, 1);
              return bm.set('MESSAGE_R_NOT_L', next, source.dX < 0);
            }
          }
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
    if (isBall(current)) {
      let retainedBits = bm.get('RETAINED_BACKGROUND_BITS', current);
      let background = bm.getMask('BACKGROUND');
      return bm.set('RETAINED_BACKGROUND_BITS', background, retainedBits);
    }
    if (isBackground(current)) {
      // First deal with messages and respawns, then deal with the ball.
      // We won't receive a message and a ball in the same cycle.
      if (isBackground(data[1]) || isTopWallCenter(data[1])) {
        let active = bm.get('SIGNAL_DOWN_ACTIVE_FLAG', data[1]);
        if (active) {
          if (isRespawn(current)) {
            let rightNotL = bm.get('MESSAGE_R_NOT_L', data[1]);
            let retained = bm.get('RETAINED_BACKGROUND_BITS', current);
            let color = bm.set('RETAINED_BACKGROUND_BITS', 0, retained);
            color = bm.setMask('BALL', color, true);
            var ms = MotionState.create(bm, rightNotL, 1, 5, 0, color);
            return ms.getColor();
          } else {
            let message = bm.get('MESSAGE_BITS', data[1]);
            return bm.set('MESSAGE_BITS', current, message);
          }
        }
      }
      // TODO
      for (let i = 0; i < 9; ++i) {
        let color = data[i];
        if (isBall(color)) {
          let ms = new MotionState(bm, color);
          let source = sourceDirectionFromIndex(i);
          if (source.dX !== ms.dX || source.dY !== ms.dY) {
            return current; // There's only 1 ball; exit early.
          }
          /*
          // It's a hit; lets see if it's also bouncing.
          if ((ms.dX > 0 && isWall(data[5])) ||
              (ms.dX < 0 && isWall(data[3]))) {
            ms.reflect('x');
            ms.index = (ms.index + 1) % 8;
            ms.nextState = 0;
            while(Math.abs(new MotionState(bm, ms.nextColor()).dX) < 0.5) {
              ++ms.nextState;
            }
          }
          */
          if ((ms.dY > 0 && isWall(data[7])) ||
              (ms.dY < 0 && isWall(data[1]))) {
            ms.reflect('y')
            ms.index = ms.index + 1;
            if (ms.index >=8) {
              ms.index = 1; // Don't go horizontal from top or bottom bounce.
            }
            // when changing index, reset state to stay valid
            ms.nextState = 0;
            while(Math.abs(new MotionState(bm, ms.nextColor()).dY) < 0.5) {
              ++ms.nextState;
            }
          }
          let retained = bm.get('RETAINED_BACKGROUND_BITS', current);
          return bm.set('RETAINED_BACKGROUND_BITS', ms.nextColor(), retained);
        }
      }
      return bm.set('MESSAGE_BITS', current, 0);
    }
    assert(false);
  }

  registerAnimation("respawn", initRespawn, respawn);

})();
