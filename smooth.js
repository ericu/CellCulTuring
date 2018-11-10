(function () {
   function initSmooth(canvas) {
//     initArbitraryPattern();
   }

   function smooth(data) {
     let v = _(data)
       .map(v => ([v & 0xff, v >>> 8 & 0xff, v >>> 16 & 0xff, v >>> 24 & 0xff]))
       .unzip()
       .map(_.sum)
       .map(v => {
          let x = Math.round(v / 9);
          if (x > 255) {
            return 255;
          }
          return x;
        })
       .value()
     return (v[0] | v[1] << 8 | v[2] << 16 | v[3] << 24) >>> 0;
   }

   window.addEventListener(
     "load",
     () => window.registerAnimation("smooth", initSmooth, smooth));

})();
