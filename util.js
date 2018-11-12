"use strict";

function assert(val, message) {
  if (!val) {
    var m = "Assertion failed!"
    if (message) {
      m += "\n" + message;
    }
    throw m;
  }
}

