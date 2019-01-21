(function () {
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);

  let keyTable = { };
  function onKeyDown(event) {
    let key = event.key.toLowerCase();
    console.log('key: ', key);
    if (!keyTable[key]) {
      keyTable[key] = true;
    }
    if (event.code === 'Space') {
      document.getElementById('toggle_run').click();
    }
    if (_.indexOf(['w', 's', 'arrowup', 'arrowdown', ' '], key) !== -1) {
      event.preventDefault();
    }
    console.log(event);
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
