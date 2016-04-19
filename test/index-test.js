var debug;
try {
  debug = require('debug')('thewatcher-test');
} catch (e) {
  debug = () => {};  // eslint-disable-line
  debug = console.log.bind(console);  // eslint-disable-line
}
var assert     = require('assert');
var fs         = require('fs');
var path       = require('path');
var TheWatcher = require('../index.js');

describe('TheWatcher', function() {
  "use strict";

  // NOTE: We use the real filesystem because we need to test
  // across plaforms that it works on those actual platforms.
  // I'm too lazy to make a tmpdir with some modules so ...
  var tempDir = path.join(__dirname, "temp");
  var tempDir2 = path.join(__dirname, "temp2");
  var tempDir3 = path.join(__dirname, "temp/temp2");
  var createdFiles = [];
  var createdDirs = [];
  var newFiles;
  var newDirs;
  var initialContent = "abc";
  var newContent = "abcdef";
  var theWatcher;
  var recorder;
  var nameAtRoot = path.join(tempDir, "moo.txt");
  var nameOfSub = path.join(tempDir, "sub1", "sub3");
  var nameAtSub = path.join(nameOfSub, "moo3.txt");
  var timeout = 1000;

  function writeFile(path, content) {
    fs.writeFileSync(path, content, {encoding: "utf8"});
    createdFiles.push(path);
  }

  function mkdir(path) {
    fs.mkdirSync(path);
    createdDirs.push(path);
  }

  function makeFS(dirName, spec) {
    mkdir(dirName);
    spec.files.forEach((fileName) => {
      var fullPath = path.join(dirName, fileName);
      writeFile(fullPath, initialContent);
    });
    if (spec.dirs) {
      spec.dirs.forEach((dirSpec) => {
        makeFS(path.join(dirName, dirSpec.name), dirSpec);
      });
    }
  }

  function mv(src, dst) {
    debug("mv:", src, dst);
    fs.renameSync(src, dst);

    function subName(fileName) {
      var newPath = fileName;
      if (fileName.substr(0, src.length) === src) {
        newPath = dst + fileName.substr(src.length);
      }
      return newPath;
    }

    createdFiles = createdFiles.map(subName);
    createdDirs = createdDirs.map(subName);
  }

  function notIn2(array1, array2) {
    var a2Set = new Set(array2);
    return array1.filter((elem) => {
      return !a2Set.has(elem);
    });
  }

  function diff(array1, array2) {
    return notIn2(array1, array2).concat(notIn2(array2, array1));
  }

  before(function(done) {
    makeFS(tempDir, {
      files: [
        "foo.txt",
        "bar.js",
        ".foo",
      ],
      dirs: [
        {
          name: "sub1",
          files: [
            "foo2a.txt",
            "foo2b.txt",
            "bar2.js",
            ".foo2",
          ],
          dirs: [
            {
              name: "sub2",
              files: [
                "foo3a.txt",
                "foo3b.txt",
                "foo3c.txt",
                "bar3.js",
                ".foo3",
              ],
            },
          ],
        },
      ],
    });
    done();
  });

  after(function(done) {
    theWatcher.close();
    createdFiles.reverse().forEach(function(fileName) {
      if (fs.existsSync(fileName)) {
        fs.unlinkSync(fileName);
      }
    });
    createdDirs.reverse().forEach(function(fileName) {
      if (fs.existsSync(fileName)) {
        fs.rmdirSync(fileName);
      }
    });
    done();
  });

  function noMoreEvents() {
    recorder.setCheck((e) => {
      assert.ok(false, 'no events should happen. got: "' + e.event + '" event for ' + e.name + (e.stat.isDirectory() ? ' directory' : (', size: ' + e.stat.size + (e.oldStat ? (', oldSize: ' + e.oldStat.size) : ''))));
    });
  }

  beforeEach(function() {
    noMoreEvents();
    recorder.clear();
  });

  function getWatcherDir(dir, watcher) {
    watcher = watcher || theWatcher;
    if (dir === "") {
      return watcher;
    }
    var dirname = path.dirname(dir);
    if (dirname && dirname !== '.') {
      return getWatcherDir(dir.substr(dirname.length + 1), watcher._dirs.get(dirname));
    } else {
      return watcher._dirs.get(path.basename(dir));
    }
  }

  //function getWatcherEntry(fileName, watcher) {
  //  watcher = getWatcherDir(path.dirname(fileName));
  //  return watcher._entries.get(path.basename(dir));
  //}

  function Recorder() {
    var events;
    var checkFn;

    function record(event, name, stat, oldStat) {
      debug("event:", event, name, stat.size);
      var e = {
        event: event,
        name: name,
        stat: stat,
        oldStat: oldStat,
        id: events.length,
      };
      events.push(e);
      checkFn(e);
    }

    function clear() {
      events = [];
      checkFn = () => {};
    }

    function setCheck(fn) {
      checkFn = fn;
    }

    function getEvents(type, filename) {
      if (type && filename) {
        return events.filter(function(e) {
          return e.event === type && e.name === filename;
        });
      } else if (type) {
        return events.filter(function(e) {
          return e.event === type;
        });
      }
      return events;
    }

    function showEvents() {
      events.forEach((e) => {
        debug(e.id, e.event, e.name);
      });
    }

    this.clear = clear;
    this.getEvents = getEvents;
    this.record = record;
    this.setCheck = setCheck;
    this.showEvents = showEvents;

    clear();
  }

  recorder = new Recorder();

  // check tracking counts

  // yes I know these tests are dependent but it wasn't clear to me
  // at the time how to make them both simple and not be a pita
  it('reports existing files', function(done) {
    theWatcher = new TheWatcher(tempDir);
    theWatcher.on('add',    function(n, s, o) { recorder.record('add',    n, s, o); });  // eslint-disable-line
    theWatcher.on('create', function(n, s, o) { recorder.record('create', n, s, o); });  // eslint-disable-line
    theWatcher.on('change', function(n, s, o) { recorder.record('change', n, s, o); });  // eslint-disable-line
    theWatcher.on('remove', function(n, s, o) { recorder.record('remove', n, s, o); });  // eslint-disable-line

    setTimeout(() => {
      var added = new Map();
      var events = recorder.getEvents();
      events.forEach((e) => {
        assert.equal(e.event, 'add', 'event must be add');
        assert.ok(!added.has(e.name));
        added.set(e.name);
        if (e.stat.isDirectory()) {
          assert.ok(createdDirs.indexOf(e.name) >= 0, 'should be directory');
        } else {
          assert.ok(createdFiles.indexOf(e.name) >= 0, 'should be file');
          assert.equal(e.stat.size, initialContent.length);
        }
      });
      // -1 because the root is in the list
      assert.equal(added.size, createdDirs.length + createdFiles.length - 1);
      assert.ok(!added.has(tempDir));
      assert.equal(getWatcherDir("")._entries.size, 4);
      assert.equal(getWatcherDir("")._dirs.size, 1);
      assert.equal(getWatcherDir("sub1")._entries.size, 5);
      assert.equal(getWatcherDir("sub1")._dirs.size, 1);
      assert.equal(getWatcherDir("sub1/sub2")._entries.size, 5);
      assert.equal(getWatcherDir("sub1/sub2")._dirs.size, 0);
      noMoreEvents();
      done();
    }, timeout);
  });

  it('reports file created to root', function(done) {
    // check we get create followed by optional change
    var receivedEvents = new Set();
    setTimeout(() => {
      assert.ok(receivedEvents.has("create"), "must have created event");
      assert.equal(getWatcherDir("")._entries.size, 5);
      assert.equal(getWatcherDir("")._dirs.size, 1);
      noMoreEvents();
      done();
    }, timeout);
    recorder.setCheck((e) => {
      if (!receivedEvents.has('create')) {
        assert.equal(e.event, 'create', 'event is "create"');
      } else {
        assert.equal(e.event, 'change', 'event is "change"');
      }
      assert.ok(!receivedEvents.has(e.event), 'event recevied once');
      receivedEvents.add(e.event);
      assert.equal(e.name, nameAtRoot, 'name is ' + nameAtRoot);
      assert.equal(e.stat.size, initialContent.length);
    });
    writeFile(nameAtRoot, initialContent);
  });

  it('reports file changed at root', function(done) {
    setTimeout(() => {
      var events = recorder.getEvents();
      // Check we got only change events
      events.forEach((e) => {
        assert.equal(e.event, 'change', 'event is "change"');
        assert.equal(e.name, nameAtRoot, 'name is ' + nameAtRoot);
        assert.equal(e.stat.size, newContent.length);
      });
      assert.equal(getWatcherDir("")._entries.size, 5);
      assert.equal(getWatcherDir("")._dirs.size, 1);
      noMoreEvents();
      done();
    }, timeout);
    writeFile(nameAtRoot, newContent);
  });

  it('reports file removed from root', function(done) {
    recorder.setCheck((e) => {
      assert.equal(e.event, 'remove', 'event is "remove"');
      assert.equal(e.name, nameAtRoot, 'name is ' + nameAtRoot);
      assert.equal(e.stat.size, newContent.length);
      noMoreEvents();
      setTimeout(() => {
        assert.equal(getWatcherDir("")._entries.size, 4);
        assert.equal(getWatcherDir("")._dirs.size, 1);
        done();
      }, timeout);
    });
    fs.unlinkSync(nameAtRoot);
  });

  it('reports added subfolder', function(done) {
    assert.equal(getWatcherDir("sub1")._entries.size, 5);
    // Windows adds change event for parent subfolder
    setTimeout(() => {
      var createEvents = recorder.getEvents('create');
      assert.equal(createEvents.length, 1, "there is one create event");
      assert.equal(createEvents[0].name, nameOfSub, 'name is ' + nameOfSub);
      assert.ok(createEvents[0].stat.isDirectory());
      var changeEvents = recorder.getEvents('change');
      assert.equal(recorder.getEvents().length, createEvents.length + changeEvents.length, "there are only change and create events");
      if (changeEvents.length) {
        var parentPath = path.dirname(nameOfSub);
        assert.equal(changeEvents.length, 1, "there is only one create event");
        assert.equal(changeEvents[0].name, parentPath, 'name is ' + parentPath);
        assert.ok(changeEvents[0].stat.isDirectory());
      }

      assert.equal(getWatcherDir("sub1")._entries.size, 6);
      assert.equal(getWatcherDir("sub1")._dirs.size, 2);
      noMoreEvents();
      done();
    }, timeout);
    mkdir(nameOfSub);
  });

  it('reports file added to subfolder', function(done) {
    assert.equal(getWatcherDir("sub1/sub3")._entries.size, 0);
    // OSX gets a created event for file
    // Windows gets a created event for file and a changed event for parent folder
    // Ubuntu gets a created event for file and a changed event for file
    setTimeout(() => {
      assert.equal(recorder.getEvents('create').length, 1, "there's one create event");
      var events = recorder.getEvents();
      assert.ok(events.length <= 3, "there are at most 3 events");
      if (events.length > 1) {
        assert.equal(recorder.getEvents('change').length, events.length - 1, "other events are change");
        assert.ok(recorder.getEvents('create')[0].id <
                  recorder.getEvents('change')[0].id, "create event came first");
      }
      events.forEach((e) => {
        if (e.stat.isDirectory()) {
          assert.equal(e.name, nameOfSub, 'name is ' + nameOfSub);
        } else {
          assert.equal(e.name, nameAtSub, 'name is ' + nameAtSub);
          assert.equal(e.stat.size, initialContent.length);
        }
      });
      noMoreEvents();
      assert.equal(getWatcherDir("sub1/sub3")._entries.size, 1);
      assert.equal(getWatcherDir("sub1/sub3")._dirs.size, 0);
      done();
    }, timeout);
    writeFile(nameAtSub, initialContent);
  });

  it('reports file changed at subfolder', function(done) {
    assert.equal(getWatcherDir("sub1/sub3")._entries.size, 1);
    // Check we got only change events
    setTimeout(() => {
      var events = recorder.getEvents();
      events.forEach((e) => {
        assert.equal(e.event, 'change', 'event is "change"');
        assert.equal(e.name, nameAtSub, 'name is ' + nameAtSub);
        assert.equal(e.stat.size, newContent.length);
      });
      assert.equal(getWatcherDir("sub1/sub3")._entries.size, 1);
      assert.equal(getWatcherDir("sub1/sub3")._dirs.size, 0);
      noMoreEvents();
      done();
    }, timeout);
    writeFile(nameAtSub, newContent);
  });

  it('reports file removed from subfolder', function(done) {
    assert.equal(getWatcherDir("sub1/sub3")._entries.size, 1);
    recorder.setCheck((e) => {
      assert.equal(e.event, 'remove', 'event is "remove"');
      assert.equal(e.name, nameAtSub, 'name is ' + nameAtSub);
      assert.equal(e.stat.size, newContent.length);
      setTimeout(() => {
        noMoreEvents();
        assert.equal(getWatcherDir("sub1/sub3")._entries.size, 0);
        assert.equal(getWatcherDir("sub1/sub3")._dirs.size, 0);
        done();
      }, timeout);
    });
    fs.unlinkSync(nameAtSub);
  });

  it('reports sub folder removed from subfolder', function(done) {
    assert.equal(getWatcherDir("sub1")._entries.size, 6);
    assert.equal(getWatcherDir("sub1")._dirs.size, 2);
    recorder.setCheck((e) => {
      assert.equal(e.event, 'remove', 'event is "remove"');
      assert.equal(e.name, nameOfSub, 'name is ' + nameOfSub);
      assert.ok(e.stat.isDirectory());
      setTimeout(() => {
        noMoreEvents();
        assert.equal(getWatcherDir("sub1")._entries.size, 5);
        assert.equal(getWatcherDir("sub1")._dirs.size, 1);
        done();
      }, timeout);
    });
    fs.rmdirSync(nameOfSub);
  });

  it('reports added existing subfolder in correct order', function(done) {
    var existingFiles = createdFiles.slice();
    var existingDirs  = createdDirs.slice();

    makeFS(tempDir2, {
      files: [
        "foo-b.txt",
        "bar-b.js",
        ".foo-b",
      ],
      dirs: [
        {
          name: "sub1-b",
          files: [
            "foo2a-b.txt",
            "foo2b-b.txt",
          ],
        },
      ],
    });

    setTimeout(() => {
      newFiles = diff(existingFiles, createdFiles);
      newDirs = diff(existingDirs, createdDirs);
      assert.equal(newFiles.length, 5);
      assert.equal(newDirs.length, 2);

      var tempEvents = recorder.getEvents('create', tempDir3);
      assert.equal(tempEvents.length, 1, "there's an event for temp2");
      newFiles.forEach((fileName) => {
        var events = recorder.getEvents('create', fileName);
        assert.equal(events.length, 1, "there's one create event per file");
        assert.equal(events[0].stat.size, initialContent.length);
        assert.ok(events[0].id > tempEvents[0].id, "event came after subfolder");
        var parentEvents = recorder.getEvents('create', path.dirname(fileName));
        assert.equal(parentEvents.length, 1, "there's a create event for each parent");
        assert.ok(parentEvents[0].id < events[0].id, "parent was created before file");
      });
      newDirs.forEach((fileName) => {
        var events = recorder.getEvents('create', fileName);
        assert.equal(events.length, 1, "there's one create event per dir");
        assert.ok(events[0].stat.isDirectory());
        // use >= because tempDir3 is on the list
        assert.ok(events[0].id >= tempEvents[0].id, "event came after subfolder");
        if (events[0].id > tempEvents[0].id) {
          var parentEvents = recorder.getEvents('create', path.dirname(fileName));
          assert.equal(parentEvents.length, 1, "there's a create event for each parent");
          assert.ok(parentEvents[0].id < events[0].id, "parent was created before dir");
        }
      });
      noMoreEvents();
      done();
    }, timeout);
    mv(tempDir2, tempDir3);
  });

  it('reports removed non-empty subfolder in correct order', function(done) {
    setTimeout(() => {
      recorder.showEvents();
      var tempEvents = recorder.getEvents('remove', tempDir3);
      assert.equal(tempEvents.length, 1, "there's an event for temp2");
      newFiles.forEach((fileName) => {
        var events = recorder.getEvents('remove', fileName);
        assert.equal(events.length, 1, "there's one remove event per file");
        assert.equal(events[0].stat.size, initialContent.length);
        assert.ok(events[0].id < tempEvents[0].id, "event came before subfolder");
      });
      newDirs.forEach((fileName) => {
        var events = recorder.getEvents('remove', fileName);
        assert.equal(events.length, 1, "there's one remove event per dir");
        assert.ok(events[0].stat.isDirectory());
        // use >= because tempDir3 is on the list
        assert.ok(events[0].id <= tempEvents[0].id, "event came before subfolder");
      });
      noMoreEvents();
      done();
    }, timeout);
    mv(tempDir3, tempDir2);
  });

  it('ignores dot files', function(done) {
      done();
  });

  it('ignores globs', function(done) {
      done();
  });

  it('ignores regex', function(done) {
      done();
  });

  it('ignores functions', function(done) {
      done();
  });

});

