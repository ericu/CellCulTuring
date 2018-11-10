"use strict";

(function () {

  let canvas, canvas2;
  let context, context2;
  let width;
  let height;
  // TODO: This isn't general.
  const borderSize = 1; // Leave a 1-pixel sentinel border.
  const originX = borderSize;
  const originY = borderSize;

   function init() {
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
     onSelectAnimation();
   }

   function initArbitraryPattern() {
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
   }
   window.initArbitraryPattern = initArbitraryPattern;

   var curFunc;

   function onSelectAnimation() {
     const select = document.getElementById('animation');
     const animation = select.options[select.selectedIndex].value;
     animations[animation].init(canvas);
     curFunc = animations[animation].f;
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
         outputView[getAddr32(i, j)] = value;
       }
     }
     return newData;
   }

   function test() {
     context2.fillStyle = 'rgba(0, 255, 0, 1.0)';
     context2.fillRect(0, 0, canvas2.width, canvas2.height);
     const output = runConv3x3Step(curFunc)
     context2.putImageData(output, 0, 0, originX, originY, width, height);
   }

   function step() {
     const output = runConv3x3Step(curFunc)
     // 0,0 is the origin of the second imageData, overlaid onto the first.
     // Then we copy over only a subset "dirty region" by using the last 4
     // parameters.
     context.putImageData(output, 0, 0, originX, originY, width, height);
   }

   let running = false;
   function animationFrame(timestamp) {
     if (running) {
       step();
       updateFPS(timestamp);
       requestAnimationFrame(animationFrame);
     }
   }

   function toggleRun() {
     running = !running;
     if (running) {
       requestAnimationFrame(animationFrame);
     }
   }

   var fpsFrames = 0
   var fpsStartTime = -1

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

