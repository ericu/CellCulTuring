"use strict";

(function () {
  let bm;
  const DECIMATION = 50;

  // Segments numbered clockwise from top, then the middle last.
  // This table tells whether the segment is on for a given digit.
  const SEGMENT_TABLE = [
    [1, 0, 1, 1, 0, 1, 1, 1, 1, 1],
    [1, 1, 1, 1, 1, 0, 0, 1, 1, 1],
    [1, 1, 0, 1, 1, 1, 1, 1, 1, 1],
    [1, 0, 1, 1, 0, 1, 1, 0, 1, 0],
    [1, 0, 1, 0, 0, 0, 1, 0, 1, 0],
    [1, 0, 0, 0, 1, 1, 1, 0, 1, 1],
    [0, 0, 1, 1, 1, 1, 1, 0, 1, 1]
  ]

  function initBitManager() {
    bm = new BitManager();

    // Bits are 0xAABBGGRR because of endianness; TODO: Make endian-independent.

    // Sentinel bits that determine type:
    bm.declare('COUNTER_FLAG', 1, 0);
    bm.declare('COUNTER_BITS', 6, 24);
    bm.declare('COUNTER_SEGMENT_ID', 4, 1);
    bm.declare('COUNTER_COLOR', 2, 6);
    bm.declare('COUNTER_VISIBLE', 2, 30);
    bm.combine('COUNTER_ON', ['COUNTER_COLOR', 'COUNTER_VISIBLE'])
    bm.declare('STARTER_FLAG', 1, 15);
    bm.declare('STARTER_COUNTER_BITS', 7, 16);
  }

  function isStarter (c) {
    return bm.isSet('STARTER_FLAG', c);
  }

  function isCounter (c) {
    return bm.isSet('COUNTER_FLAG', c);
  }

  function initCounter(c) {
    initBitManager();

    c.fillRect(0, 0, 0, canvas.width, canvas.height);
    c.fillRect(bm.getMask('STARTER_FLAG'), 3, 3, 1, 1);

    let color = bm.getMask('COUNTER_FLAG');
    const TOP = 10;
    const LEFT = 10;
    const SEGMENT_LENGTH = 10;
    const SEGMENT_THICKNESS = 3;
    c.fillRect(bm.set('COUNTER_SEGMENT_ID', color, 0),
               LEFT + SEGMENT_THICKNESS,
               TOP,
               SEGMENT_LENGTH, SEGMENT_THICKNESS);
    c.fillRect(bm.set('COUNTER_SEGMENT_ID', color, 1),
               LEFT + SEGMENT_LENGTH + SEGMENT_THICKNESS,
               TOP + SEGMENT_THICKNESS,
               SEGMENT_THICKNESS, SEGMENT_LENGTH);
    c.fillRect(bm.set('COUNTER_SEGMENT_ID', color, 2),
               LEFT + SEGMENT_LENGTH + SEGMENT_THICKNESS,
               TOP + 2 * SEGMENT_THICKNESS + SEGMENT_LENGTH,
               SEGMENT_THICKNESS, SEGMENT_LENGTH);
    c.fillRect(bm.set('COUNTER_SEGMENT_ID', color, 3),
               LEFT + SEGMENT_THICKNESS,
               TOP + 2 * SEGMENT_THICKNESS + 2 * SEGMENT_LENGTH,
               SEGMENT_LENGTH, SEGMENT_THICKNESS);
    c.fillRect(bm.set('COUNTER_SEGMENT_ID', color, 4),
               LEFT,
               TOP + 2 * SEGMENT_THICKNESS + SEGMENT_LENGTH,
               SEGMENT_THICKNESS, SEGMENT_LENGTH);
    c.fillRect(bm.set('COUNTER_SEGMENT_ID', color, 5),
               LEFT,
               TOP + SEGMENT_THICKNESS,
               SEGMENT_THICKNESS, SEGMENT_LENGTH);
    c.fillRect(bm.set('COUNTER_SEGMENT_ID', color, 6),
               LEFT + SEGMENT_THICKNESS,
               TOP + SEGMENT_THICKNESS + SEGMENT_LENGTH,
               SEGMENT_LENGTH, SEGMENT_THICKNESS);
  }

  function counter(data, i, j) {
    let current = data[4];
    if (isStarter(current)) {
      let fastCounter = bm.get('STARTER_COUNTER_BITS', current);
      let slowCounter = bm.get('COUNTER_BITS', current);
      console.log('starter', i, j, fastCounter, slowCounter);
      if (++fastCounter >= DECIMATION) {
        fastCounter = 0;
        ++slowCounter;
      }
      let next = bm.set('STARTER_COUNTER_BITS', current, fastCounter)
      next = bm.set('COUNTER_BITS', next, slowCounter)
      return next;
    } else {
      let slowCounter = _(data)
        .map(c => bm.get('COUNTER_BITS', c))
        .max()
      let next = bm.set('COUNTER_BITS', current, slowCounter);
      if (isCounter(current)) {
        let segment = bm.get('COUNTER_SEGMENT_ID', current);
        let digit = slowCounter % 10;
        let on = SEGMENT_TABLE[segment][digit] === 1;
        return bm.setMask('COUNTER_ON', next, on);
      } else {
        return next;
      }
    }
  }

  window.addEventListener(
    "load",
    () => window.registerAnimation("counter", initCounter, counter));

})();
