"use strict";

(function () {
  let nsScoreboard, isScoreboard;
  let baseColor, fullAlpha;
  let isSendingMessageDown;
  function initScoreboard(_nsScoreboard_, _baseColor_, _fullAlpha_,
      _isScoreboard_, _isSendingMessageDown_) {
    nsScoreboard = _nsScoreboard_;
    baseColor = _baseColor_; // the flags that make us a scoreboard pixel
    fullAlpha = _fullAlpha_; // the on alpha mask
    isScoreboard = _isScoreboard_;
    isSendingMessageDown = _isSendingMessageDown_;
    // Sentinel bits that determine type:
    nsScoreboard.declare('SCOREBOARD_COLOR', 2, 14);
    nsScoreboard.alloc('SCOREBOARD_HIGH_DIGIT', 1);
    nsScoreboard.alloc('SCOREBOARD_BITS', 6);
    nsScoreboard.alloc('SCOREBOARD_SEGMENT_ID', 3);
    nsScoreboard.declare('SCOREBOARD_CHANGED', 3, 20);

    window.drawScoreboard = drawScoreboard;
    window.handleScoreboard = handleScoreboard;
  }
  window.initScoreboard = initScoreboard;

  function drawDigit(c, digitBit, x, y, l, w) {
    let color = nsScoreboard.SCOREBOARD_HIGH_DIGIT.set(baseColor, digitBit);

    c.orRect(nsScoreboard.SCOREBOARD_SEGMENT_ID.set(color, 1),
             x + w,
             y,
             l, w);
    c.orRect(nsScoreboard.SCOREBOARD_SEGMENT_ID.set(color, 2),
             x + l + w,
             y + w,
             w, l);
    c.orRect(nsScoreboard.SCOREBOARD_SEGMENT_ID.set(color, 3),
             x + l + w,
             y + 2 * w + l,
             w, l);
    c.orRect(nsScoreboard.SCOREBOARD_SEGMENT_ID.set(color, 4),
             x + w,
             y + 2 * w + 2 * l,
             l, w);
    c.orRect(nsScoreboard.SCOREBOARD_SEGMENT_ID.set(color, 5),
             x,
             y + 2 * w + l,
             w, l);
    c.orRect(nsScoreboard.SCOREBOARD_SEGMENT_ID.set(color, 6),
             x,
             y + w,
             w, l);
    c.orRect(nsScoreboard.SCOREBOARD_SEGMENT_ID.set(color, 7),
             x + w,
             y + w + l,
             l, w);
  }

  function drawScoreboard(c, left, top, width, height) {
    let initValue = nsScoreboard.SCOREBOARD_BITS.set(baseColor, 8);
    c.fillRect(initValue, left, top, width, height);
    const SEGMENT_LENGTH =
      Math.floor(Math.min((width - 7) / 2,
                          (height - 5) / 2));
    const SEGMENT_THICKNESS = 1;
    drawDigit(c, 1, left + 1, top + 1, SEGMENT_LENGTH, SEGMENT_THICKNESS);
    drawDigit(c, 0, left + width - 3 - SEGMENT_LENGTH, top + 1,
              SEGMENT_LENGTH, SEGMENT_THICKNESS);
  }

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

  function handleScoreboard(data, x, y) {
    let current = data[4];
    assert(isScoreboard(current));
    let curValue = nsScoreboard.SCOREBOARD_BITS.get(current);
    let value = _(data)
      .map(c => isScoreboard(c) ? nsScoreboard.SCOREBOARD_BITS.get(c) : 0)
      .max()
    let changed = curValue !== value;
    if (isSendingMessageDown(data[1]) && !changed) {
      ++value;
      changed = true;
    }
    if (changed) {
      let segment = nsScoreboard.SCOREBOARD_SEGMENT_ID.get(current);
      let digit;
      if (nsScoreboard.SCOREBOARD_HIGH_DIGIT.isSet(current)) {
        digit = Math.floor((value + 0.5) / 10) % 10;
      } else {
        digit = value % 10;
      }
      let on = SEGMENT_TABLE[segment][digit] === 1;
      let next = nsScoreboard.SCOREBOARD_BITS.set(current, value);
      next = nsScoreboard.SCOREBOARD_COLOR.setMask(next, on);
      next = fullAlpha.setMask(next, true);
      return nsScoreboard.SCOREBOARD_CHANGED.setMask(next, true);
    }
    if (!nsScoreboard.SCOREBOARD_COLOR.isSet(current)) {
      let next = nsScoreboard.SCOREBOARD_CHANGED.setMask(current, false);
      return fullAlpha.setMask(next, false);
    } else {
      return nsScoreboard.SCOREBOARD_CHANGED.setMask(current, false);
    }
    return current;
  }

})();
