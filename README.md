# CellCulTuring
This is a [cellular automaton](https://en.wikipedia.org/wiki/Cellular_automaton) that
implements [Pong](https://en.wikipedia.org/wiki/Pong).

You can play it [here](https://ericu.github.io/CellCulTuring/) and see the code [here](https://github.com/ericu/CellCulTuring).

# Q&A
* Why would you want to write a video game as a cellular automaton?

   You wouldn't.  It's inefficient, overly constrained, tedious, and fun.
   
* How does it work?

   As in cellular automata such as [Conway's Life](https://en.wikipedia.org/wiki/Conway%27s_Game_of_Life), at each generation [each screen refresh] the next state of each pixel is determined only by the current state of that pixel and those of its 8 immediate neighbors.  However, whereas Life has only 2 states--black and white--this Pong uses 32-bit colors; and whereas Life's rules can be written in 4 lines, Pong's took a couple of thousand lines of JavaScript to express.  If you want to get an idea of what it's doing, click "Use more revealing colors".  That doesn't change how the game works; it just rearranges how the color bits are allocated, so that certain interesting values show up in high-order bits of the color components.

* How many states does it have?

   I haven't counted them, but it uses all 32 bits in various combinations, and there's not a lot of storage space wasted.  I believe it's safe to say that there are millions of valid states.  For example, the motion of the ball is described by 8 bits, to capture the 30 angles at which it can travel and the state involved in animating that motion.  And that ball can be traveling through regions of the board that hold other state, so the ball color needs to include those bits as it travels through them.

* How is this different from running a million copies of a video game and letting each control one display pixel?

  In that case, you'd have no dependency on your neighbors' states, and you'd have to store the entire game's state a million times.  In this case, the game's state is distributed across all the pixels, stored just in the colors themselves.  There is no hidden state, assuming your eyes can distinguish single-low-bit differences between colors.  No pixel knows anything about what's going on elsewhere on the board.

*  Then how does user input work?

   It doesn't, really.  This is really only a true cellular automaton when it's playing against itself.  But I couldn't very well publish a game that nobody could play, so I cheated.  In addition to the state of its neighbors, each cell also has access to the keyboard state.  If it makes you feel better, imagine a plane behind the image whose color is controlled by user input, so every cell has just one extra neighbor.

* So you read and write the state right from the canvas?

  No, that doesn't work.  If you write a value to the HTML5 canvas and read it back, you're [not guaranteed to get the same value back](https://stackoverflow.com/questions/23497925/how-can-i-stop-the-alpha-premultiplication-with-canvas-imagedata/23501676#23501676).  In my experience, there's often a bit of rounding going on, which isn't a big deal for graphics, but kills you if your colors are sets of bitflags.  I use an offscreen [ArrayBuffer](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/ArrayBuffer) and blit it to the canvas once per frame.
  
* How does the computer's paddle know where to go to hit the ball?

  When a paddle hits the ball, it causes the creation of a wave of color that sweeps across to the other paddle.  That wave is a message telling the paddle where to expect the ball.  Since the ball's path is deterministic, I can compute that from its angle and the board's dimensions.  I made the message move across as fast as possible, 1 pixel per cycle.  I made the ball move at half that speed, to give the message time to get there while the paddle could still do something about it.  At the current board size, it makes for a good-but-not-unbeatable opponent.  If the board were twice as wide as it is high, the computer would never miss.
  
* How does the ball travel at angles other than 45°?
 
  I use [Bresenham's algorithm](https://en.wikipedia.org/wiki/Bresenham%27s_line_algorithm).

* What was the most complex feature to implement?

  Handling a ball more than 1 pixel across.  It's tricky to make the left side of the ball know when the right side hits the paddle, for example.

* How does that work?

  Anywhere the ball needs to bounce, there's a buffer region the same width as the ball with special marking and behavior.  As the ball travels into the buffer, it keeps track of how deep into it it's gone.  There are some tricks by which the pixels tell their neighbors about the current depth and we keep track of whether we're hitting or missing the paddle, but basically you can think of it as the ball counting up as it approaches the wall or paddle, and deciding to turn around when the count reaches the ball width.

* What else would you like to add to this game?

  I'd wanted to make a slightly larger, rounder ball, but I ran out of bits.  The efficient ball sizes are (2^N - 1) pixels across, so going up from 3x3, you can go all the way up to 7x7 for the same cost as 4x4, but that cost is unfortunately rather high...roughly 5 bits, and I've only got about 1 that's not entirely necessary right now.  I can see an optimization that might make it possible, but I think I'm already hitting diminishing returns on my time in this project.  The center dot on the ball is my little nod toward styling; it has no actual function, and uses that one extra-ish bit.

* What other games could be implemented similarly?

   Well, [Breakout](https://en.wikipedia.org/wiki/Breakout_(video_game)) is an obvious next step, ideally with a local high score table, but I'd love to see if something like [Asteroids](https://en.wikipedia.org/wiki/Asteroids_(video_game)) could be done, with Life-style animations when you destroy an asteroid.

* Are you going to try to write that?

  Nope.
  
  <!-- Statcounter -->
  <script type="text/javascript">
    var sc_project=11947282;
    var sc_invisible=1;
    var sc_security="dd885c2d";
  </script>
  <script type="text/javascript"
    src="https://www.statcounter.com/counter/counter.js"
    async>
  </script>
  <noscript>
    <div class="statcounter">
      <a title="StatCounter" href="https://statcounter.com/"
         target="_blank"><img class="statcounter"
         src="https://c.statcounter.com/11947282/0/dd885c2d/1/"
         alt="StatCounter">
      </a>
    </div>
  </noscript>
  <!-- End of Statcounter Code -->

<!--stackedit_data:
eyJoaXN0b3J5IjpbLTYyNjk2NDE1MCwxMDAzOTk0MDQ4LC0xNT
U0NDgzNTIxLDc0MDQyNDA5NSwtOTUzNzU1NjQ2LDUxNjg3NTg0
MCwtNjY3MTc5NjM3XX0=
-->