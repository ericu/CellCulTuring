# CellCulTuring
This is a [cellular automaton](https://en.wikipedia.org/wiki/Cellular_automaton) that
implements [pong](https://en.wikipedia.org/wiki/Pong).

# Q&A
* Why would you want to write a video game as a cellular automaton?

   You wouldn't.  It's inefficient, overly constrained, and tedious.
   
* OK, then why did you?

   Because it wasn't there.
   
* How does it work?

   As in cellular automata such as [Conway's Life](https://en.wikipedia.org/wiki/Conway%27s_Game_of_Life), at each generation [each screen refresh] the next state of each pixel is determined only by the current state of that pixel and those of its 8 immediate neighbors.  However, whereas Life has only 2 states--black and white--this Pong uses 32-bit colors; and whereas Life's rules can be written in 4 lines, Pong took a couple of thousand lines of JavaScript to implement.

* How many states does it have?

   I haven't counted them, but it uses all 32 bits in various combinations, and there's not a lot of storage space wasted.  I believe it's safe to say that there are millions of valid states.  For example, the motion of the ball is described by 8 bits, to capture the 30 angles at which it can travel and the state involved in animating that motion.  And that ball can be traveling through regions of the board that hold other state, so the ball color needs to include those bits as it travels through them.

* How is this different from running a million copies of a video game and just letting each control one pixel?

  In that case, you'd have no dependency on your neighbors' states, and you'd have to store the entire game's state a million times.  In this case, the game's state is distributed across all the pixels, stored 
* So you read and write the state right from the canvas?

  No, that doesn't work.  If you write a value to the HTML5 canvas and read it back, you're [not guaranteed to get the same value back](https://stackoverflow.com/questions/23497925/how-can-i-stop-the-alpha-premultiplication-with-canvas-imagedata/23501676#23501676).  In my experience, there's often a bit of rounding going on, which isn't a bit deal for graphics, but kills you if your colors are sets of bitflags.  I use an offscreen [ArrayBuffer](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/ArrayBuffer) and blit it to the canvas once per frame.
  
* How does the ball travel at angles other than 45°?
 
  I use [Bresenham's algorithm](https://en.wikipedia.org/wiki/Bresenham%27s_line_algorithm).

* What was the most complex feature to implement?

  Handling a ball more than 1 pixel across.  It's tricky to make the left side of the ball know when the right side hits the paddle, for example.

* What else would you like to add to this game?

  I'd wanted to make a slightly larger, rounder ball, but I ran out of bits.  the efficient ball sizes are 2^N - 1 pixels across, so going up from 3x3, you can go all the way up to 7x7 for the same cost as 4x4, but that cost is unfortunately rather high...something like 5 bits, and I've only got about 1 that's not *really* necessary right now.  I can see an optimization that might make it possible, but I think I'm already hitting diminishing returns on my time in this project.

* What other games could be implemented similarly?

   Well, [Breakout](https://en.wikipedia.org/wiki/Breakout_(video_game)) is an obvious next step, but I'd love to see if something like [Asteroids](https://en.wikipedia.org/wiki/Asteroids_(video_game)) could be done, with Life-style animations when you destroy an asteroid.

* Are you going to try to write that?

  Nope.
<!--stackedit_data:
eyJoaXN0b3J5IjpbMTE0MzM2MTUxNiwtNjY3MTc5NjM3XX0=
-->