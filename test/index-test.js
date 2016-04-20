'use strict';

const debug = require('../lib/debug')('index-test');  // eslint-disable-line
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const SimpleTreeWatcher = require('../index.js');
const EventRecorder = require('../test-lib/event-recorder');
const TestFS = require('../test-lib/test-fs');

describe('SimpleTreeWatcher - basic', function() {

  // NOTE: We use the real filesystem because we need to test
  // across plaforms that it works on those actual platforms.
  // I'm too lazy to make a tmpdir with some modules so ...
  var tempDir = path.join(__dirname, "temp");
  var tempDir2 = path.join(__dirname, "temp2");
  var tempDir3 = path.join(__dirname, "temp/temp2");
  var newFiles;
  var newDirs;
  var initialContent = "abc";
  var newContent = "abcdef";
  var watcher;
  var recorder;
  var nameAtRoot = path.join(tempDir, "moo.txt");
  var nameOfSub = path.join(tempDir, "sub1", "sub3");
  var nameAtSub = path.join(nameOfSub, "moo3.txt");
  var timeout = 1000;
  var testFS = new TestFS();

  function notIn2(array1, array2) {
    var a2Set = new Set(array2);
    return array1.filter((elem) => {
      return !a2Set.has(elem);
    });
  }

  function diff(array1, array2) {
    return notIn2(array1, array2).concat(notIn2(array2, array1));
  }

  function wait(fn) {
    setTimeout(fn, timeout);
  }

  before(function(done) {
    testFS.makeFS(tempDir, {
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
    }, initialContent);
    done();
  });

  after(function(done) {
    watcher.close();
    testFS.cleanup();
    done();
  });

  function noMoreEvents() {
    if (recorder) {
      recorder.setCheck((e) => {
        assert.ok(false, 'no events should happen. got: "' + e.event + '" event for ' + e.name + (e.stat.isDirectory() ? ' directory' : (', size: ' + e.stat.size + (e.oldStat ? (', oldSize: ' + e.oldStat.size) : ''))));
      });
    }
  }

  beforeEach(function() {
    noMoreEvents();
    if (recorder) {
      recorder.clear();
    }
  });

  function getWatcherDir(dir, parent) {
    parent = parent || watcher;
    if (dir === "") {
      return parent;
    }
    var dirname = path.dirname(dir);
    if (dirname && dirname !== '.') {
      return getWatcherDir(dir.substr(dirname.length + 1), parent._dirs.get(dirname));
    } else {
      return parent._dirs.get(path.basename(dir));
    }
  }

  // yes I know these tests are dependent but it wasn't clear to me
  // at the time how to make them both simple and not be a pita
  it('reports existing files', (done) => {
    watcher = new SimpleTreeWatcher(tempDir);
    recorder = new EventRecorder(watcher);

    wait(() => {
      var added = new Map();
      var events = recorder.getEvents();
      events.forEach((e) => {
        switch (e.event) {
          case 'add':
            assert.ok(!added.has(e.name));
            added.set(e.name);
            break;
          case 'change':
            var addEvents = recorder.getEvents('add', e.name);
            assert.equal(addEvents.length, 1, 'there is one add event for a change event');
            assert.ok(addEvents[0].id < e.id, 'add event came first');
            break;
          default:
            assert.ok(false, "must be add or create");
            break;
        }
        if (e.stat.isDirectory()) {
          assert.ok(testFS.createdDirs.indexOf(e.name) >= 0, 'should be expected directory');
        } else {
          assert.ok(testFS.createdFiles.indexOf(e.name) >= 0, 'should be expected file');
          assert.equal(e.stat.size, initialContent.length);
        }
      });
      // -1 because the root is in the list
      assert.equal(added.size, testFS.createdDirs.length + testFS.createdFiles.length - 1);
      assert.ok(!added.has(tempDir));
      assert.equal(getWatcherDir("")._entries.size, 4);
      assert.equal(getWatcherDir("")._dirs.size, 1);
      assert.equal(getWatcherDir("sub1")._entries.size, 5);
      assert.equal(getWatcherDir("sub1")._dirs.size, 1);
      assert.equal(getWatcherDir("sub1/sub2")._entries.size, 5);
      assert.equal(getWatcherDir("sub1/sub2")._dirs.size, 0);
      noMoreEvents();
      done();
    });
  });

  it('reports file created to root', (done) => {
    // check we get create followed by optional change
    var receivedEvents = new Set();
    wait(() => {
      assert.ok(receivedEvents.has("create"), "must have created event");
      assert.equal(getWatcherDir("")._entries.size, 5);
      assert.equal(getWatcherDir("")._dirs.size, 1);
      noMoreEvents();
      done();
    });
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
    testFS.writeFile(nameAtRoot, initialContent);
  });

  it('reports file changed at root', (done) => {
    wait(() => {
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
    });
    testFS.writeFile(nameAtRoot, newContent);
  });

  it('reports file removed from root', (done) => {
    recorder.setCheck((e) => {
      assert.equal(e.event, 'remove', 'event is "remove"');
      assert.equal(e.name, nameAtRoot, 'name is ' + nameAtRoot);
      assert.equal(e.stat.size, newContent.length);
      noMoreEvents();
      wait(() => {
        assert.equal(getWatcherDir("")._entries.size, 4);
        assert.equal(getWatcherDir("")._dirs.size, 1);
        done();
      });
    });
    fs.unlinkSync(nameAtRoot);
  });

  it('reports added subfolder', (done) => {
    assert.equal(getWatcherDir("sub1")._entries.size, 5);
    // Windows adds change event for parent subfolder
    wait(() => {
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
    });
    testFS.mkdir(nameOfSub);
  });

  it('reports file added to subfolder', (done) => {
    assert.equal(getWatcherDir("sub1/sub3")._entries.size, 0);
    // OSX gets a created event for file
    // Windows gets a created event for file and a changed event for parent folder
    // Ubuntu gets a created event for file and a changed event for file
    wait(() => {
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
    });
    testFS.writeFile(nameAtSub, initialContent);
  });

  it('reports file changed at subfolder', (done) => {
    assert.equal(getWatcherDir("sub1/sub3")._entries.size, 1);
    // Check we got only change events
    wait(() => {
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
    });
    testFS.writeFile(nameAtSub, newContent);
  });

  it('reports file removed from subfolder', (done) => {
    assert.equal(getWatcherDir("sub1/sub3")._entries.size, 1);
    recorder.setCheck((e) => {
      assert.equal(e.event, 'remove', 'event is "remove"');
      assert.equal(e.name, nameAtSub, 'name is ' + nameAtSub);
      assert.equal(e.stat.size, newContent.length);
      wait(() => {
        noMoreEvents();
        assert.equal(getWatcherDir("sub1/sub3")._entries.size, 0);
        assert.equal(getWatcherDir("sub1/sub3")._dirs.size, 0);
        done();
      });
    });
    fs.unlinkSync(nameAtSub);
  });

  it('reports sub folder removed from subfolder', (done) => {
    assert.equal(getWatcherDir("sub1")._entries.size, 6);
    assert.equal(getWatcherDir("sub1")._dirs.size, 2);
    recorder.setCheck((e) => {
      assert.equal(e.event, 'remove', 'event is "remove"');
      assert.equal(e.name, nameOfSub, 'name is ' + nameOfSub);
      assert.ok(e.stat.isDirectory());
      wait(() => {
        noMoreEvents();
        assert.equal(getWatcherDir("sub1")._entries.size, 5);
        assert.equal(getWatcherDir("sub1")._dirs.size, 1);
        done();
      });
    });
    fs.rmdirSync(nameOfSub);
  });

  it('reports added existing subfolder in correct order', (done) => {
    var existingFiles = testFS.createdFiles.slice();
    var existingDirs  = testFS.createdDirs.slice();

    testFS.makeFS(tempDir2, {
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
    }, initialContent);

    wait(() => {
      newFiles = diff(existingFiles, testFS.createdFiles);
      newDirs = diff(existingDirs, testFS.createdDirs);
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
    });
    testFS.mv(tempDir2, tempDir3);
  });

  it('reports removed non-empty subfolder in correct order', (done) => {
    wait(() => {
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
    });
    testFS.mv(tempDir3, tempDir2);
  });

});

