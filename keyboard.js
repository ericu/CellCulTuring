(function () {
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);

  let keyTable = { };
  function onKeyDown(event) {
    let key = event.key.toLowerCase();
    if (!keyTable[key]) {
      keyTable[key] = true;
    }
    if (event.key === ' ') {
      document.getElementById('toggle_run').click();
      event.preventDefault();
    } else if (event.key === 'd') {
      showDebugControls();
      event.preventDefault();
    }
    if (_.indexOf(['w', 's', 'arrowup', 'arrowdown', ' '], key) !== -1) {
      event.preventDefault();
    }
  }

  function onKeyUp(event) {
    let key = event.key.toLowerCase();
    keyTable[key] = false;
    if (_.indexOf(['w', 's', 'arrowup', 'arrowdown', ' '], key) !== -1) {
      event.preventDefault();
    }
  }

  function keyIsPressed(lowerCaseChar) {
    return keyTable[lowerCaseChar];
  }
  window.keyIsPressed = keyIsPressed;

})()
