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

  Simple buffer both-approaching-hit:

  b  b  b  .  .       .  .  .  .  .
  b  b  b  .  .       .  b: b: b:  :
  b  b: b:  :  :      .  b: b: b:  :
  .   :  :  :  :  ->  .  b: b: b:  p
  .   :  :  :  p      .   :  :  :  p
  .   :  :  :  p      .   :  :  :  p
  .   :  :  :  p      .   :  :  : .

  All ball cells going into the simple buffer know it, since the buffer moves
  into cells at the same 1 cell per cycle that the ball cells do.  Ball cells
  can spread depth knowledge as well.  Hmm...but if they come from above, do
  they need to know depth-to-X as well as depth-to-Y?  Probably.  Can they tell
  that?  In the special case of depth 3, yes, because a cell can tell which
  buffer cell it is by its neighbors.  If there were a 4+ thickness buffer, the
  inner cells would be indistinguishable.

  Simple buffer paddle-approaching barely-miss:
  b  b  b  .  .       .  b  b  b   .
  b  b  b  .  .       .  b: b: b:  :
  b  b: b:  :  :      .  b: b: b:  :
  .   :  :  :  :  ->  .   :  :  :  p
  .   :  :  :  p      .   :  :  :  p
  .   :  :  :  p      .   :  :  :  p
  .   :  :  :  p      .   :  :  : .

  Here the y-depth is 2 and the x-depth 3, so it's a miss.

  depth buffer:
  b  b  b  .  .      .  .  .  .  .
  b  b  b  .  .      .  b2 b1 b1  1
  b  b2 b1  1  1      .  b2 b1 b0  0
  .   2  1  0  0  ->  .  b2 b1 b0  p
  .   2  1  0  p      .   2  1  0  p
  .   2  1  0  p      .   2  1  0  p
  .   2  1  0  p      .   2  1  0 .

  State in the paddle and buffer:
    IsPaddle/IsPaddleBuffer
    IsRightNotLeft
    Where-am-I altitude
    Where-am-I-going counter/altitude
    Where-have-I-been-requested-to-go-next altitude
    When-can-I-leave [counter for info to propagate through thickness of paddle]
  All that state needs to get stored in the ball as well, since it needs to be
  restored as the ball moves away.  Hmm...or can we just restore it from the
  neighboring paddle cells?  That would save a lot of bits in the ball, which
  probably has other uses for them.  Seems likely that we can do that; it's a
  bit more complex, but worth it.  Umm...actually no, not without storing the
  depth bits as well, otherwise the left edge of the right paddle buffer, coming
  down out from under a ball, doesn't know where its top border is.  Still, we
  can pull the counters from our paddle-cell neighbors, just not the single bit
  for IsPaddleBuffer.  Oops--that's problematic as well, with larger balls.  If
  you've got a paddle buffer inside a ball, it needs to know its movement
  parameters, and can't pull them from neighbors if it's deep inside the ball.

  Example bit allocations for a 3-pixel ball and a height-64 [so 6 bits] board

  Global: 2: type [isBall, isBackground, isAIPaddle, isWall]
    We can use a lower bit from isBackground or isWall and use it for the non-AI
    paddle.
    Total: 2
  Ball: 2:depthX, 2:depthY, 1:down, 1:right, 4:moveIndex, 2:moveState
    Do we need another 2 bits for depthYIntoPaddleBuffer?  Probably.
    Total: 12-14
  Paddle/PaddleBuffer: 6:height, 6:dest, 6:nextDest, 2:moveSyncDelayCounter
    Plus a bit to know that you're in the paddleBuffer.
    Total: 21
  Background/Buffer: 4:bufferFlags
    Total: 4

  If all paddle bits need to be in the ball as well, as they appear to, that's
  already 37-39 bits.  Ah, but dest and nextDest can just the the top 3 bits,
  since we don't need precision, and it'll make the game more interesting to
  have random angle bounces.  [While we're at it, an N-pixel paddle really
  defends N + 2 * (BALL_SIZE - 1) pixels, which is somewhat less in ball
  positions] Still, that's 31-33 pixels...pretty tight, but maybe doable.
  Hmm...

  The ball needs to recognize where it's hit on the paddle in order to know what
  angle to bounce off.  That indicates that we're going to need a marker in the
  paddle and buffer to tell the ball how to bounce.  With a ball of only 3
  pixels, each pixel should be able to tell which one it is, so at least the
  ball knows itself.  But it implies another field, of at least
  log(PADDLE_SIZE) bits, in both paddle field and ball.  And PADDLE_SIZE must be
  at least 4 pixels [defending 6 positions] to be playable.  But perhaps we can
  use depthYIntoPaddleBuffer for this?  If we're at full depth, it's a straight
  bounce, otherwise it's one of two angles, and we can't tell if it should be up
  or down.  Not good.

  So let's do a 1-pixel ball instead, and keep it easy, if less exciting.  As a
  bonus, a 64-height board is effectively 3x as tall with a 1-pixel ball as it
  is with a 3-pixel ball.

  Global: 2: type [isBall, isBackground, isPaddle, isWall]
    Total: 2
  Ball: 1:down, 1:right, 4:moveIndex, 2:moveState
    Total: 8
  Paddle: 6:height, 3:dest, 3:nextDest
    Total: 12



*/

(function () {
  let bm;

  function initBitManager() {
    bm = new BitManager();

    // Bits are 0xAABBGGRR because of endianness; TODO: Make endian-independent.

    // TODO
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

    // TODO: Draw board.
  }

  function paddle(data) {
    const current = data[4];

    if (isWall(current)) {
      return current;
    }
    // TODO
    assert(false);
  }

//  registerAnimation("paddle", initPaddle, paddle);

})();
