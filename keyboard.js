(function () {
  window.keyTable = { };
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);

  function onKeyDown(event) {
    let key = event.key.toLowerCase();
    if (!keyTable[key]) {
      keyTable[key] = true;
    }
  }

  function onKeyUp(event) {
    let key = event.key.toLowerCase();
    keyTable[key] = false;
  }
})()
