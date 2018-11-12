"use strict";

let width;
let height;
// TODO: This isn't general.
const borderSize = 1; // Leave a 1-pixel sentinel border.
const originX = borderSize;
const originY = borderSize;

(function () {

  let canvas, canvas2;
  let context, context2;

   function init() {
     canvas = document.getElementById('canvas');
     canvas.style.width = 8 * canvas.width + 'px';
     canvas.style.height = 8 * canvas.height + 'px';
     canvas2 = document.createElement('canvas');
     canvas.parentElement.insertBefore(canvas2, canvas);
     canvas.parentElement.insertBefore(canvas, canvas2);
     canvas2.width = canvas.width;
     canvas2.height = canvas.height;
     canvas2.style.width = 8 * canvas.width + 'px';
     canvas2.style.height = 8 * canvas.height + 'px';
     context = canvas.getContext('2d');
     context2 = canvas2.getContext('2d');
     context.clearRect(0, 0, canvas.width, canvas.height);
     width = canvas.width - 2 * borderSize;
     height = canvas.height - 2 * borderSize;
     onSelectAnimation();
   }

   function initArbitraryPattern() {
     var c = new CanvasWrapper(canvas);
     c.fillRect(0xffffff00, 0, 0, canvas.width, canvas.height);
     let fillStyleBlack = 0xff000000;
     let fillStyleWhite = 0xffffffff;
     for (let i = 0; i < width; ++i) {
       for (let j = 0; j < height; ++j) {
         c.fillRect(i < j ? fillStyleBlack : fillStyleWhite,
                    i + originX, j + originY, 1, 1);
       }
     }
     c.fillRect(fillStyleWhite, 125, 145, 17, 30);
     c.fillRect(fillStyleWhite, 25, 143, 17, 20);
     c.fillRect(fillStyleWhite, 15, 113, 17, 20);
     c.fillRect(fillStyleBlack, 45, 45, 7, 3);
     c.fillRect(fillStyleBlack, 115, 20, 17, 20);
     c.fillRect(fillStyleBlack, 85, 30, 17, 20);
     c.commit();
   }
   window.initArbitraryPattern = initArbitraryPattern;

   var curFunc;

   function onSelectAnimation() {
     const select = document.getElementById('animation');
     if (select.selectedIndex >= 0) {
       const animation = select.options[select.selectedIndex].value;
       animations[animation].init(canvas);
       curFunc = animations[animation].f;
     }
   }
   window.onSelectAnimation = onSelectAnimation;

   var animations = {}
   function registerAnimation(name, init, f) {
     animations[name] = { init: init, f: f }
     let select = document.getElementById('animation');
     let opt = document.createElement('option');
     opt.value = name;
     opt.innerHTML = name;
     select.appendChild(opt);
   }
   window.registerAnimation = registerAnimation;

   function getAddr32(i, j) {
     return i + canvas.width * j
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
   window.dumpBoard = dumpBoard;

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
//         console.log('output: ', value.toString(16))
         outputView[getAddr32(i, j)] = value;
       }
     }
     return newData;
   }

   function test() {
     context2.fillStyle = 'rgba(0, 255, 0, 1.0)';
     context2.fillRect(0, 0, canvas2.width, canvas2.height);
     const output = runConv3x3Step(curFunc)
     context2.putImageData(output, 0, 0);
   }

   function step() {
     const output = runConv3x3Step(curFunc)
     // 0,0 is the origin of the second imageData, overlaid onto the first.
     // Then we copy over only a subset "dirty region" by using the last 4
     // parameters.
     context.fillStyle = 'rgba(0, 0, 0, 1.0)';
     context.fillRect(originX, originY, width, height);
     context.putImageData(output, 0, 0, originX, originY, width, height);
//     dumpBoard();
   }

   let running = false;
   function animationFrame(timestamp) {
     if (running) {
       step();
       updateFPS(timestamp);
       requestAnimationFrame(animationFrame);
     } else {
       resetFPS();
     }
   }

   function toggleRun() {
     running = !running;
     if (running) {
       requestAnimationFrame(animationFrame);
     }
   }

   var fpsFrames = 0;
   var fpsStartTime = -1;

   function resetFPS() {
     fpsFrames = 0;
     fpsStartTime = -1;
     document.getElementById('fps').innerText = "N/A";
   }

   function updateFPS(timestamp) {
     if (fpsStartTime < 0) {
       fpsStartTime = timestamp;
     } else {
       ++fpsFrames
       var timeDiff = timestamp - fpsStartTime
       // If it's been over a second and we've done something, update.
       if (timeDiff >= 1000 && fpsFrames > 0) {
         let fps = fpsFrames * 1000 / timeDiff
         document.getElementById('fps').innerText = fps.toFixed(3)
         fpsFrames = 0;
         fpsStartTime = timestamp
       }
     }
   }


   window.init = init;
   window.toggleRun = toggleRun;
   window.step = step;
   window.test = test;
})()

