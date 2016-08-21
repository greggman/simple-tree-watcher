'use strict';

const debug = require('./lib/debug')('simple-tree-watcher');
const fs = require('fs');
const EventEmitter = require('events');
const path = require('path');
const SimpleFolderWatcher = require('simple-folder-watcher');

function shallowCopy(src) {
  var dst = {};
  Object.keys(src).forEach((key) => {
    dst[key] = src[key];
  });
  return dst;
}

// Should I add option to normalize path (as in always "/" never "\"?

class SimpleTreeWatcher extends EventEmitter {
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
    this._watcher.removeListener('add', this._addListener);
    this._watcher.removeListener('create', this._createListener);
    this._watcher.removeListener('change', this._changeListener);
    this._watcher.removeListener('remove', this._removeListener);
    this._dirs.forEach((watcher) => {
      watcher.close();
    });
    this._watcher.close();
    this._watcher = null;
    // I hope there's no queued events.
    this._dirs = null;
    this._entries = null;
    this._closed = true;
  }

  _start() {
    // because this is async we might be closed before this fires
    if (this._closed) {
      return;
    }
    var proto = Object.getPrototypeOf(this);
    this._addListener = proto._onAdd.bind(this);
    this._createListener = proto._onCreate.bind(this);
    this._changeListener = proto._onChange.bind(this);
    this._removeListener = proto._onRemove.bind(this);
    this._watcher = new SimpleFolderWatcher(this._filePath, this._options);
    this._watcher.on('add', this._addListener);
    this._watcher.on('create', this._createListener);
    this._watcher.on('change', this._changeListener);
    this._watcher.on('remove', this._removeListener);
  }

  _onAdd(fileName, stat) {
    debug("ONADD:", fileName, stat);
    this.emit('add', fileName, stat);
    this._addFile(fileName, stat);
  }

  _onCreate(fileName, stat) {
    debug("ONCREATE:", fileName, stat);
    this.emit('create', fileName, stat);
    this._addFile(fileName, stat, true);
  }

  _onChange(fileName, stat) {
    debug("ONCHANGE:", fileName, stat);
    this._entries.set(fileName, stat);
    this.emit('change', fileName, stat);
  }

  _onRemove(fileName, stat) {
    debug("ONREMOVE:", fileName, stat);
    if (stat.isDirectory()) {
      var oldDir = this._dirs.get(fileName);
      if (oldDir) {
        oldDir._removeAll();
        this._dirs.delete(fileName);
      }
    }
    this._entries.delete(fileName);
    this.emit('remove', fileName, stat);
  }

  _addFile(fileName, stat, useCreateForAdd) {
    this._entries.set(fileName, stat);
    if (stat.isDirectory()) {
      var fullPath = fileName; // path.join(this._filePath, fileName);
      var watcher = new SimpleTreeWatcher(fullPath, this._options);
      ['add', 'create', 'remove', 'change'].forEach((event) => {
        // We need arguments so we can't use => and ... is not yet supported
        const sendEvent = (event === 'add' && useCreateForAdd) ? 'create' : event;
        watcher.on(event, function() {
          this._propogateEvent(sendEvent, arguments);
        }.bind(this));
      });
      this._dirs.set(fileName, watcher);
    }
  }

  _removeAll() {
    debug("REMOVEALL:", this._filePath);
    if (this._closed) {
      return;
    }
    this._dirs.forEach((watcher) => {
      watcher._removeAll();
    });
    this._entries.forEach((stats, fileName) => {
      this.emit('remove', path.join(fileName), stats);
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

module.exports = SimpleTreeWatcher;

