"use strict";

(function () {

  let canvas, canvas2;
  let context, context2;
  // inputBuffer starts with canvas image data.  We write to outputBuffer,
  // then copy that either to the canvas or to canvas2 for display, and into
  // inputBuffer for the next iteration.
  let inputBuffer;
  let inputView;
  let outputBuffer;
  let outputBuffer2;
  let outputView;
  let outputView2;
  let activeWidth;
  let activeHeight;
  const borderSize = 1; // Leave a 1-pixel sentinel border.
  const originX = borderSize;
  const originY = borderSize;

  let CANVAS_SCALE = 8;
  function init() {
    canvas = document.getElementById('canvas');
    let parent = canvas.parentElement;
    canvas2 = canvas.cloneNode(true);
    canvas2.id = 'canvas2';
    parent.insertBefore(canvas2, canvas);
    parent.insertBefore(canvas, canvas2);
    context = canvas.getContext('2d');
    context2 = canvas2.getContext('2d');
    context.clearRect(0, 0, canvas.width, canvas.height);
    context2.clearRect(0, 0, canvas.width, canvas.height);
    onSelectAnimation();
    canvas.addEventListener('click', onCanvasClicked);
    canvas2.addEventListener('click', onCanvasClicked);
  }

  function setDimensions(w, h) {
    canvas.width = w;
    canvas.height = h;
    canvas2.width = w;
    canvas2.height = h;
    canvas.style.width = CANVAS_SCALE * canvas.width + 'px';
    canvas.style.height = CANVAS_SCALE * canvas.height + 'px';
    canvas2.style.width = CANVAS_SCALE * canvas.width + 'px';
    canvas2.style.height = CANVAS_SCALE * canvas.height + 'px';
    activeWidth = canvas.width - 2 * borderSize;
    activeHeight = canvas.height - 2 * borderSize;
  }

  function initBuffers() {
    inputBuffer = context.getImageData(0, 0, canvas.width, canvas.height);
    outputBuffer = context.createImageData(inputBuffer)
    outputBuffer2 = context.createImageData(inputBuffer)
    inputView = new Uint32Array(inputBuffer.data.buffer);
    outputView = new Uint32Array(outputBuffer.data.buffer);
    outputView2 = new Uint32Array(outputBuffer2.data.buffer);
  }

  function initArbitraryPattern(c) {
    c.fillRect(0xffffff00, 0, 0, canvas.width, canvas.height);
    let fillStyleBlack = 0xff000000;
    let fillStyleWhite = 0xffffffff;
    for (let i = 0; i < activeWidth; ++i) {
      for (let j = 0; j < activeHeight; ++j) {
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
      const animationIndex = select.options[select.selectedIndex].value;
      const animation = animations[animationIndex];
      // Add 2 for the sentinel borders, which the animation doesn't think
      // about.
      setDimensions(animation.width + 2, animation.height + 2);
      initBuffers();
      let c = new CanvasWrapper(outputBuffer);
      c.fillRect(0, 0, 0, canvas.width, canvas.height);
      animation.init(c, originX, originY, activeWidth, activeHeight);
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.putImageData(outputBuffer, 0, 0);
      inputView.set(outputView);
      curFunc = animation.f;
    }
  }
  window.onSelectAnimation = onSelectAnimation;

  var animations = {}
  function registerAnimation(name, width, height, init, f) {
    animations[name] = {
      init: init,
      f: f,
      name: name,
      width: width,
      height: height
    };
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

  function dumpImageData(view, x, y, w, h) {
    for (let j = y; j < y + h; ++j) {
      let addr = getAddr32(x, j);
      var t = _.map(view.slice(addr, addr + w), i => i.toString(16)).join(', ');
      console.log(t);
    }
  }
  window.dumpImageData = dumpImageData;

  function dumpBoard(x, y, w, h) {
    console.log('board state:');
    x = x || 0;
    y = y || 0;
    w = w || canvas.width;
    h = h || canvas.height;
    dumpImageData(inputView, x, y, w, h);
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

      let outputAddr = getAddr32(i, j);
      for (; i < canvas.width - borderSize; ++i, ++outputAddr) {
        topData.shift();
        topData.push(inputView[topAddr++])
        midData.shift();
        midData.push(inputView[midAddr++])
        botData.shift();
        botData.push(inputView[botAddr++])

        let value = f(_.flatten([topData, midData, botData]), i, j)
        outputView[outputAddr] = value;
      }
    }
  }

  function test() {
    runConv3x3Step(curFunc, inputView, outputView2);
    context2.putImageData(outputBuffer2, 0, 0);
  }

  function step() {
    runConv3x3Step(curFunc, inputView, outputView);
//    context.clearRect(originX, originY, width, height);
    context.putImageData(outputBuffer, 0, 0,
                         originX, originY, activeWidth, activeHeight);
    inputView.set(outputView);
  }

  function showTestToggled(e) {
    if (e.checked) {
      document.getElementById('canvas2').style.display = 'inline';
    } else {
      document.getElementById('canvas2').style.display = 'none';
    }
  }

  function showDebugToggled(e) {
    if (e.checked) {
      document.getElementById('debug').style.display = 'inline';
    } else {
      document.getElementById('debug').style.display = 'none';
    }
  }

  let frameReady = false;
  let frameInProgress = false;
  function asyncStep() {
    runConv3x3Step(curFunc, inputView, outputView);
    frameReady = true;
    frameInProgress = false;
  }

  function asyncAnimationFrame(timestamp) {
    if (running) {
      if (frameReady) {
        frameReady = false;
        context.putImageData(outputBuffer, 0, 0,
                             originX, originY, activeWidth, activeHeight);
        inputView.set(outputView);
        window.setTimeout(asyncStep, 0);
        updateFPS(timestamp);
      } else if (!frameInProgress) {
        window.setTimeout(asyncStep, 0);
      }
      requestAnimationFrame(asyncAnimationFrame);
    } else {
      resetFPS();
    }
  }

  function onCanvasClicked(e) {
    let x = Math.floor(e.offsetX / CANVAS_SCALE);
    let y = Math.floor(e.offsetY / CANVAS_SCALE);
    let addr = getAddr32(x, y);
    let view;
    if (e.currentTarget.id === 'canvas') {
      view = inputView;  // Not outputView, which may differ.
    } else {
      view = outputView2;
      assert(e.currentTarget.id === 'canvas2');
    }
    let value = view[addr]
    let s = `(${x},${y}):${value.toString(16)}\n` +
            bm.ns.getDescription(view[addr])
    // Assumes a global BitManager.
    document.getElementById('debug').value = s;
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

  /* On frame callback:
     If you have a frame ready to show, copy it in, tell updateFPS about it, and
     kick off the next compute in the background.
     Update FPS.
     Request the next frame.

     On frame completion: mark the frame ready to show.
     */
  function toggleRun() {
    running = !running;
    if (running) {
      requestAnimationFrame(asyncAnimationFrame);
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
  window.showTestToggled = showTestToggled;
  window.showDebugToggled = showDebugToggled;
})()

