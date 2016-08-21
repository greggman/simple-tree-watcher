'use strict';
const path = require('path');

function FileRecorder(watcher, rootDir) {

  function makeDir() {
    return {
      entries: new Map(),
      dirs: new Map(),
    };
  }

  var root = makeDir();

  function getDirAndName(n) {
    n = n.replace(/\//g, '/');
    var parts = n.split('/');

    var dir = root;
    for (var i = 0; i < parts.length - 1; ++i) {
      var name = parts[i];
      var subDir = dir.dirs.get(name);
      if (!subDir) {
        throw ("no dir:" + n);
      }
      dir = subDir;
    }

    return {
      dir: dir,
      name: parts[parts.length - 1],
    };
  }

  function getDirAndNameFromRoot(n) {
    return getDirAndName(path.relative(rootDir, n));
  }

  function getDir(dir) {
    if (dir === '') {
      return root;
    }
    const dirName = getDirAndName(dir + '/dummy');
    return dirName.dir;
  }

  function add(n, s) {
    var dirName = getDirAndNameFromRoot(n);
    var dir = dirName.dir;
    var name = dirName.name;
    dir.entries.set(name, s);
    if (s.isDirectory()) {
      dir.dirs.set(name, makeDir());
    }
  }

  function update(n, s) {
    var dirName = getDirAndNameFromRoot(n);
    var dir = dirName.dir;
    var name = dirName.name;
    dir.entries.set(name, s);
  }

  function remove(n) {
    var dirName = getDirAndNameFromRoot(n);
    var dir = dirName.dir;
    var name = dirName.name;
    dir.entries.delete(name);
    dir.dirs.delete(name);
  }

  watcher.on('add', add);
  watcher.on('create', add);
  watcher.on('change', update);
  watcher.on('remove', remove);

  this.getDir = getDir;
}

module.exports = FileRecorder;


