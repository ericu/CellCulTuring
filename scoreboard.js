"use strict";

(function () {
  let nsScoreboard, isScoreboard;
  let scoreboardColor, fullAlpha;
  let isSendingMessageDown, isSignallingGameOver;
  function initScoreboard(_nsScoreboard_, _scoreboardColor_, _fullAlpha_,
      _isScoreboard_, _isSendingMessageDown_, _isSignallingGameOver_,
      obviousColors) {
    nsScoreboard = _nsScoreboard_;
    scoreboardColor = _scoreboardColor_;
    fullAlpha = _fullAlpha_; // the on alpha mask
    isScoreboard = _isScoreboard_;
    isSendingMessageDown = _isSendingMessageDown_;
    isSignallingGameOver = _isSignallingGameOver_;
    nsScoreboard.declare('SCOREBOARD_COLOR', 2, 22);
    if (obviousColors) {
      nsScoreboard.declare('SCOREBOARD_CHANGED', 3, 4);
      nsScoreboard.declare('SCOREBOARD_SEGMENT_ID', 3, 10);
    } else {
      nsScoreboard.declare('SCOREBOARD_SEGMENT_ID', 3, 0);
      nsScoreboard.declare('SCOREBOARD_CHANGED', 1, 25);
    }
    nsScoreboard.alloc('SCOREBOARD_BITS', 5);
    nsScoreboard.declare('SCOREBOARD_HIGH_DIGIT', 1, 24);
  }
  window.initScoreboard = initScoreboard;

  function drawDigit(c, digitBit, x, y, l, w) {
    let value = 0;
    let onMask = bm.or([nsScoreboard.SCOREBOARD_COLOR.getMask(),
                        fullAlpha.getMask()]);
    let baseColor =
      nsScoreboard.SCOREBOARD_HIGH_DIGIT.set(scoreboardColor, digitBit);
    baseColor = nsScoreboard.SCOREBOARD_BITS.set(baseColor, value);

    let color, on;

    on = isSegmentOn(digitBit, 1, value);
    color = nsScoreboard.SCOREBOARD_COLOR.setMask(baseColor, on);
    color = fullAlpha.setMask(color, on);
    c.orRect(nsScoreboard.SCOREBOARD_SEGMENT_ID.set(color, 1),
             x + w,
             y,
             l, w);
    on = isSegmentOn(digitBit, 2, value);
    color = nsScoreboard.SCOREBOARD_COLOR.setMask(baseColor, on);
    color = fullAlpha.setMask(color, on);
    c.orRect(nsScoreboard.SCOREBOARD_SEGMENT_ID.set(color, 2),
             x + l + w,
             y + w,
             w, l);
    on = isSegmentOn(digitBit, 3, value);
    color = nsScoreboard.SCOREBOARD_COLOR.setMask(baseColor, on);
    color = fullAlpha.setMask(color, on);
    c.orRect(nsScoreboard.SCOREBOARD_SEGMENT_ID.set(color, 3),
             x + l + w,
             y + 2 * w + l,
             w, l);
    on = isSegmentOn(digitBit, 4, value);
    color = nsScoreboard.SCOREBOARD_COLOR.setMask(baseColor, on);
    color = fullAlpha.setMask(color, on);
    c.orRect(nsScoreboard.SCOREBOARD_SEGMENT_ID.set(color, 4),
             x + w,
             y + 2 * w + 2 * l,
             l, w);
    on = isSegmentOn(digitBit, 5, value);
    color = nsScoreboard.SCOREBOARD_COLOR.setMask(baseColor, on);
    color = fullAlpha.setMask(color, on);
    c.orRect(nsScoreboard.SCOREBOARD_SEGMENT_ID.set(color, 5),
             x,
             y + 2 * w + l,
             w, l);
    on = isSegmentOn(digitBit, 6, value);
    color = nsScoreboard.SCOREBOARD_COLOR.setMask(baseColor, on);
    color = fullAlpha.setMask(color, on);
    c.orRect(nsScoreboard.SCOREBOARD_SEGMENT_ID.set(color, 6),
             x,
             y + w,
             w, l);
    on = isSegmentOn(digitBit, 7, value);
    color = nsScoreboard.SCOREBOARD_COLOR.setMask(baseColor, on);
    color = fullAlpha.setMask(color, on);
    c.orRect(nsScoreboard.SCOREBOARD_SEGMENT_ID.set(color, 7),
             x + w,
             y + w + l,
             l, w);
  }

  function drawScoreboard(c, left, top, width, height) {
    c.fillRect(scoreboardColor, left, top, width, height);
    const SEGMENT_LENGTH =
      Math.floor(Math.min((width - 7) / 2,
                          (height - 5) / 2));
    const SEGMENT_THICKNESS = 1;
    drawDigit(c, 1, left + 1, top + 1, SEGMENT_LENGTH, SEGMENT_THICKNESS);
    drawDigit(c, 0, left + width - 3 - SEGMENT_LENGTH, top + 1,
              SEGMENT_LENGTH, SEGMENT_THICKNESS);
  }
  window.drawScoreboard = drawScoreboard;

  // Use the middle segment to write the words, cheating value so that the
  // increment turns it on.  Note that there can be display issues if
  // GAME_OVER_SCORE is near the value used.
  const SCOREBOARD_GAME_OVER_PREP_VALUE = 27;
  function drawGameOver(c, left, top, width, height) {
    const MESSAGE = [
       " XX    XX   XX   XX  XXXX",
       "X     X  X  X X X X  X   ",
       "X XX  XXXX  X  X  X  XXX ",
       "X  X  X  X  X     X  X   ",
       " XX   X  X  X     X  XXXX",
       "                         ",
       "  XX   X   X  XXXX  XXX  ",
       " X  X  X   X  X     X  X ",
       " X  X   X X   XXX   XXX  ",
       " X  X   X X   X     X  X ",
       "  XX     X    XXXX  X  X "];

    let color =
      nsScoreboard.SCOREBOARD_BITS.set(scoreboardColor,
                                       SCOREBOARD_GAME_OVER_PREP_VALUE);
    let fgColor = nsScoreboard.SCOREBOARD_SEGMENT_ID.set(color, 7);
    fgColor = nsScoreboard.SCOREBOARD_HIGH_DIGIT.set(fgColor, 1);
    let key = {
      ' ' : color,
      'X': fgColor
    };
    let messageWidth = MESSAGE[0].length;
    c.fillRect(color, left, top, width, height);
    left += Math.floor((width - messageWidth) / 2);
    c.fillBitmap(left, top, MESSAGE, key);
  }
  window.drawGameOver = drawGameOver;

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

  function isSegmentOn(highDigit, segment, value) {
    let digit;
    if (highDigit) {
      digit = Math.floor((value + 0.5) / 10) % 10;
      if (!digit) { // high digit never shows a zero
        return false;
      }
    } else {
      digit = value % 10;
    }
    return SEGMENT_TABLE[segment][digit] === 1;
  }

  function handleScoreboard(data, x, y) {
    let current = data[4];
    assert(isScoreboard(current));
    let curValue = nsScoreboard.SCOREBOARD_BITS.get(current);
    let value = _(data)
      .map(c => isScoreboard(c) ? nsScoreboard.SCOREBOARD_BITS.get(c) : 0)
      .max()
    let changed = curValue !== value;
    if (!changed && (isSendingMessageDown(data[1]) ||
                     ((curValue === SCOREBOARD_GAME_OVER_PREP_VALUE) &&
                      (isSignallingGameOver(data[3]) ||
                       isSignallingGameOver(data[5]))))) {
      ++value;
      changed = true;
    }
    if (changed) {
      let segment = nsScoreboard.SCOREBOARD_SEGMENT_ID.get(current);
      let highDigit = nsScoreboard.SCOREBOARD_HIGH_DIGIT.isSet(current);
      let on = isSegmentOn(highDigit, segment, value);
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
  window.handleScoreboard = handleScoreboard;

/*
 XX   X  X   X XXX   X  X   X XXX XX 
X    X X XX XX X    X X X   X X   X X
X XX XXX X X X XXX  X X  X X  XXX XX 
X  X X X X   X X    X X  X X  X   X X
 XX  X X X   X XXX   X    X   XXX X X
 */

})();
