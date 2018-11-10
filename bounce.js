(function () {
 // Basic colors: ball, background, wall.
 // Ball also contains a velocity variable.  Start with just one of the 8
 // directions, but work toward Bresenham's algorithm for more angles.
 // Ball squish involves a compression layer counter.
 // Hard-code ball as 3x3 for now?  Nah--start with 1x1 and add compression
 // later.  So just ball [with velocity], background, wall.
 const C_WALL = 0xff000088;
 const C_BACKGROUND = 0xff880000;
 const C_BALL = 0xff88ff88;

 function fillStyleFromUint(u) {
   let a = u >>> 24 & 0xff;
   let r = u >>> 16 & 0xff;
   let g = u >>>  8 & 0xff;
   let b = u >>>  0 & 0xff;
   return `rgba(${r},${g},${b},${a})`
 }

 function initBounce(canvas) {
   let context = canvas.getContext('2d');

   context.fillStyle = fillStyleFromUint(C_BACKGROUND);
   context.fillRect(0, 0, canvas.width, canvas.height);

   context.fillStyle = fillStyleFromUint(C_WALL);
   context.strokeRect(0, 0, canvas.width, canvas.height);

   context.fillStyle = fillStyleFromUint(C_BALL);
   context.fillRect(canvas.width / 2, canvas.height / 2, 3, 3);
 }

 function bounce(data) {
 }

 window.addEventListener(
   "load",
   () => window.registerAnimation("bounce", initBounce, bounce));

})();
