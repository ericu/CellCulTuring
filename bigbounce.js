"use strict";

//(function () {
  let bm;

  function initBitMan() {
    bm = new BitMan();

    // Bits are 0xAABBGGRR because of endianness; TODO: Make endian-independent.

    // Sentinel bits that determine type:
    bm.declare('WALL_FLAG', 1, 7);
    bm.declare('BALL_FLAG', 2, 14); // Could use 1 bit, but it's rather dim.
    bm.declare('FULL_ALPHA', 4, 28);

    bm.declare('MOVE_R_NOT_L', 1, 8); // In ball color for now.
    bm.declare('MOVE_D_NOT_U', 1, 9); // In ball color for now.
    bm.declare('MOVE_STATE', 2, 10);
    bm.declare('MOVE_INDEX', 4, 16);

    bm.combine('C_WALL', ['FULL_ALPHA', 'WALL_FLAG']);
    bm.alias('C_BACKGROUND', 'FULL_ALPHA');
    bm.combine('C_BALL', ['FULL_ALPHA', 'BALL_FLAG']);
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


    context.fillStyle = styleFromUint(bm.getMask('C_BACKGROUND'));
    context.fillRect(0, 0, canvas.width, canvas.height);

    // Strokes are between lines, so they end up fuzzy; fills aren't.
    context.translate(0.5, 0.5);
    context.strokeStyle = styleFromUint(bm.getMask('C_WALL'));
    context.strokeRect(0, 0, canvas.width - 1, canvas.height - 1);
    context.translate(-0.5, -0.5);

    var ms = MotionState.create(1, 1, 7, 0);

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
      return bm.getMask('C_BACKGROUND'); // The ball has passed.
    }
    if (isBackground(current)) {
      for (let i = 0; i < 9; ++i) {
        let color = data[i];
        if (isBall(color)) {
          let ms = new MotionState(color);
          let source = sourceDirectionFromIndex(i);
          if (source.dX !== ms.dX || source.dY !== ms.dY) {
            return current; // There's only 1 ball; exit early.
          }
          // It's a hit; lets see if it's also bouncing.
          ms = new MotionState(ms.nextColor())
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
