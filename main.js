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
  // inputBuffer starts with canvas image data.  We write to outputBuffer,
  // then copy that either to the canvas or to canvas2 for display, and into
  // inputBuffer for the next iteration.
  let inputBuffer;
  let canvas2Buffer
  let inputView;
  let outputBuffer;
  let outputView;

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
    context2.clearRect(0, 0, canvas.width, canvas.height);
    width = canvas.width - 2 * borderSize;
    height = canvas.height - 2 * borderSize;
    onSelectAnimation();
  }

  function initBuffers() {
    // TODO: Are we keeping 2 buffers properly?
    inputBuffer = context.getImageData(0, 0, canvas.width, canvas.height);
    outputBuffer = context.createImageData(inputBuffer)
    inputView = new Uint32Array(inputBuffer.data.buffer);
    outputView = new Uint32Array(outputBuffer.data.buffer);
  }

  function initArbitraryPattern(c) {
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
  }
  window.initArbitraryPattern = initArbitraryPattern;

  var curFunc;

  function onSelectAnimation() {
    const select = document.getElementById('animation');
    if (select.selectedIndex >= 0) {
      initBuffers();
      let c = new CanvasWrapper(outputBuffer);
      c.fillRect(0, 0, 0, canvas.width, canvas.height);
      const animation = select.options[select.selectedIndex].value;
      animations[animation].init(c);
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.putImageData(outputBuffer, 0, 0);
      inputView.set(outputView);
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

  function dumpImageData(data) {
    let view = new Uint32Array(data.data.buffer);
    for (let j = 0; j < data.height; ++j) {
      let addr = getAddr32(0, j);
      var t = _.map(view.slice(addr, addr + data.width), i =>
                    i.toString(16)).join(', ');
      console.log(t);
    }
  }
  window.dumpImageData = dumpImageData;

  function dumpBoard() {
    console.log('board state:')
    dumpImageData(context.getImageData(0, 0, canvas.width, canvas.height));
  }
  window.dumpBoard = dumpBoard;

  // TODO: Look into array.subarray instead of the topData, midData, botData
  // copies.  Could be cleaner and faster; faster still if we passed them into
  // f instead of the flattened array, assuming that was useful to f.
  function runConv3x3Step(f, inputView, outputView) {
    let inputRow = inputView.subarray(0, canvas.width);
    let outputRow = outputView.subarray(0, canvas.width);
    outputRow.set(inputRow);
    let addr = getAddr32(0, canvas.height - 1);
    inputRow = inputView.subarray(addr, addr + canvas.width);
    outputRow = outputView.subarray(addr, addr + canvas.width);
    outputRow.set(inputRow);
    for (let j = 0; j < canvas.height; ++j) {
      addr = getAddr32(0, j);
      outputView[addr] = inputView[addr];
      outputView[addr + canvas.width - 1] = inputView[addr + canvas.width - 1];
    }

    for (let j = originY; j < canvas.height - borderSize; ++j) {
      let i = originX;
      let topAddr = getAddr32(i - 1, j - 1);
      let topData = [0]; // placeholder
      topData.push(inputView[topAddr++])
      topData.push(inputView[topAddr++])

      let midAddr = getAddr32(i - 1, j);
      let midData = [0]; // placeholder
      midData.push(inputView[midAddr++])
      midData.push(inputView[midAddr++])

      let botAddr = getAddr32(i - 1, j + 1);
      let botData = [0]; // placeholder
      botData.push(inputView[botAddr++])
      botData.push(inputView[botAddr++])

      for (; i < canvas.width - borderSize; ++i) {
        topData.shift();
        topData.push(inputView[topAddr++])
        midData.shift();
        midData.push(inputView[midAddr++])
        botData.shift();
        botData.push(inputView[botAddr++])

        let value = f(_.flatten([topData, midData, botData]))
        outputView[getAddr32(i, j)] = value;
      }
    }
  }

  function test() {
    runConv3x3Step(curFunc, inputView, outputView)

    // TODO: Remove this?
    context2.fillStyle = 'rgba(0, 255, 0, 1.0)';
    context2.fillRect(0, 0, canvas2.width, canvas2.height);

    context2.putImageData(outputBuffer, 0, 0);
  }

  function step() {
    runConv3x3Step(curFunc, inputView, outputView)
//    context.clearRect(originX, originY, width, height);
    context.putImageData(outputBuffer, 0, 0, originX, originY, width, height);
    inputView.set(outputView);
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

