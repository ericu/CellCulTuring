(function () {
   function initLifeCell2() {
     initArbitraryPattern();
   }

   function lifeVal2(color) {
     if (color & 0x000000ff) { // little-endian
       return 1;
     }
     return 0;
   }

   const live32 = 0xffffffff;
   const dead32 = 0xff000000;
   function lifeCell2(data) {
     let current = lifeVal2(data[4]);
     let neighborSum = _.sumBy(data, p => lifeVal2(p)) - current;
     if ((neighborSum === 3) || (current && neighborSum === 2)) {
       return live32
     }
     return dead32
   }

   window.addEventListener(
     "load",
     () => window.registerAnimation("life", initLifeCell2, lifeCell2));

})()