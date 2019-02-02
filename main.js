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

  function init() {
    canvas = document.getElementById('canvas');
    canvas2 = document.getElementById('canvas2');
    canvas2.width = canvas.width;
    canvas2.height = canvas.height;
    context = canvas.getContext('2d');
    context2 = canvas2.getContext('2d');
    context.clearRect(0, 0, canvas.width, canvas.height);
    context2.clearRect(0, 0, canvas2.width, canvas2.height);
    showTestToggled();
    showDebugToggled();
    showDebugControlsToggled();
    getColorInfo();
    getPlayerInfo();
    canvas.addEventListener('click', onCanvasClicked);
    canvas2.addEventListener('click', onCanvasClicked);
    window.addEventListener('resize', resizeCanvasCSS);
    initAnimation();
    toggleRun();
  }
  window.init = init;

  function setDimensions(w, h) {
    canvas.width = w;
    canvas.height = h;
    canvas2.width = w;
    canvas2.height = h;
    activeWidth = canvas.width - 2 * borderSize;
    activeHeight = canvas.height - 2 * borderSize;
    resizeCanvasCSS();
  }

  function resizeCanvasCSS() {
    function helper(container, canvas) {
      let rect = container.getBoundingClientRect();
      let boundingWidth = rect.width;
      let boundingHeight = rect.height;
      if (!(boundingWidth && boundingHeight && canvas.width && canvas.height)) {
        return; // not yet initialized
      }
      let ratio = canvas.height / canvas.width;
      if (boundingWidth * ratio > boundingHeight) {
        // height is the limiting dimension
        canvas.style.height = boundingHeight;
        canvas.style.width = boundingHeight / ratio;
      } else {
        canvas.style.height = boundingWidth * ratio;
        canvas.style.width = boundingWidth;
      }
    }
    helper(document.getElementById('canvas-container'), canvas);
    helper(document.getElementById('canvas2-container'), canvas2);
  }

  function initBuffers() {
    inputBuffer = context.getImageData(0, 0, canvas.width, canvas.height);
    outputBuffer = context.createImageData(inputBuffer)
    outputBuffer2 = context.createImageData(inputBuffer)
    inputView = new Uint32Array(inputBuffer.data.buffer);
    outputView = new Uint32Array(outputBuffer.data.buffer);
    outputView2 = new Uint32Array(outputBuffer2.data.buffer);
  }

  var curFunc;

  let animation;
  function initAnimation() {
    // Add 2 for the sentinel borders, which the animation doesn't think
    // about.
    setDimensions(animation.width + 2, animation.height + 2);
    initBuffers();
    let c = new CanvasWrapper(outputBuffer);
    c.fillRect(0, 0, 0, canvas.width, canvas.height);
    animation.init(c, originX, originY, activeWidth, activeHeight,
                   OBVIOUS_COLORS);
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.putImageData(outputBuffer, 0, 0);
    inputView.set(outputView);
    curFunc = animation.f;
  }

  function registerAnimation(name, width, height, init, f) {
    animation = {
      init: init,
      f: f,
      name: name,
      width: width,
      height: height
    };
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
  window.test = test;

  function step() {
    runConv3x3Step(curFunc, inputView, outputView);
    context.putImageData(outputBuffer, 0, 0,
                         originX, originY, activeWidth, activeHeight);
    inputView.set(outputView);
  }
  window.step = step;

  function showTestToggled() {
    if (document.getElementById('toggle_test').checked) {
      document.getElementById('canvas2').parentElement.style.display = 'inline';
    } else {
      document.getElementById('canvas2').parentElement.style.display = 'none';
    }
    resizeCanvasCSS();
  }
  window.showTestToggled = showTestToggled;

  function showDebugToggled() {
    if (document.getElementById('toggle_debug').checked) {
      document.getElementById('debug').style.display = 'inline';
    } else {
      document.getElementById('debug').style.display = 'none';
    }
    resizeCanvasCSS();
  }
  window.showDebugToggled = showDebugToggled;

  function showDebugControlsToggled() {
    if (document.getElementById('toggle_debug_controls').checked) {
      document.getElementById('debugging-controls').style.display = 'flex';
    } else {
      document.getElementById('debugging-controls').style.display = 'none';
    }
    resizeCanvasCSS();
  }
  window.showDebugControlsToggled = showDebugControlsToggled;

  let OBVIOUS_COLORS;
  function getColorInfo() {
    OBVIOUS_COLORS = document.getElementById('toggle_obvious').checked;
  }
  function showObviousToggled() {
    getColorInfo();
    initAnimation();
  }
  window.showObviousToggled = showObviousToggled;

  window.leftPlayerHuman = false;
  window.rightPlayerHuman = false;
  function getPlayerInfo() {
    leftPlayerHuman =
      document.getElementById('select_left_player_human').checked;
    rightPlayerHuman =
      document.getElementById('select_right_player_human').checked;
  }
  function playerToggled() {
    getPlayerInfo();
    initAnimation();
  }
  window.playerToggled = playerToggled;

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
    let xScale = canvas.clientWidth / canvas.width;
    let yScale = canvas.clientHeight / canvas.height;
    let x = Math.floor(e.offsetX / xScale);
    let y = Math.floor(e.offsetY / yScale);
    let addr = getAddr32(x, y);
    let view;
    if (e.currentTarget.id === 'canvas') {
      view = inputView;  // Not outputView, which may differ.
    } else {
      view = outputView2;
      assert(e.currentTarget.id === 'canvas2');
    }
    let value = view[addr]
    // Assumes the animation attaches ns to canvas on selection.
    let s = `(${x},${y}):${value.toString(16)}\n` +
            canvas.ns.getDescription(view[addr])
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
  window.toggleRun = toggleRun;

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
})()

