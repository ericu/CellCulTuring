"use strict";

(function () {

  let canvas, canvas2;
  let context, context2;
  let width;
  let height;
  const borderSize = 1; // Leave a 1-pixel sentinel border.
  const originX = borderSize;
  const originY = borderSize;

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
     width = canvas.width - 2 * borderSize;
     height = canvas.height - 2 * borderSize;

     context.fillStyle = 'rgba(0, 255, 255, 1.0)';
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
     context.fillStyle = fillStyleWhite;
     context.fillRect(125, 145, 17, 30);
     context.fillRect(25, 143, 17, 20);
     context.fillRect(15, 113, 17, 20);
     context.fillStyle = fillStyleBlack;
     context.fillRect(45, 45, 7, 3);
     context.fillRect(115, 20, 17, 20);
     context.fillRect(85, 30, 17, 20);
//     dumpBoard();
   }

   function getAddr(i, j) {
     return 4 * (i + canvas.width * j)
   }

   function getAddr32(i, j) {
     return i + canvas.width * j
   }

   const dead = [0, 0, 255, 255]
   const live = [255, 255, 255, 255]
   function getPixel(data, i, j) {
     var addr = getAddr(i, j);
     return data.slice(addr, addr + 4)
   }
   function putPixel(data, i, j, pixel) {
     var addr = getAddr(i, j);
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

   function lifeVal2(color) {
     if (color & 0x000000ff) { // little-endian
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

   function lifeCell2(data) {
     let current = lifeVal2(midRow[1]);
     let neighborSum = _.sumBy(data, p => lifeVal2(p)) - current;
     if ((neighborSum === 3) || (current && neighborSum === 2)) {
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

   function lifeStep2() {
     runConv3x3Step(lifeCell2);
   }

   function smoothStep() {
     return runConv3x3Step(smooth)
   }

   function dumpBoard() {
     console.log('board state:')
     let oldData = context.getImageData(0, 0, canvas.width, canvas.height);
     let view = new Uint32Array(oldData.data.buffer);
     for (let b = 0; b < canvas.height; ++b) {
       let addr = getAddr32(0, b);
       var t = _.map(view.slice(addr, addr + canvas.width), i =>
                     i.toString(16)).join(', ');
       console.log(t);
     }
   }

   function runConv3x3Step(f) {
     let oldData = context.getImageData(0, 0, canvas.width, canvas.height);
     let view = new Uint32Array(oldData.data.buffer);
     let newData = context.createImageData(oldData)
     let outputView = new Uint32Array(newData.data.buffer);
     for (let j = originY; j < canvas.height - borderSize; ++j) {
       let i = originX;
       let topAddr = getAddr32(i - 1, j - 1);
       let topData = [0]; // placeholder
       topData.push(view[topAddr++])
       topData.push(view[topAddr++])

       let midAddr = getAddr32(i - 1, j);
       let midData = [0]; // placeholder
       midData.push(view[midAddr++])
       midData.push(view[midAddr++])

       let botAddr = getAddr32(i - 1, j + 1);
       let botData = [0]; // placeholder
       botData.push(view[botAddr++])
       botData.push(view[botAddr++])

       for (; i < canvas.width - borderSize; ++i) {
         topData.shift();
         topData.push(view[topAddr++])
         midData.shift();
         midData.push(view[midAddr++])
         botData.shift();
         botData.push(view[botAddr++])

         let value = f(_.flatten([topData, midData, botData]))
         outputView[getAddr32(i, j)] = value;
       }
     }
     // 0,0 is the origin of the second imageData, overlaid onto the first.
     // Then we copy over only a subset "dirty region" by using the last 4
     // parameters.
     context.putImageData(newData, 0, 0, originX, originY, width, height);
//     dumpBoard();
   }

   function test() {
     context2.fillStyle = 'rgba(0, 255, 0, 1.0)';
     context2.fillRect(0, 0, canvas2.width, canvas2.height);
     let oldData = context.getImageData(originX, originY, canvas.width / 2,
                                        canvas.height / 2);
     context2.putImageData(oldData, originX, originY, 0, 0, width, height);
   }

   let running = false;
   function animationFrame() {
     if (running) {
       smoothStep()
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
   window.lifeStep = lifeStep2;
   window.smoothStep = smoothStep;
   window.test = smoothStep;
})()

