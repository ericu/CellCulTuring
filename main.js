"use strict";

(function () {

  let canvas;
  let context;
  let width;
  let height;

   function init() {
     let initStart = performance.now();
     canvas = document.getElementById('canvas');
     context = canvas.getContext('2d');
     width = canvas.width;
     height = canvas.height;
     context.clearRect(0, 0, width, height);
     context.fillStyle = 'rgba(128, 128, 128, 1.0)';
//     context.fillStyle = 'rgb(200, 0, 0)';
     context.fillRect(0, 0, width, height);
     let drawingStart = performance.now();
     let fillStyleBlack = 'rgba(0, 0, 0, 1.0)';
     let fillStyleWhite = 'rgba(255, 255, 255, 1.0)';
     for (let i = 0; i < width; ++i) {
       for (let j = 0; j < height; ++j) {
         context.fillStyle = i < j ? fillStyleBlack : fillStyleWhite;
//         context.fillStyle = `rgb(${255 * i / width}, ${255 * j / height}, 128)`;
         context.fillRect(i, j, 1, 1);
       }
     }
     let drawingEnd = performance.now();
     console.log('drawing took', drawingEnd-drawingStart, 'ms')
     let imageData = context.getImageData(0, 0, width, height);
     for (let i = 0; i < width / 2; ++i) {
       for (let j = 0; j < height / 2; ++j) {
         let addr = 4 * (i + width * j)
         imageData.data[addr    ] = 80
         imageData.data[addr + 1] = 0
         imageData.data[addr + 2] = 0
       }
     }
     context.putImageData(imageData, width / 2, height / 4)
     console.log('init took', drawingEnd-initStart, 'ms')
   }

   window.init = init;
})()

