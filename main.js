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
   }

   const dead = [0, 0, 0, 255]
   const live = [255, 255, 255, 255]
   function getPixel(data, i, j) {
     if (i < 0 || j < 0 || i >= width || j >= width) {
       return dead
     }
     var addr = 4*(i + width * j)
     return data.slice(addr, addr + 4)
   }
   function putPixel(data, i, j, pixel) {
     var addr = 4*(i + width * j)
     data[addr++] = pixel[0]
     data[addr++] = pixel[1]
     data[addr++] = pixel[2]
     data[addr]   = pixel[3]
   }

   function lifeVal(color) {
     if (color[0]) {
       return 1;
     }
     return 0;
   }

   function lifeCell(data, i, j) {
     let sum = 0;
     for (var dI = -1; dI <2; ++dI) {
       for (var dJ = -1; dJ <2; ++dJ) {
         sum += lifeVal(getPixel(data, i + dI, j + dJ))
       }
     }
     if (sum === 3) {
       return live
     } else if (sum === 2) {
       return getPixel(data, i, j)
     } else {
       return dead
     }
   }

   function lifeStep() {
     let oldData = context.getImageData(0, 0, width, height);
     let newData = context.createImageData(oldData)
     let liveCount = 0;
     let deadCount = 0;
     for (let i = 0; i < width; ++i) {
       for (let j = 0; j < height; ++j) {
         let value = lifeCell(oldData.data, i, j);
         if (lifeVal(value)) {
           ++liveCount;
         } else {
           ++deadCount;
         }
         putPixel(newData.data, i, j, value);
       }
     }
     context.clearRect(0, 0, width, height);
     context.putImageData(newData, 0, 0)
   }

   window.init = init;
   window.lifeStep = lifeStep;
})()

