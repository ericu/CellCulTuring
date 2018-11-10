"use strict";

//(function () {
  let bm;

  function initBitMan() {
    bm = new BitMan();

    // Bits are 0xAABBGGRR because of endianness; TODO: Make endian-independent.

    bm.declare('A', 8, 24);
    bm.declare('B', 8, 16);
    bm.declare('G', 8, 8);
    bm.declare('R', 8, 0);

    // Sentinel bits that determine type:
    bm.declare('WALL_FLAG', 1, 7);
    bm.declare('BALL_FLAG', 2, 14); // Could use 1 bit, but it's rather dim.
    bm.declare('FULL_ALPHA', 8, 24);


    // Ball motion bits; for now, but them in ball color low bits, but they
    // could also go in alpha low bits.
    // TODO: Use these instead of the old ones.
    bm.declare('C_MOVE_R_NOT_L', 1, 8);
    bm.declare('C_MOVE_D_NOT_U', 1, 9);
    bm.declare('C_MOVE_X_MORE_THAN_Y', 1, 10);
    bm.declare('C_MOVE_RATIO_BITS', 2, 11);

    bm.combine('BALL_MOTION_TEMP_HACK', ['C_MOVE_R_NOT_L', 'C_MOVE_D_NOT_U']);
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

  function styleFromUint(u) {
    let a = bm.get('A', u);
    let b = bm.get('B', u);
    let g = bm.get('G', u);
    let r = bm.get('R', u);
    return `rgba(${r},${g},${b},${a})`
  }

  function ballDirectionBitsFromColor(color) {
    return bm.get('BALL_MOTION_TEMP_HACK', color);
  }

  // For now, just do the 4 45-degree angles, nothing else.
  function ballDirectionFromColor(color) {
    let vX = bm.get('C_MOVE_R_NOT_L', color) ? 1 : -1;
    let vY = bm.get('C_MOVE_D_NOT_U', color) ? 1 : -1;
    return { vX: vX, vY: vY }
  }

  function ballColorFromDirection(dir) {
    let positiveX = dir.vX > 0 ? 1 : 0;
    let positiveY = dir.vY > 0 ? 1 : 0;
    let color = bm.getMask('C_BALL')
    color = bm.set('C_MOVE_R_NOT_L', color, positiveX)
    color = bm.set('C_MOVE_D_NOT_U', color, positiveY)
    return color;
  }

  function sourceDirectionBitsFromIndex(i) {
    let dirBits;
    switch (i) {
      case 0:
        dirBits = [ 1,  1];
        break;
      case 1:
        dirBits = [ 0,  1];
        break;
      case 2:
        dirBits = [-1,  1];
        break;
      case 3:
        dirBits = [ 1,  0];
        break;
      case 4:
        dirBits = [ 0,  0];
        break;
      case 5:
        dirBits = [-1,  0];
        break;
      case 6:
        dirBits = [ 1, -1];
        break;
      case 7:
        dirBits = [ 0, -1];
        break;
      case 8:
        dirBits = [-1, -1];
        break;
      default: assert(false);
    }
    let packed = bm.set('C_MOVE_R_NOT_L', 0, dirBits[0] > 0);
    packed = bm.set('C_MOVE_D_NOT_U', packed, dirBits[1] > 0);
    return bm.get('BALL_MOTION_TEMP_HACK', packed);
  }

  function initAngleBounce(canvas) {
    initBitMan();

    let context = canvas.getContext('2d');


    context.fillStyle = styleFromUint(bm.getMask('C_BACKGROUND'));
    context.fillRect(0, 0, canvas.width, canvas.height);

    // Strokes are between lines, so they end up fuzzy; fills aren't.
    context.translate(0.5, 0.5);
    context.strokeStyle = styleFromUint(bm.getMask('C_WALL'));
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
      if ((dir.vX > 0 && isWall(data[5])) ||
          (dir.vX < 0 && isWall(data[3]))) {
        dir.vX *= -1;
        bouncing = true;
      }
      if ((dir.vY > 0 && isWall(data[7])) ||
          (dir.vY < 0 && isWall(data[1]))) {
        dir.vY *= -1;
        bouncing = true;
      }

      if (bouncing) {
        let color = ballColorFromDirection(dir);
        return color;
      } else {
        return bm.getMask('C_BACKGROUND'); // The ball has passed.
      }
    }
    if (isBackground(current)) {
      for (let i = 0; i < 9; ++i) {
        let color = data[i];
        if (isBall(color)) {
          if (i & 1) {
            // TEMP HACK: ignore cardinal directions because our half-converted
            // encoding can't distinguish between no-motion and negative-motion
            // for a given axis.
            return current; // There's only 1 ball; exit early.
          }
          let dir = ballDirectionBitsFromColor(color);
          let source = sourceDirectionBitsFromIndex(i);
          if (source === dir) {
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
