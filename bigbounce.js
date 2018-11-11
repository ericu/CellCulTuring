"use strict";

//(function () {
  let bm;
  const BALL_SIZE_BITS = 3;
  const BALL_SIZE = 1 << BALL_SIZE_BITS;
  const BUFFER_DEPTH_COUNTER_BITS = BALL_SIZE_BITS;
  const BUFFER_SIZE = BALL_SIZE;

  function initBitMan() {
    bm = new BitMan();

    // Bits are 0xAABBGGRR because of endianness; TODO: Make endian-independent.

    // Sentinel bits that determine type:
    bm.declare('WALL_FLAG', 1, 7);
    bm.declare('BALL_FLAG', 2, 14); // Could use 1 bit, but it's rather dim.

    bm.declare('FULL_ALPHA', 4, 28); // Leaves 4 low bits free.

    bm.combine('WALL', ['FULL_ALPHA', 'WALL_FLAG']);
    bm.combine('BALL', ['FULL_ALPHA', 'BALL_FLAG']);
    bm.alias('BACKGROUND', 'FULL_ALPHA');

    // Used only by the ball.
    bm.declare('BUFFER_DEPTH_COUNTER', BUFFER_DEPTH_COUNTER_BITS,
               28 - BUFFER_DEPTH_COUNTER_BITS); // Take over low alpha bits.
    bm.declare('MOVE_R_NOT_L', 1, 8); // In ball color for now.
    bm.declare('MOVE_D_NOT_U', 1, 9); // In ball color for now.
    bm.declare('MOVE_STATE', 2, 10);
    bm.declare('MOVE_INDEX', 4, 16);

    // Used only by the background.
    bm.declare('BUFFER_X_MIN_FLAG', 1, 0);
    bm.declare('BUFFER_Y_MIN_FLAG', 1, 1);
    bm.declare('BUFFER_X_MAX_FLAG', 1, 2);
    bm.declare('BUFFER_Y_MAX_FLAG', 1, 3);
    bm.combine('X_MIN_BUFFER', ['BACKGROUND', 'BUFFER_X_MIN_FLAG']);
    bm.combine('X_MAX_BUFFER', ['BACKGROUND', 'BUFFER_X_MAX_FLAG']);
    bm.combine('Y_MIN_BUFFER', ['BACKGROUND', 'BUFFER_Y_MIN_FLAG']);
    bm.combine('Y_MAX_BUFFER', ['BACKGROUND', 'BUFFER_Y_MAX_FLAG']);
    bm.combine('XY_MAX_BUFFER', ['BUFFER_X_MAX_FLAG', 'BUFFER_Y_MAX_FLAG']);
    bm.combine('XY_MIN_BUFFER', ['BUFFER_X_MIN_FLAG', 'BUFFER_Y_MIN_FLAG']);
    bm.combine('X_MAX_Y_MIN_BUFFER',
               ['BUFFER_X_MAX_FLAG', 'BUFFER_Y_MIN_FLAG']);
    bm.combine('X_MIN_Y_MAX_BUFFER',
               ['BUFFER_X_MIN_FLAG', 'BUFFER_Y_MAX_FLAG']);
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
      styleBm = new BitMan();
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

  function initBigBounce(canvas) {
    initBitMan();

    let context = canvas.getContext('2d');


    // We fill the whole canvas, then put a wall around that corresponds to the
    // originX/originY/width/height sentinel frame.

    context.fillStyle = styleFromUint(bm.getMask('BACKGROUND'));
    context.fillRect(0, 0, canvas.width, canvas.height);

    // Strokes are between lines, so they end up fuzzy; fills aren't.
    context.translate(0.5, 0.5);
    context.strokeStyle = styleFromUint(bm.getMask('WALL'));
    context.strokeRect(0, 0, canvas.width - 1, canvas.height - 1);
    context.translate(-0.5, -0.5);

    // Buffer regions
    context.fillStyle = styleFromUint(bm.getMask('X_MIN_BUFFER'));
    context.fillRect(originX, BUFFER_SIZE,
                     BUFFER_SIZE, height - 2 * BUFFER_SIZE);
    context.fillStyle = styleFromUint(bm.getMask('X_MAX_BUFFER'));
    context.fillRect(originX + width - BUFFER_SIZE, BUFFER_SIZE,
                     BUFFER_SIZE, height - 2 * BUFFER_SIZE);
    context.fillStyle = styleFromUint(bm.getMask('Y_MIN_BUFFER'));
    context.fillRect(BUFFER_SIZE, originY,
                     width - 2 * BUFFER_SIZE, BUFFER_SIZE);
    context.fillStyle = styleFromUint(bm.getMask('Y_MIN_BUFFER'));
    context.fillRect(BUFFER_SIZE, originY + height - BUFFER_SIZE,
                     width - 2 * BUFFER_SIZE, BUFFER_SIZE);
    context.fillStyle = styleFromUint(bm.getMask('XY_MIN_BUFFER'));
    context.fillRect(originX, originY,
                     BUFFER_SIZE, BUFFER_SIZE);
    context.fillStyle = styleFromUint(bm.getMask('XY_MAX_BUFFER'));
    context.fillRect(originX + width - BUFFER_SIZE,
                     originY + height - BUFFER_SIZE,
                     BUFFER_SIZE, BUFFER_SIZE);
    context.fillStyle = styleFromUint(bm.getMask('X_MAX_Y_MIN_BUFFER'));
    context.fillRect(originX + width - BUFFER_SIZE, originY,
                     BUFFER_SIZE, BUFFER_SIZE);
    context.fillStyle = styleFromUint(bm.getMask('X_MIN_Y_MAX_BUFFER'));
    context.fillRect(originX, originY + height - BUFFER_SIZE,
                     BUFFER_SIZE, BUFFER_SIZE);

    // arbitrarily moving ball
    var ms = MotionState.create(bm, 1, 1, 7, 0);
    context.fillStyle = styleFromUint(ms.color);
    context.fillRect(Math.round(canvas.width / 2),
                     Math.round(canvas.height / 2), 1, 1);
  }

  function bigBounce(data) {
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
          ms = new MotionState(bm, ms.nextColor())
          if ((ms.dX > 0 && isWall(data[5])) ||
              (ms.dX < 0 && isWall(data[3]))) {
            ms.reflect('x');
          }
          if ((ms.dY > 0 && isWall(data[7])) ||
              (ms.dY < 0 && isWall(data[1]))) {
            ms.reflect('y')
          }
          return ms.color;
        }
      }
      return current;
    }
    assert(false);
  }

  window.addEventListener(
    "load",
    () => window.registerAnimation("big bounce", initBigBounce,
                                   bigBounce));

//})();
