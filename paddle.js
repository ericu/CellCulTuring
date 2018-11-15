"use strict";

/*
  Ball-paddle hits are tricky because both move.  Consider this case:

  b b b . .     . . . . .
  b b b . .     . b b b .
  b b b . .     . b b b .
  . . . . . ->  . b b b p
  . . . . p     . . . . p
  . . . . p     . . . . p
  . . . . p     . . . . .

  How does the top-left ball pixel know about the collision?  We'll need a
  buffer around the paddle in 2 dimensions at a minimum; it may even need to
  indicate its depth.

  Simple buffer:    Depth buffer: [Or 1-3, with 0 meaning not-in-buffer].
   . . . . .          . . . . .
   . : : : :          . 2 1 1 1
   . : : : :          . 2 1 0 0
   . : : : p          . 2 1 0 p
   . : : : p          . 2 1 0 p
   . : : : p          . 2 1 0 p

  In the buffered cases, how does this look?

  simple buffer:
  b  b  b  .  .       .  .  .  .  . 
  b  b  b  .  .       .  b: b: b:  :
  b  b: b:  :  :      .  b: b: b:  :
  .   :  :  :  :  ->  .  b: b: b:  p
  .   :  :  :  p      .   :  :  :  p
  .   :  :  :  p      .   :  :  :  p
  .   :  :  :  p      .   :  :  : . 

  All cells going into the simple buffer know it, since the buffer moves into
  cells at 1 cell per cycle.  Ball cells can spread depth knowledge as well.
  Hmm...but if they come from above, do they need to know depth-to-X as well as
  depth-to-Y?  Probably.  Can they tell that?  In the special case of depth 3,
  yes, because a cell can tell which buffer cell it is by its neighbors.  If
  there were a 4+ thickness buffer, the inner cells would be indistinguishable.

  depth buffer:
  b  b  b  .  .      .  .  .  .  .
  b  b  b  .  .      .  b2 b1 b1  1
  b  b2 b1  1  1      .  b2 b1 b0  0
  .   2  1  0  0  ->  .  b2 b1 b0  p
  .   2  1  0  p      .   2  1  0  p
  .   2  1  0  p      .   2  1  0  p
  .   2  1  0  p      .   2  1  0 . 


*/

// TODO: This is just bigBounce so far.
(function () {
  let bm;
  const BALL_SIZE_BITS = 2;
  // We need to keep the depth counter from overflowing, so the buffer can't be
  // as deep as 1 << BALL_SIZE_BITS.
  const BALL_SIZE = (1 << BALL_SIZE_BITS) - 1;
  const BUFFER_X_DEPTH_COUNTER_BITS = BALL_SIZE_BITS;
  const BUFFER_Y_DEPTH_COUNTER_BITS = BALL_SIZE_BITS;
  const BUFFER_SIZE = BALL_SIZE;

  function initBitManager() {
    bm = new BitManager();

    // Bits are 0xAABBGGRR because of endianness; TODO: Make endian-independent.

    // Sentinel bits that determine type:
    bm.declare('WALL_FLAG', 1, 7);
    bm.declare('BALL_FLAG', 2, 14); // Could use 1 bit, but it's rather dim.

    bm.declare('FULL_ALPHA', 4, 28); // Leaves 4 low bits free.

    bm.combine('WALL', ['FULL_ALPHA', 'WALL_FLAG']);
    bm.combine('BALL', ['FULL_ALPHA', 'BALL_FLAG']);
    bm.alias('BACKGROUND', 'FULL_ALPHA');

    // Used only by the ball.
    bm.declare('BUFFER_X_DEPTH_COUNTER', BUFFER_X_DEPTH_COUNTER_BITS,
               28 - BUFFER_X_DEPTH_COUNTER_BITS); // Take over low alpha bits.
    bm.declare('BUFFER_Y_DEPTH_COUNTER', BUFFER_Y_DEPTH_COUNTER_BITS,
               20); // Steal mid-range wall bits for now.
    bm.declare('MOVE_R_NOT_L', 1, 8); // In ball color for now.
    bm.declare('MOVE_D_NOT_U', 1, 9); // In ball color for now.
    bm.declare('MOVE_STATE', 2, 10);
    bm.declare('MOVE_INDEX', 4, 16); // Steal bits from wall.

    // Used by background and ball [since the ball has to replace the background
    // bits it runs over].
    bm.declare('BUFFER_X_MIN_FLAG', 1, 0);
    bm.declare('BUFFER_Y_MIN_FLAG', 1, 1);
    bm.declare('BUFFER_X_MAX_FLAG', 1, 2);
    bm.declare('BUFFER_Y_MAX_FLAG', 1, 3);
    bm.combine('BUFFER_FLAGS', ['BUFFER_X_MIN_FLAG', 'BUFFER_Y_MIN_FLAG',
                                'BUFFER_X_MAX_FLAG', 'BUFFER_Y_MAX_FLAG']);
    bm.combine('X_MIN_BUFFER', ['BACKGROUND', 'BUFFER_X_MIN_FLAG']);
    bm.combine('X_MAX_BUFFER', ['BACKGROUND', 'BUFFER_X_MAX_FLAG']);
    bm.combine('Y_MIN_BUFFER', ['BACKGROUND', 'BUFFER_Y_MIN_FLAG']);
    bm.combine('Y_MAX_BUFFER', ['BACKGROUND', 'BUFFER_Y_MAX_FLAG']);
    bm.combine('XY_MAX_BUFFER', ['X_MAX_BUFFER', 'Y_MAX_BUFFER']);
    bm.combine('XY_MIN_BUFFER', ['X_MIN_BUFFER', 'Y_MIN_BUFFER']);
    bm.combine('X_MAX_Y_MIN_BUFFER', ['X_MAX_BUFFER', 'Y_MIN_BUFFER']);
    bm.combine('X_MIN_Y_MAX_BUFFER', ['X_MIN_BUFFER', 'Y_MAX_BUFFER']);
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

    let a = styleBm.get('A', u) / 255;
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

  function initBigBounce(c) {
    initBitManager();

    // We fill the whole canvas, then put a wall around that corresponds to the
    // originX/originY/width/height sentinel frame.

    c.fillRect(bm.getMask('BACKGROUND'), 0, 0, canvas.width, canvas.height);
    c.strokeRect(bm.getMask('WALL'), 0, 0, canvas.width - 1, canvas.height - 1);

    // Buffer regions
    c.fillRect(bm.getMask('X_MIN_BUFFER'), originX, originY + BUFFER_SIZE,
               BUFFER_SIZE, height - 2 * BUFFER_SIZE);
    c.fillRect(bm.getMask('X_MAX_BUFFER'), originX + width - BUFFER_SIZE,
               originY + BUFFER_SIZE, BUFFER_SIZE, height - 2 * BUFFER_SIZE);
    c.fillRect(bm.getMask('Y_MIN_BUFFER'), originX + BUFFER_SIZE, originY,
               width - 2 * BUFFER_SIZE, BUFFER_SIZE);


    c.fillRect(bm.getMask('Y_MAX_BUFFER'), originX + BUFFER_SIZE,
               originY + height - BUFFER_SIZE,
               width - 2 * BUFFER_SIZE, BUFFER_SIZE);
    c.fillRect(bm.getMask('XY_MIN_BUFFER'), originX, originY,
               BUFFER_SIZE, BUFFER_SIZE);
    c.fillRect(bm.getMask('XY_MAX_BUFFER'), originX + width - BUFFER_SIZE,
               originY + height - BUFFER_SIZE,
               BUFFER_SIZE, BUFFER_SIZE);
    c.fillRect(bm.getMask('X_MAX_Y_MIN_BUFFER'), originX + width - BUFFER_SIZE,
               originY, BUFFER_SIZE, BUFFER_SIZE);
    c.fillRect(bm.getMask('X_MIN_Y_MAX_BUFFER'), originX,
               originY + height - BUFFER_SIZE,
               BUFFER_SIZE, BUFFER_SIZE);

    // arbitrarily moving ball
    var ms = MotionState.create(bm, 1, 1, 7, 0);
    c.fillRect(ms.nextColor(), Math.round(canvas.width / 2),
               Math.round(canvas.height / 2), BALL_SIZE, BALL_SIZE);
  }

  function paddle(data, x, y) {
    const current = data[4];

    if (isWall(current)) {
      return current;
    }
    // Both ball and background need to handle incoming ball pixels.
    for (let i = 0; i < 9; ++i) {
      let color = data[i];
      if (isBall(color)) {
        // With a diagonal entry to the buffer, a trailing ball pixel moving
        // into the buffer for the first time [so no depth count] can hit a
        // buffer pixel [so no depth count] even if it's time to bounce.  We
        // need to check all neighboring ball pixels and take the highest depth
        // on the way in; they'll all match on the way out.
        let ms = new MotionState(bm, color);
        let source = sourceDirectionFromIndex(i);
        if (source.dX === ms.dX && source.dY === ms.dY) {
          let allMotions = _(data)
            .filter(d => isBall(d))
            .map(b => new MotionState(bm, b))
            .value();
          let maxDepthX = _(allMotions)
            .map(m => m.getDepthX())
            .max();
          let maxDepthY = _(allMotions)
            .map(m => m.getDepthY())
            .max();
          ms.setDepthX(maxDepthX);
          ms.setDepthY(maxDepthY);
          // It's a hit; lets see if it's also bouncing or in a buffer.
          let bufferXMin = bm.get('BUFFER_X_MIN_FLAG', current);
          let bufferXMax = bm.get('BUFFER_X_MAX_FLAG', current);
          let bufferYMin = bm.get('BUFFER_Y_MIN_FLAG', current);
          let bufferYMax = bm.get('BUFFER_Y_MAX_FLAG', current);
          let bufferFlags = bm.get('BUFFER_FLAGS', current);

          ms = new MotionState(bm, ms.nextColor())
          if (ms.dX > 0 && bufferXMax) {
            ms.incDepthX();
          } else if (ms.dX < 0 && bufferXMin) {
            ms.incDepthX();
          } else if (ms.getDepthX() && ms.dX > 0 && !bufferXMax) {
            ms.decDepthX();
          } else if (ms.getDepthX() && ms.dX < 0 && !bufferXMin) {
            ms.decDepthX();
          }
          if (ms.dY > 0 && bufferYMax) {
            ms.incDepthY();
          } else if (ms.dY < 0 && bufferYMin) {
            ms.incDepthY();
          } else if (ms.getDepthY() && ms.dY > 0 && !bufferYMax) {
            ms.decDepthY();
          } else if (ms.getDepthY() && ms.dY < 0 && !bufferYMin) {
            ms.decDepthY();
          }
          if (ms.getDepthX() >= BUFFER_SIZE) {
            assert(ms.getDepthX() <= BUFFER_SIZE);
            ms.reflect('x')
          }
          if (ms.getDepthY() >= BUFFER_SIZE) {
            assert(ms.getDepthY() <= BUFFER_SIZE);
            ms.reflect('y')
          }
          let nextColor = ms.getColor();
          nextColor = bm.set('BUFFER_FLAGS', nextColor, bufferFlags);
          return nextColor;
        }
      }
    }
    let bufferFlags = bm.get('BUFFER_FLAGS', current);
    let background = bm.getMask('BACKGROUND')
    let nextColor = bm.set('BUFFER_FLAGS', background, bufferFlags);
    return nextColor;
  }

//  window.addEventListener(
//    "load",
//    () => window.registerAnimation("paddle", initPaddle,
//                                   paddle));

})();
