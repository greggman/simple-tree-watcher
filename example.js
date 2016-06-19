const SimpleTreeWatcher = require('./index');

var dir = process.argv[2];
console.log("watching: ", dir);

var watcher = new SimpleTreeWatcher(dir);
watcher.on('add',    function(f, s)     { show("add   :", f, s    ); });
watcher.on('create', function(f, s)     { show("create:", f, s    ); });
watcher.on('remove', function(f, s, s2) { show("remove:", f, s, s2); });
watcher.on('change', function(f, s)     { show("change:", f, s    ); });

function show(event, filename, stat, oldStat) {
  console.log(event, filename, stat.isDirectory() ? "dir" : "file");
}


