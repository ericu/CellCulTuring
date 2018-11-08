"use strict";

(function () {

  let canvas, canvas2;
  let context, context2;
  let width;
  let height;
  let originX = 1; // Leave a 1-pixel sentinel border.
  let originY = 1; // Leave a 1-pixel sentinel border.

   function init() {
     let initStart = performance.now();
     canvas = document.getElementById('canvas');
     canvas.style.width = 3 * canvas.width + 'px';
     canvas.style.height = 3 * canvas.height + 'px';
     canvas2 = document.getElementById('canvas2');
     canvas2.style.width = 2 * canvas.width + 'px';
     canvas2.style.height = 2 * canvas.height + 'px';
     context = canvas.getContext('2d');
     context2 = canvas2.getContext('2d');
     context.clearRect(0, 0, canvas.width, canvas.height);
     width = canvas.width - 2;
     height = canvas.height - 2;

     context.fillStyle = 'rgba(0, 0, 0, 1.0)';
     context.fillRect(0, 0, canvas.width, canvas.height);
     let fillStyleBlack = 'rgba(0, 0, 0, 1.0)';
     let fillStyleWhite = 'rgba(255, 255, 255, 1.0)';
     for (let i = 0; i < width; ++i) {
       for (let j = 0; j < height; ++j) {
         context.fillStyle = i < j ? fillStyleBlack : fillStyleWhite;
//         context.fillStyle = `rgb(${255 * i / width}, ${255 * j / height}, 128)`;
         context.fillRect(i + originX, j + originY, 1, 1);
       }
     }
   }

   const dead = [0, 0, 255, 255]
   const live = [255, 255, 255, 255]
   function getPixel(data, i, j) {
     var addr = 4*(i + canvas.width * j)
     return data.slice(addr, addr + 4)
   }
   function putPixel(data, i, j, pixel) {
     var addr = 4*(i + canvas.width * j)
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
     let neighborSum = 0;
     let current
     for (var dI = -1; dI <2; ++dI) {
       for (var dJ = -1; dJ <2; ++dJ) {
         let value = lifeVal(getPixel(data, i + dI, j + dJ))
         if (!dI && !dJ) {
           current = value
         } else {
           neighborSum += value;
         }
       }
     }
     if ((neighborSum === 3) ||
         (current && neighborSum === 2)) {
       return live
     }
     return dead
   }

   function lifeStep() {
     let oldData = context.getImageData(0, 0, canvas.width, canvas.height);
     let newData = context.createImageData(oldData)
     let liveCount = 0;
     let deadCount = 0;
     for (let i = 0; i < width; ++i) {
       for (let j = 0; j < height; ++j) {
         let x = i + originX;
         let y = j + originY
         let value = lifeCell(oldData.data, x, y);
         if (lifeVal(value)) {
           ++liveCount;
         } else {
           ++deadCount;
         }
         putPixel(newData.data, x, y, value);
       }
     }
     // 0,0 is the origin of the second imageData, overlaid onto the first.
     // Then we copy over only a subset "dirty region" by using the last 4
     // parameters.
     context.putImageData(newData, 0, 0, originX, originY, width, height);
   }

   function test() {
//     context.putImageData(newData, 0, 0);
     context2.fillStyle = 'rgba(0, 255, 0, 1.0)';
     context2.fillRect(0, 0, canvas2.width, canvas2.height);
     let oldData = context.getImageData(originX, originY, canvas.width / 2,
                                        canvas.height / 2);
     context2.putImageData(oldData, originX, originY, 0, 0, width, height);
   }

   let running = false;
   function animationFrame() {
     if (running) {
       lifeStep()
       requestAnimationFrame(animationFrame);
     }
   }

   function toggleRun() {
     running = !running;
     if (running) {
       animationFrame()
     }
   }

   window.init = init;
   window.toggleRun = toggleRun;
   window.lifeStep = lifeStep;
   window.test = test;
})()

