"use strict";

//(function () {
  let bk;
  let C_WALL, C_BACKGROUND, C_BALL;

  function initBitkeeper() {
    bk = new BitKeeper();

    // Bits are 0xAABBGGRR because of endianness; TODO: Make endian-independent.

    bk.declare('A', 8, 24);
    bk.declare('B', 8, 16);
    bk.declare('G', 8, 8);
    bk.declare('R', 8, 0);

    // Sentinel bits that determine type:
    bk.declare('WALL_FLAG', 1, 7);
    bk.declare('BALL_FLAG', 2, 14); // Could use 1 bit, but it's rather dim.
    bk.declare('FULL_ALPHA', 8, 24);


    // Ball motion bits; for now, but them in ball color low bits, but they
    // could also go in alpha low bits.
    bk.declare('C_MOVE_R_NOT_L', 1, 8);
    bk.declare('C_MOVE_D_NOT_U', 1, 9);
    bk.declare('C_MOVE_X_MORE_THAN_Y', 1, 10);
    bk.declare('C_MOVE_RATIO_BITS', 2, 11);

    C_WALL = (bk.getMask('FULL_ALPHA') | bk.getMask('WALL_FLAG')) >>> 0;
    C_BACKGROUND = bk.getMask('FULL_ALPHA');
    C_BALL = (bk.getMask('FULL_ALPHA') | bk.getMask('BALL_FLAG')) >>> 0;

  }

  function isWall (c) {
    return bk.isSet('WALL_FLAG', c);
  }

  function isBackground (c) {
    return !isBall(c) && !isWall(c);
  }

  function isBall (c) {
    return bk.isSet('BALL_FLAG', c);
  }

  function styleFromUint(u) {
    let a = bk.get('A', u);
    let b = bk.get('B', u);
    let g = bk.get('G', u);
    let r = bk.get('R', u);
    return `rgba(${r},${g},${b},${a})`
  }

  function ballDirectionBitsFromColor(color) {
    return color & 0xf;
  }

  function ballDirectionFromColor(color) {
    return { vX: color & 0x3, vY: (color >>> 2) & 0x3 }
  }

  function ballColorFromDirection(dir) {
    return C_BALL | dir.vX | (dir.vY << 2);
  }

  function sourceDirectionBitsFromIndex(i) {
    switch (i) {
      case 0: return 1 | (1 << 2);
      case 1: return 0 | (1 << 2);
      case 2: return 3 | (1 << 2);
      case 3: return 1 | (0 << 2);
      case 4: return 0 | (0 << 2);
      case 5: return 3 | (0 << 2);
      case 6: return 1 | (3 << 2);
      case 7: return 0 | (3 << 2);
      case 8: return 3 | (3 << 2);
      default: assert(false);
    }
  }

  function initAngleBounce(canvas) {
    initBitkeeper();

    let context = canvas.getContext('2d');


    context.fillStyle = styleFromUint(C_BACKGROUND);
    context.fillRect(0, 0, canvas.width, canvas.height);

    // Strokes are between lines, so they end up fuzzy; fills aren't.
    context.translate(0.5, 0.5);
    context.strokeStyle = styleFromUint(C_WALL);
    context.strokeRect(0, 0, canvas.width - 1, canvas.height - 1);
    context.translate(-0.5, -0.5);

    context.fillStyle =
      styleFromUint(ballColorFromDirection({vX: 1, vY: 1}));
    context.fillRect(Math.round(canvas.width / 2),
                     Math.round(canvas.height / 2), 1, 1);
  }

  function angleBounce(data) {
    const current = data[4];

    if (isWall(current)) {
      return current;
    }
    // NOTE: It would really be nicer if the direction-switch didn't require a
    // whole cycle; it could happen in the isBackground clause below.  Not
    // worth doing given that we'll throw it away when we do the larger ball.
    if (isBall(current)) {
      let dir = ballDirectionFromColor(current);
      let bouncing = false;
      // TODO do some clever math for a quick lookup.
      if ((dir.vX === 0x1 && isWall(data[5])) ||
          (dir.vX === 0x3 && isWall(data[3]))) {
        dir.vX ^= 0x2;
        bouncing = true;
      }
      if ((dir.vY === 0x1 && isWall(data[7])) ||
          (dir.vY === 0x3 && isWall(data[1]))) {
        dir.vY ^= 0x2;
        bouncing = true;
      }

      if (bouncing) {
        let color = ballColorFromDirection(dir);
        return color;
      } else {
        return C_BACKGROUND; // The ball has passed.
      }
    }
    if (isBackground(current)) {
      for (let i = 0; i < 9; ++i) {
        let color = data[i];
        if (isBall(color)) {
          let dir = ballDirectionBitsFromColor(color);
          let source = sourceDirectionBitsFromIndex(i);
          if (source === dir) {
            // Collision!
            return color;
          }
          return current; // There's only 1 ball; exit early.
        }
      }
      return current;
    }
    assert(false);
  }

  window.addEventListener(
    "load",
    () => window.registerAnimation("angle bounce", initAngleBounce,
                                   angleBounce));

//})();
