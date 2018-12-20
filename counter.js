"use strict";

(function () {
  let nsGlobal;
  const DECIMATION = 50;

  // Segments numbered clockwise from top, then the middle last.
  // This table tells whether the segment is on for a given digit.
  const SEGMENT_TABLE = [
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [1, 0, 1, 1, 0, 1, 1, 1, 1, 1],
    [1, 1, 1, 1, 1, 0, 0, 1, 1, 1],
    [1, 1, 0, 1, 1, 1, 1, 1, 1, 1],
    [1, 0, 1, 1, 0, 1, 1, 0, 1, 0],
    [1, 0, 1, 0, 0, 0, 1, 0, 1, 0],
    [1, 0, 0, 0, 1, 1, 1, 0, 1, 1],
    [0, 0, 1, 1, 1, 1, 1, 0, 1, 1]
  ]

  function initBitManager() {
    // Bits are 0xAABBGGRR because of endianness; TODO: Make endian-independent.
    nsGlobal = new Namespace();
    canvas.ns = nsGlobal;

    // Sentinel bits that determine type:
    nsGlobal.declare('COUNTER_COLOR', 2, 6);
    nsGlobal.declare('COUNTER_VISIBLE', 2, 30);
    nsGlobal.combine('COUNTER_ON', ['COUNTER_COLOR', 'COUNTER_VISIBLE'])
    nsGlobal.alloc('COUNTER_FLAG', 1);
    nsGlobal.alloc('COUNTER_BITS', 6);
    nsGlobal.alloc('COUNTER_SEGMENT_ID', 3);
    nsGlobal.declare('COUNTER_CHANGED', 3, 21);
    nsGlobal.combine('COUNTER_FLASH', ['COUNTER_CHANGED', 'COUNTER_VISIBLE'])
    nsGlobal.alloc('COUNTER_HIGH_DIGIT', 1);
    nsGlobal.alloc('STARTER_FLAG', 1);
    nsGlobal.alloc('STARTER_COUNTER_BITS', 7);
  }

  function isStarter (c) {
    return nsGlobal.STARTER_FLAG.isSet(c);
  }

  function isCounter (c) {
    return nsGlobal.COUNTER_FLAG.isSet(c);
  }

  function drawDigit(c, digitBit, x, y, l, w) {
    let color = nsGlobal.COUNTER_FLAG.getMask();
    color = nsGlobal.COUNTER_HIGH_DIGIT.set(color, digitBit);

    c.fillRect(nsGlobal.COUNTER_SEGMENT_ID.set(color, 1),
               x + w,
               y,
               l, w);
    c.fillRect(nsGlobal.COUNTER_SEGMENT_ID.set(color, 2),
               x + l + w,
               y + w,
               w, l);
    c.fillRect(nsGlobal.COUNTER_SEGMENT_ID.set(color, 3),
               x + l + w,
               y + 2 * w + l,
               w, l);
    c.fillRect(nsGlobal.COUNTER_SEGMENT_ID.set(color, 4),
               x + w,
               y + 2 * w + 2 * l,
               l, w);
    c.fillRect(nsGlobal.COUNTER_SEGMENT_ID.set(color, 5),
               x,
               y + 2 * w + l,
               w, l);
    c.fillRect(nsGlobal.COUNTER_SEGMENT_ID.set(color, 6),
               x,
               y + w,
               w, l);
    c.fillRect(nsGlobal.COUNTER_SEGMENT_ID.set(color, 7),
               x + w,
               y + w + l,
               l, w);
  }

  function initCounter(c, originX, originY, width, height) {
    initBitManager();

    c.fillRect(nsGlobal.COUNTER_FLAG.getMask(),
               originX, originY, width, height);
    c.fillRect(nsGlobal.STARTER_FLAG.getMask(), 3, 3, 1, 1);
    const TOP = 10;
    const LEFT = 5;
    const SEGMENT_LENGTH = 10;
    const SEGMENT_THICKNESS = 3;
    drawDigit(c, 1, LEFT, TOP, SEGMENT_LENGTH, SEGMENT_THICKNESS);
    drawDigit(c, 0, LEFT + 2 * SEGMENT_LENGTH, TOP,
              SEGMENT_LENGTH, SEGMENT_THICKNESS);
  }

  function counter(data, i, j) {
    let current = data[4];
    if (isStarter(current)) {
      let fastCounter = nsGlobal.STARTER_COUNTER_BITS.get(current);
      let slowCounter = nsGlobal.COUNTER_BITS.get(current);
      if (++fastCounter >= DECIMATION) {
        fastCounter = 0;
        ++slowCounter;
      }
      let next = nsGlobal.STARTER_COUNTER_BITS.set(current, fastCounter)
      // TODO: Watch out for non-counters when including this elsewhere.
      next = nsGlobal.COUNTER_BITS.set(next, slowCounter)
      return next;
    } else if (isCounter(current)) {
      let slowCounter = _(data)
        .map(c => nsGlobal.COUNTER_BITS.get(c))
        .max()
      let changed = nsGlobal.COUNTER_BITS.get(current) !== slowCounter;
      if (changed) {
        let segment = nsGlobal.COUNTER_SEGMENT_ID.get(current);
        let digit;
        if (nsGlobal.COUNTER_HIGH_DIGIT.isSet(current)) {
          digit = Math.floor((slowCounter + 0.5) / 10) % 10;
        } else {
          digit = slowCounter % 10;
        }
        let on = SEGMENT_TABLE[segment][digit] === 1;
        let next = nsGlobal.COUNTER_BITS.set(current, slowCounter);
        next = nsGlobal.COUNTER_ON.setMask(next, on);
        return nsGlobal.COUNTER_FLASH.setMask(next, true);
      }
      if (!nsGlobal.COUNTER_COLOR.isSet(current)) {
        return nsGlobal.COUNTER_FLASH.setMask(current, false);
      } else {
        return nsGlobal.COUNTER_CHANGED.setMask(current, false);
      }
    }
    return current;
  }

  registerAnimation("counter", 48, 44, initCounter, counter);

})();
