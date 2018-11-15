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

    bm.declare('MOVE_R_NOT_L', 1, 8); // In ball color for now.
    bm.declare('MOVE_D_NOT_U', 1, 9); // In ball color for now.
    bm.declare('MOVE_STATE', 2, 10);
    bm.declare('MOVE_INDEX', 4, 16);

    bm.combine('WALL', ['FULL_ALPHA', 'WALL_FLAG']);
    bm.alias('BACKGROUND', 'FULL_ALPHA');
    bm.combine('BALL', ['FULL_ALPHA', 'BALL_FLAG']);

    bm.declare('BUFFER_X_DEPTH_COUNTER', 1, 24);
    bm.declare('BUFFER_Y_DEPTH_COUNTER', 1, 25);
  }


  function isWall (c) {
    return bm.isSet('WALL_FLAG', c);
  }

  function isBackground (c) {
    return !isBall(c) && !isWall(c);
  }

  function isBall (c) {
    return bm.isSet('BALL_FLAG', c);
  }

  let styleBm;
  function styleFromUint(u) {
    if (!styleBm) {
      styleBm = new BitManager();
      styleBm.declare('A', 8, 24);
      styleBm.declare('B', 8, 16);
      styleBm.declare('G', 8, 8);
      styleBm.declare('R', 8, 0);
    }

    let a = styleBm.get('A', u);
    let b = styleBm.get('B', u);
    let g = styleBm.get('G', u);
    let r = styleBm.get('R', u);
    return `rgba(${r},${g},${b},${a})`
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

  function initAngleBounce(c) {
    initBitManager();

    c.fillRect(bm.getMask('BACKGROUND'), 0, 0, canvas.width, canvas.height);
    c.strokeRect(bm.getMask('WALL'), 0, 0, canvas.width - 1, canvas.height - 1);

    var ms = MotionState.create(bm, 1, 1, 7, 0, bm.getMask('BALL'));

    c.fillRect(ms.nextColor(), Math.round(canvas.width / 2),
               Math.round(canvas.height / 2), 1, 1);
  }

  function angleBounce(data) {
    const current = data[4];

    if (isWall(current)) {
      return current;
    }
    if (isBall(current)) {
      return bm.getMask('BACKGROUND'); // The ball has passed.
    }
    if (isBackground(current)) {
      for (let i = 0; i < 9; ++i) {
        let color = data[i];
        if (isBall(color)) {
          let ms = new MotionState(bm, color);
          let source = sourceDirectionFromIndex(i);
          if (source.dX !== ms.dX || source.dY !== ms.dY) {
            return current; // There's only 1 ball; exit early.
          }
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
          return ms.nextColor();
        }
      }
      return current;
    }
    assert(false);
  }

  registerAnimation("angle bounce", initAngleBounce, angleBounce);

})();
