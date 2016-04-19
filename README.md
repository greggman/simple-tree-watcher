TheWatcher
==========

[![Build Status](https://travis-ci.org/greggman/thewatcher.svg?branch=master)](https://travis-ci.org/greggman/thewatcher)

Watches a directory tree for changes

Hopefully it actually works unlike other watch libaries

## Example:

```
const TheWatcher = require('./index');

var dir = process.argv[2];
console.log("watching: ", dir);

theWatcher = new TheWatcher(dir);
theWatcher.on('add',    function(f, s)     { show("add   :", f, s    ); });
theWatcher.on('create', function(f, s)     { show("create:", f, s    ); });
theWatcher.on('remove', function(f, s, s2) { show("remove:", f, s, s2); });
theWatcher.on('change', function(f, s)     { show("change:", f, s    ); });

function show(event, f, s, n) {
  console.log(event, f);
}
```

## Docs

create an instance of `TheWatcher` and attach events.

### Events

#### `'add'`

Emitted for every entry when you first start. Passed filename and stat

#### `'create'`

Emitted when an file or folder is created. Passed filename and stat

#### `'remove'`

Emitted when a file is deleted. Passed filename and last stat

#### `'change'`

Emitted when a file is change. Passed the filename, current stat, previous stat

### Options



## Platform Issues

Each platform behaves slightly different. In my testing

### OSX

Add a file get a `create` event for the file

### Windows

Add a file get a `create` event for the file and a `change` event for the parent folder

Also on Windows a watcher may hold a lock or temp lock on a folder.
I haven't tracked this down. In the tests I delete a subfolder
which internally I instantly get an `'EPERM'` error from the watcher
for that folder. I handle that case. But, at the end of the test
I delete all the test files. Those deletes failed unless I closed
the watcher.

### Linux

Add a file get both `create` event and a `change` event for the file


