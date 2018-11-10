(function () {
  // Basic colors: ball, background, wall.
  // Ball also contains a velocity variable.  Start with just one of the 8
  // directions, but work toward Bresenham's algorithm for more angles.
  // Ball squish involves a compression layer counter.
  // Hard-code ball as 3x3 for now?  Nah--start with 1x1 and add compression
  // later.  So just ball [with velocity], background, wall.
  // 0xAABBGGRR because of endianness; TODO: Make endian-independent.
  const C_WALL = 0xff0000ff;
  const C_BACKGROUND = 0xffff0000;
  const C_BALL = 0xff00ff00;

  function isWall (c) {
    return c == C_WALL;
  }

  function isBackground (c) {
    return c == C_BACKGROUND;
  }

  function isBall (c) {
    return ((c & C_BALL) >>> 0) == C_BALL;
  }
  window.C_BALL = C_BALL;

  function styleFromUint(u) {
    let a = u >>> 24 & 0xff;
    let b = u >>> 16 & 0xff;
    let g = u >>>  8 & 0xff;
    let r = u >>>  0 & 0xff;
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

  function initBounce(canvas) {
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

  function bounce(data) {
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
    () => window.registerAnimation("bounce", initBounce, bounce));

})();
