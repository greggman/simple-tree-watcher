'use strict';

const debug = require('./lib/debug')('thewatcher');
const fs = require('fs');
const EventEmitter = require('events');
const path = require('path');

function shallowCopy(src) {
  var dst = {};
  Object.keys(src).forEach((key) => {
    dst[key] = src[key];
  });
  return dst;
}

// Should I add option to normalize path (as in always "/" never "\"?

class TheWatcher extends EventEmitter {
  constructor(filePath, options) {
    super();
    options = shallowCopy(options || {});
    options.addOrCreate = options.addOrCreate || 'add';
    this._entries = new Map();
    this._dirs = new Map();
    this._filePath = filePath;
    this._options = options;
    this._filter = options.filter || this._pass;

    process.nextTick(this._start.bind(this));
  }

  close() {
    if (this._closed) {
      return;
    }
    this._watcher.removeListener('change', this._changeListener);
    this._watcher.removeListener('error', this._errorListener);
    this._dirs.forEach((theWatcher) => {
      theWatcher.close();
    });
    this._watcher.close();
    this._watcher = null;
    // I hope there's no queued events.
    this._entries = null;
    this._dirs = null;
    this._closed = true;
  }

  _start() {
    // because this is async we mind be closed before this fires
    if (this._closed) {
      return;
    }
    var proto = Object.getPrototypeOf(this);
    this._changeListener = proto._onChange.bind(this);
    this._errorListener = proto._onError.bind(this);
    this._watcher = fs.watch(this._filePath, this._options);
    this._watcher.on('change', this._changeListener);
    this._watcher.on('error', this._errorListener);
    this._scan(this._options.addOrCreate);
  }

  _onChange(event, filename) {
    debug("ONCHANGE:", event, filename);
    if (!filename) {
      // it's going to be slow but what can we do?
      _scan();
    } else {
      switch (event) {
        case 'rename': // happens
          this._checkFile(filename);
          break;
        case 'change':
          this._checkFile(filename);
          break;
        default:
          throw 'should never get here';
      }
    }
  }

  _onError(err) {
    debug("ONERROR:", this._filePath);
    // not really sure what errors to check for here
    if (err.code === 'EPERM') {
      this._removeAll();
    } else {
      throw err;
    }
  }

  _scan(addOrCreate) {
    fs.readdir(this._filePath, (err, fileNames) => {
      // because this is async we might be closed when this fires
      if (this._closed) {
        return;
      }
      if (err) {
        this.emit('error', 'error ' + err + ': ' + filePath);
      } else {
        fileNames = fileNames.filter((fileName) => {
          return this._filter(path.join(this._filePath, fileName));
        });
        // Check removed
        this._entries.forEach((state, entryPath) => {
          if (fileNames.indexOf(entryPath) < 0) {
            this.emit('remove', entryPath, stat);
          }
        });

        fileNames.forEach((fileName) => {
          this._checkFile(fileName, addOrCreate);
        });
      }
    });
  }

  _checkFile(fileName, addOrCreate) {
    // how am I getting here if this is done? Looks like I'm getting notification for self.?
    if (this._closed) {
      debug("_checkFileC called after closed!??!");
      return;
    }
    addOrCreate = addOrCreate || 'create';
    var fullPath = path.join(this._filePath, fileName);
    fs.stat(fullPath, (err, stats) => {
      // Because this is async we might be closed when this gets back
      if (this._closed) {
        return;
      }
      var oldStats = this._entries.get(fileName);
      var oldDir = this._dirs.get(fileName);
      if (err) {
        // TODO: check for type of error?
        if (oldStats) {
          this._entries.delete(fileName);
          if (oldDir) {
            oldDir._removeAll();
            this._dirs.delete(fileName);
          }
          this.emit('remove', fullPath, oldStats);
        }
      } else {
        this._entries.set(fileName, stats);
        var scan = false;
        if (oldStats) {
          if (oldStats.size !== stats.size ||
              oldStats.mtime !== stats.mtime) {
            this.emit('change', fullPath, stats, oldStats);
          }
        } else {
          this.emit(addOrCreate, fullPath, stats);
          scan = true;
        }
        if (scan && stats.isDirectory()) {
          var options = shallowCopy(this._options);
          options.addOrCreate = addOrCreate;
          var watcher = new TheWatcher(fullPath, options);
          ['add', 'create', 'remove', 'change'].forEach((event) => {
            // We need arguments so we can't use => and ... is not yet supported
            watcher.on(event, function() {
              this._propogateEvent(event, arguments);
            }.bind(this));
          });
          this._dirs.set(fileName, watcher);
        }
      }
    });
  }

  _removeAll() {
    debug("REMOVEALL:", this._filePath);
    if (this._closed) {
      return;
    }
    // first files
    this._dirs.forEach((watcher) => {
      watcher._removeAll();
    });
    this._entries.forEach((stats, fileName) => {
      this.emit('remove', path.join(this._filePath, fileName), stats);
    });
    this.close();
  }

  _propogateEvent(event, args) {
    // args! :(
    this.emit.call(this, event, args[0], args[1], args[2], args[3]);
  }

  _pass() {
    return true;
  }
}

module.exports = TheWatcher;

