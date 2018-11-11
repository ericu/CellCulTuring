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

    // TODO: Use a 5-bit encoding that covers the full 7x7 surrounding square,
    // for 32 real directions.  Then we'll need 2 more bits for Bresenham state.
    // The first two bits pick the quadrant, and then next 3 use a lookup table
    // to get their specifics.  Could allocate one of those 3 to whether x or y
    // is primary, which may be convenient, but it's still not symmetric after
    // that.  Here the highest bit indicates Y primary if set.
    //  .   .   .   .   7   5   .
    //  .   .   .   .   6   .   3
    //  .   .   .   .   4   2   1
    //  .   .   .   x   0   .   .
    //  .   .   .   .   .   .   .
    //  .   .   .   .   .   .   .
    //  .   .   .   .   .   .   .

    // From the bits, we'll want a 'given this color, where does the ball want
    // to be next cycle', which takes into account the Bresenham state.  Then
    // we'll need a 'given this current state, produce the next color', which
    // updates the state before setting the color.  We'll also need a "bounce
    // this state off the x or y axis" which should also adjust the Bresenham
    // state accordingly [however we arbitrarily decide it should get
    // adjusted].

    // Given the above encoding, to support the full range of motions, the
    // quadrant selection needs to be a rotation.  However, since we'll never go
    // straight up or down in pong, we can do reflections instead, which is a
    // lot easier, and we'll just have redundant encodings for straight
    // horizontal.

    // The lookup table should produce [bresenhamMax, bresenhamIncrement,
    // primaryMotion].

    const motionTable = [
      {
        dir = 'x';
        bInc = 0;
        bMax = 0;
      },
      {
        dir = 'x';
        bInc = 1;
        bMax = 3;
      },
      {
        dir = 'x';
        bInc = 1;
        bMax = 2;
      },
      {
        dir = 'x';
        bInc = 2;
        bMax = 3;
      },
      {
        dir = 'y'; // whichever
        bInc = 1;
        bMax = 1;
      },
      {
        dir = 'y';
        bInc = 2;
        bMax = 3;
      },
      {
        dir = 'y';
        bInc = 1;
        bMax = 2;
      },
      {
        dir = 'y';
        bInc = 1;
        bMax = 3;
      },
    ]
    // To be written:
    // ballMotionStateFromColor() [produces a BallMotionState object],
    // ballMotionFromState() [takes BallMotionState, produces offset]
    // reflectBallMotion(axis) [just flips one of the 2 high bits]
    // nextColorFromBallMotion() [increments Bresenham state]...and some way of
    // telling if the ballMotion hits the current cell, so
    // sourceDirectionOffsetFromIndex [produces offset from index].

    // Ball motion bits; for now, put them in ball color low bits, but they
    // could also go in alpha low bits.
    bm.declare('C_MOVE_R_NOT_L', 1, 8);
    bm.declare('C_MOVE_D_NOT_U', 1, 9);

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