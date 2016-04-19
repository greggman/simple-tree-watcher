'use strict';

var debug;
try {
  debug = require('debug');
} catch (e) {
  debug = () => { return() => {}};  // eslint-disable-line
}

module.exports = debug;


