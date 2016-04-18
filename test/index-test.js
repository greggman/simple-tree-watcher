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
  var createdFiles = [];
  var createdDirs = [];
  var initialContent = "abc";
  var newContent = "abcdef";
  var theWatcher;
  var recorder;
  var nameAtRoot = path.join(tempDir, "moo.txt");
  var nameOfSub = path.join(tempDir, "sub1", "sub3");
  var nameAtSub = path.join(nameOfSub, "moo3.txt");
  var extraTime = 200;

  function writeFile(path, content) {
    fs.writeFileSync(path, content, {encoding: "utf8"});
    createdFiles.push(path);
  }

  function mkdir(path) {
    fs.mkdirSync(path);
    createdDirs.push(path);
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
    createdFiles.reverse().forEach(function(fileName) {
      if (fs.existsSync(fileName)) {
        fs.unlinkSync(fileName);
      }
    });
    createdDirs.reverse().forEach(function(fileName) {
      if (fs.existsSync(fileName)) {
        fs.rmdirSync(fileName)  ;
      }
    });
    done();
  });

  function noMoreEvents() {
    recorder.setCheck((events) => {
      assert.ok(false, 'no events should happen');
    });
  }

  beforeEach(function() {
    noMoreEvents();
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

  function getWatcherEntry(fileName, watcher) {
    watcher = getWatcherDir(path.dirname(fileName));
    return watcher._entries.get(path.basename(dir));
  }

  function Recorder() {
    var events;
    var checkFn;

    clear();

    function record(event, name, stat, oldStat) {
console.log("event:", event, name);
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
    }

    function setCheck(fn) {
      checkFn = fn;
    }

    this.record = record;
    this.setCheck = setCheck;
  }

  recorder = new Recorder();

  // check tracking counts

  // yes I know these tests are dependent but it wasn't clear to me
  // at the time how to make them both simple and not be a pita
  it('reports existing files', function(done) {
    theWatcher = new TheWatcher(tempDir);
    theWatcher.on('add',    function(n, s, o) { recorder.record('add',    n, s, o); });
    theWatcher.on('create', function(n, s, o) { recorder.record('create', n, s, o); });
    theWatcher.on('change', function(n, s, o) { recorder.record('change', n, s, o); });
    theWatcher.on('remove', function(n, s, o) { recorder.record('remove', n, s, o); });

    var added = new Map();
    recorder.setCheck((e) => {
      assert.equal(e.event, 'add', 'event must be add');
      assert.ok(!added.has(e.name));
      added.set(e.name);
      if (e.stat.isDirectory()) {
        assert.ok(createdDirs.indexOf(e.name) >= 0, 'should be directory');
      } else {
        assert.ok(createdFiles.indexOf(e.name) >= 0, 'should be file');
        assert.equal(e.stat.size, initialContent.length);
      }

      if (added.size === createdDirs.length + createdFiles.length - 1) {
        // give it 1/2 a second more for bad events to come in.
        noMoreEvents();
        setTimeout(function() {
          assert.ok(!added.has(tempDir));
          assert.equal(getWatcherDir("")._entries.size, 4);
          assert.equal(getWatcherDir("")._dirs.size, 1);
          assert.equal(getWatcherDir("sub1")._entries.size, 5);
          assert.equal(getWatcherDir("sub1")._dirs.size, 1);
          assert.equal(getWatcherDir("sub1/sub2")._entries.size, 5);
          assert.equal(getWatcherDir("sub1/sub2")._dirs.size, 0);
          done();
        }, extraTime);
      }
    });
  });

  it('reports file created to root', function(done) {
    recorder.setCheck((e) => {
      assert.equal(e.event, 'create', 'event is "create"');
      assert.equal(e.name, nameAtRoot, 'name is ' + nameAtRoot);
      assert.equal(e.stat.size, initialContent.length);
      noMoreEvents();
      setTimeout(function() {
        assert.equal(getWatcherDir("")._entries.size, 5);
        assert.equal(getWatcherDir("")._dirs.size, 1);
        done();
      }, extraTime);
    });
    writeFile(nameAtRoot, initialContent);
  });

  it('reports file changed at root', function(done) {
    recorder.setCheck((e) => {
      assert.equal(e.event, 'change', 'event is "change"');
      assert.equal(e.name, nameAtRoot, 'name is ' + nameAtRoot);
      assert.equal(e.stat.size, newContent.length);
      noMoreEvents();
      setTimeout(function() {
        assert.equal(getWatcherDir("")._entries.size, 5);
        assert.equal(getWatcherDir("")._dirs.size, 1);
        done();
      }, extraTime);
    });
    writeFile(nameAtRoot, newContent);
  });

  it('reports file removed from root', function(done) {
    recorder.setCheck((e) => {
      assert.equal(e.event, 'remove', 'event is "remove"');
      assert.equal(e.name, nameAtRoot, 'name is ' + nameAtRoot);
      assert.equal(e.stat.size, newContent.length);
      noMoreEvents();
      setTimeout(function() {
        assert.equal(getWatcherDir("")._entries.size, 4);
        assert.equal(getWatcherDir("")._dirs.size, 1);
        done();
      }, extraTime);
    });
    fs.unlinkSync(nameAtRoot);
  });

  it('reports added subfolder', function(done) {
    assert.equal(getWatcherDir("sub1")._entries.size, 5);
    recorder.setCheck((e) => {
      assert.equal(e.event, 'create', 'event is "create"');
      assert.equal(e.name, nameOfSub, 'name is ' + nameOfSub);
      assert.ok(e.stat.isDirectory());
      setTimeout(function() {
        noMoreEvents();
        assert.equal(getWatcherDir("sub1")._entries.size, 6);
        assert.equal(getWatcherDir("sub1")._dirs.size, 2);
        done();
      }, extraTime);
    });
    mkdir(nameOfSub);
  });

  it('reports file added to subfolder', function(done) {
    assert.equal(getWatcherDir("sub1/sub3")._entries.size, 0);
    recorder.setCheck((e) => {
      assert.equal(e.event, 'create', 'event is "create"');
      assert.equal(e.name, nameAtSub, 'name is ' + nameAtSub);
      assert.equal(e.stat.size, initialContent.length);
      assert.ok(!e.stat.isDirectory());
      setTimeout(function() {
        noMoreEvents();
        assert.equal(getWatcherDir("sub1/sub3")._entries.size, 1);
        assert.equal(getWatcherDir("sub1/sub3")._dirs.size, 0);
        done();
      }, extraTime);
    });
    writeFile(nameAtSub, initialContent);
  });

  it('reports file changed at subfolder', function(done) {
    assert.equal(getWatcherDir("sub1/sub3")._entries.size, 1);
    recorder.setCheck((e) => {
      assert.equal(e.event, 'change', 'event is "change"');
      assert.equal(e.name, nameAtSub, 'name is ' + nameAtSub);
      assert.equal(e.stat.size, newContent.length);
      setTimeout(function() {
        noMoreEvents();
        assert.equal(getWatcherDir("sub1/sub3")._entries.size, 1);
        assert.equal(getWatcherDir("sub1/sub3")._dirs.size, 0);
        done();
      }, extraTime);
    });
    writeFile(nameAtSub, newContent);
  });

  it('reports file removed from subfolder', function(done) {
    assert.equal(getWatcherDir("sub1/sub3")._entries.size, 1);
    recorder.setCheck((e) => {
      assert.equal(e.event, 'remove', 'event is "remove"');
      assert.equal(e.name, nameAtSub, 'name is ' + nameAtSub);
      assert.equal(e.stat.size, newContent.length);
      setTimeout(function() {
        noMoreEvents();
        assert.equal(getWatcherDir("sub1/sub3")._entries.size, 0);
        assert.equal(getWatcherDir("sub1/sub3")._dirs.size, 0);
        done();
      }, extraTime);
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
      setTimeout(function() {
        noMoreEvents();
        assert.equal(getWatcherDir("sub1")._entries.size, 5);
        assert.equal(getWatcherDir("sub1")._dirs.size, 1);
        done();
      }, extraTime);
    });
    fs.rmdirSync(nameOfSub);
  });

  it('reports added existing subfolder in correct order', function(done) {
      done();
  });

  it('reports removed non-empty subfolder in correct order', function(done) {
      done();
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

});

